/**
 * High-level on-chain actions used by the UI. Each builds instructions with
 * the program client and submits them through `sendAndConfirm`, so every one
 * requires the user's explicit wallet approval. Each re-reads authoritative
 * state from chain before building, and refreshes after any outcome.
 */
import type { Connection, PublicKey } from '@solana/web3.js'
import {
  acceptOfferIxs,
  cancelListingIx,
  closeExpiredIx,
  createListingIx,
  fetchBond,
  fetchCharities,
  fetchEntitlement,
  fetchListing,
  fetchOffer,
  offerPda,
  placeOfferIx,
  postBondIx,
  releaseBondIx,
  withdrawOfferIx,
  type ProgramStatus,
} from '@/solana/program/client'
import { fitTitle, type EntitlementAccount } from '@/solana/program/codec'
import { PROGRAM_ERRORS } from '@/solana/program/constants'
import { offerExpired, validateBond, validateListing, validateOffer } from '@/solana/program/pricing'
import { sendAndConfirm, type SendDeps, type SigningWallet, type TxFailure, type TxPhase, type TxResult } from '@/solana/tx'

interface Common {
  connection: SendDeps['connection'] & Pick<Connection, 'getAccountInfo'>
  wallet: SigningWallet
  program: ProgramStatus
  onPhase?: (p: TxPhase, sig?: string) => void
  refresh: () => Promise<unknown>
}

const fail = (failure: TxFailure): TxResult => ({ ok: false, failure })
const programFail = (code: string): TxResult =>
  fail({ kind: 'program', programError: code, message: PROGRAM_ERRORS.find(([n]) => n === code)?.[1] ?? code })

function ready(p: Common): (Common & { program: Extract<ProgramStatus, { kind: 'ready' }> }) | TxResult {
  if (p.program.kind !== 'ready') {
    return fail({
      kind: 'unknown',
      message:
        p.program.kind === 'not-deployed'
          ? 'The StratX auction program is not deployed on this cluster.'
          : 'The auction program is deployed but its config has not been initialised.',
    })
  }
  if (!p.wallet.publicKey) return fail({ kind: 'wallet', message: 'Sign in or connect a wallet first.' })
  return p as Common & { program: Extract<ProgramStatus, { kind: 'ready' }> }
}
const isResult = (x: unknown): x is TxResult => typeof x === 'object' && x !== null && 'ok' in x

export interface CreateListingInput {
  strategyId: string
  title: string
  askPrice: bigint
  minOffer: bigint
  endTs: number
  accessTermDays: number
}

export async function createListing(p: Common & { input: CreateListingInput; nowSec: number }): Promise<TxResult & { listingId?: bigint }> {
  const c = ready(p)
  if (isResult(c)) return c
  const err = validateListing({ ...p.input, now: Math.floor(p.nowSec) })
  if (err) return programFail(err)
  const listingId = BigInt(Date.now())
  const ix = createListingIx(
    {
      seller: c.wallet.publicKey!,
      listingId,
      strategyId: p.input.strategyId,
      title: fitTitle(p.input.title),
      askPrice: p.input.askPrice,
      minOffer: p.input.minOffer,
      endTs: BigInt(p.input.endTs),
      accessTermDays: p.input.accessTermDays,
    },
    c.program.programId,
  )
  const res = await sendAndConfirm({ connection: p.connection, wallet: p.wallet, instructions: [ix], onPhase: p.onPhase })
  await p.refresh()
  return { ...res, listingId }
}

/** Places an escrowed offer. Re-reads the listing first; never trusts cached UI state. */
export async function placeOffer(p: Common & { listing: PublicKey; amount: bigint; expiresAt: number; nowSec: number }): Promise<TxResult> {
  const c = ready(p)
  if (isResult(c)) return c
  const l = await fetchListing(p.connection as Connection, p.listing, c.program.programId)
  if (!l) return fail({ kind: 'unknown', message: 'Auction not found on-chain.' })
  if (l.status !== 'open' || Math.floor(p.nowSec) >= Number(l.endTs)) {
    await p.refresh()
    return programFail(l.status !== 'open' ? 'ListingNotOpen' : 'ListingEnded')
  }
  const err = validateOffer({ amount: p.amount, minOffer: l.minOffer, expiresAt: p.expiresAt, listingEndTs: Number(l.endTs), now: Math.floor(p.nowSec) })
  if (err) return programFail(err)
  const ix = placeOfferIx(
    { listing: p.listing, bidder: c.wallet.publicKey!, mint: c.program.config.usdcMint, amount: p.amount, expiresAt: BigInt(p.expiresAt) },
    c.program.programId,
  )
  const res = await sendAndConfirm({ connection: p.connection, wallet: p.wallet, instructions: [ix], onPhase: p.onPhase })
  await p.refresh()
  return res
}

/**
 * Seller accepts one offer. Re-reads the offer and passes its exact amount as
 * `expected_amount`, so a swapped offer is rejected on-chain.
 */
export async function acceptOffer(
  p: Common & { listing: PublicKey; bidder: PublicKey; shownAmount: bigint; nowSec: number },
): Promise<TxResult & { entitlement?: EntitlementAccount | null }> {
  const c = ready(p)
  if (isResult(c)) return c
  const [l, o] = await Promise.all([
    fetchListing(p.connection as Connection, p.listing, c.program.programId),
    fetchOffer(p.connection as Connection, offerPda(p.listing, p.bidder, c.program.programId), c.program.programId),
  ])
  if (!l || l.status !== 'open') {
    await p.refresh()
    return programFail('ListingNotOpen')
  }
  if (!c.wallet.publicKey!.equals(l.seller)) return programFail('Unauthorized')
  if (!o) {
    await p.refresh()
    return fail({ kind: 'unknown', message: 'This offer was withdrawn.' })
  }
  if (o.amount !== p.shownAmount) {
    await p.refresh()
    return programFail('OfferAmountMismatch')
  }
  if (offerExpired(Number(o.expiresAt), Number(l.endTs), Math.floor(p.nowSec))) return programFail('OfferExpired')

  const ixs = acceptOfferIxs(
    {
      listing: p.listing,
      seller: c.wallet.publicKey!,
      bidder: p.bidder,
      feeRecipient: c.program.config.feeRecipient,
      mint: c.program.config.usdcMint,
      expectedAmount: o.amount,
    },
    c.program.programId,
  )
  const res = await sendAndConfirm({ connection: p.connection, wallet: p.wallet, instructions: ixs, onPhase: p.onPhase })
  await p.refresh()
  if (!res.ok) return res
  return { ...res, entitlement: await fetchEntitlement(p.connection as Connection, p.listing, c.program.programId) }
}

/** Withdraw your own offer, or trigger a refund to its bidder once refunds are open. */
export async function withdrawOffer(p: Common & { listing: PublicKey; bidder: PublicKey }): Promise<TxResult> {
  const c = ready(p)
  if (isResult(c)) return c
  const ix = withdrawOfferIx({ listing: p.listing, bidder: p.bidder, actor: c.wallet.publicKey!, mint: c.program.config.usdcMint }, c.program.programId)
  const res = await sendAndConfirm({ connection: p.connection, wallet: p.wallet, instructions: [ix], onPhase: p.onPhase })
  await p.refresh()
  return res
}

export interface PostBondInput {
  strategyId: string
  amount: bigint
  lockDays: number
  charityIndex: number
}

/** Quant locks USDC behind a strategy's published results. Re-reads the charity list and existing bond first. */
export async function postBond(p: Common & { input: PostBondInput }): Promise<TxResult> {
  const c = ready(p)
  if (isResult(c)) return c
  const err = validateBond(p.input)
  if (err) return programFail(err)
  const conn = p.connection as Connection
  const [charities, existing] = await Promise.all([
    fetchCharities(conn, c.program.programId),
    fetchBond(conn, c.wallet.publicKey!, p.input.strategyId, c.program.programId),
  ])
  if (!charities[p.input.charityIndex]) return programFail('InvalidCharity')
  if (existing) {
    await p.refresh()
    return fail({ kind: 'unknown', message: 'You already posted a bond for this strategy.' })
  }
  const ix = postBondIx({ quant: c.wallet.publicKey!, mint: c.program.config.usdcMint, ...p.input }, c.program.programId)
  const res = await sendAndConfirm({ connection: p.connection, wallet: p.wallet, instructions: [ix], onPhase: p.onPhase })
  await p.refresh()
  return res
}

/** Quant takes their bond back after the lock period. */
export async function releaseBond(p: Common & { strategyId: string; nowSec: number }): Promise<TxResult> {
  const c = ready(p)
  if (isResult(c)) return c
  const b = await fetchBond(p.connection as Connection, c.wallet.publicKey!, p.strategyId, c.program.programId)
  if (!b) return fail({ kind: 'unknown', message: 'No bond found for this strategy from your wallet.' })
  if (b.status !== 'active') return programFail('BondNotActive')
  if (Math.floor(p.nowSec) < Number(b.unlockAt)) return programFail('BondLocked')
  const ix = releaseBondIx({ quant: c.wallet.publicKey!, strategyId: p.strategyId, mint: c.program.config.usdcMint }, c.program.programId)
  const res = await sendAndConfirm({ connection: p.connection, wallet: p.wallet, instructions: [ix], onPhase: p.onPhase })
  await p.refresh()
  return res
}

export async function cancelListing(p: Common & { listing: PublicKey }): Promise<TxResult> {
  const c = ready(p)
  if (isResult(c)) return c
  const res = await sendAndConfirm({ connection: p.connection, wallet: p.wallet, instructions: [cancelListingIx(p.listing, c.wallet.publicKey!, c.program.programId)], onPhase: p.onPhase })
  await p.refresh()
  return res
}

export async function recordExpiry(p: Common & { listing: PublicKey }): Promise<TxResult> {
  const c = ready(p)
  if (isResult(c)) return c
  const res = await sendAndConfirm({ connection: p.connection, wallet: p.wallet, instructions: [closeExpiredIx(p.listing, c.program.programId)], onPhase: p.onPhase })
  await p.refresh()
  return res
}
