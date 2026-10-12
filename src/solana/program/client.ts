/**
 * StratX offer-auction program client — PDAs, instruction builders and
 * account readers. Builds instructions only; signing and sending live in
 * `src/solana/tx.ts`, so every transaction goes through the user's wallet.
 */
import { Buffer } from 'buffer'
import bs58 from 'bs58'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { type Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import {
  decodeBond,
  decodeCharityList,
  decodeConfig,
  decodeEntitlement,
  decodeListing,
  decodeOffer,
  encodeAcceptOffer,
  encodeCancelListing,
  encodeCloseExpired,
  encodeCreateListing,
  encodePlaceOffer,
  encodePostBond,
  encodeReleaseBond,
  encodeStrategyId,
  encodeWithdrawOffer,
  type BondAccount,
  type Charity,
  type ConfigAccount,
  type EntitlementAccount,
  type ListingAccount,
  type OfferAccount,
} from '@/solana/program/codec'
import {
  ACCOUNT_DISCRIMINATOR,
  ACCOUNT_SIZE,
  AUCTION_PROGRAM_ID,
  BOND_STRATEGY_ID_OFFSET,
  LISTING_STRATEGY_ID_OFFSET,
  OFFER_LISTING_OFFSET,
  SEEDS,
} from '@/solana/program/constants'

const enc = new TextEncoder()
const w = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true })
const r = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: false })

function u64le(v: bigint) {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, v, true)
  return b
}

export const configPda = (programId = AUCTION_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc.encode(SEEDS.config)], programId)[0]
export const listingPda = (seller: PublicKey, listingId: bigint, programId = AUCTION_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc.encode(SEEDS.listing), seller.toBytes(), u64le(listingId)], programId)[0]
export const offerPda = (listing: PublicKey, bidder: PublicKey, programId = AUCTION_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc.encode(SEEDS.offer), listing.toBytes(), bidder.toBytes()], programId)[0]
export const entitlementPda = (listing: PublicKey, programId = AUCTION_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc.encode(SEEDS.entitlement), listing.toBytes()], programId)[0]
export const charitiesPda = (programId = AUCTION_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc.encode(SEEDS.charities)], programId)[0]
export const bondPda = (quant: PublicKey, strategyId: string, programId = AUCTION_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc.encode(SEEDS.bond), quant.toBytes(), encodeStrategyId(strategyId)], programId)[0]
/** USDC associated token account; `allowOwnerOffCurve` for PDA owners (offer vaults). */
export const usdcAta = (mint: PublicKey, owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true)

/* ------------------------------------------------------------------ instructions */

export function createListingIx(
  p: { seller: PublicKey; listingId: bigint; strategyId: string; title: string; askPrice: bigint; minOffer: bigint; endTs: bigint; accessTermDays: number },
  programId = AUCTION_PROGRAM_ID,
) {
  return new TransactionInstruction({
    programId,
    keys: [w(listingPda(p.seller, p.listingId, programId)), w(p.seller, true), r(configPda(programId)), r(SystemProgram.programId)],
    data: Buffer.from(encodeCreateListing(p)),
  })
}

export function placeOfferIx(
  p: { listing: PublicKey; bidder: PublicKey; mint: PublicKey; amount: bigint; expiresAt: bigint },
  programId = AUCTION_PROGRAM_ID,
) {
  const offer = offerPda(p.listing, p.bidder, programId)
  return new TransactionInstruction({
    programId,
    keys: [
      w(p.listing),
      w(offer),
      w(usdcAta(p.mint, offer)),
      r(configPda(programId)),
      r(p.mint),
      w(usdcAta(p.mint, p.bidder)),
      w(p.bidder, true),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
      r(SystemProgram.programId),
    ],
    data: Buffer.from(encodePlaceOffer(p.amount, p.expiresAt)),
  })
}

/** `actor` signs; refunds and rent always go to `bidder` (enforced by the program). */
export function withdrawOfferIx(
  p: { listing: PublicKey; bidder: PublicKey; actor: PublicKey; mint: PublicKey },
  programId = AUCTION_PROGRAM_ID,
) {
  const offer = offerPda(p.listing, p.bidder, programId)
  return new TransactionInstruction({
    programId,
    keys: [
      w(p.listing),
      w(offer),
      w(usdcAta(p.mint, offer)),
      r(configPda(programId)),
      r(p.mint),
      w(p.bidder),
      w(usdcAta(p.mint, p.bidder)),
      r(p.actor, true),
      r(TOKEN_PROGRAM_ID),
    ],
    data: Buffer.from(encodeWithdrawOffer()),
  })
}

/**
 * Seller accepts an offer. Token accounts for the seller, fee recipient and
 * bidder are created idempotently first (paid by the seller) so payment can't
 * fail because one of them is missing. The fee recipient comes from Config;
 * the program rejects any other account.
 */
export function acceptOfferIxs(
  p: { listing: PublicKey; seller: PublicKey; bidder: PublicKey; feeRecipient: PublicKey; mint: PublicKey; expectedAmount: bigint },
  programId = AUCTION_PROGRAM_ID,
) {
  const offer = offerPda(p.listing, p.bidder, programId)
  const ensure = (owner: PublicKey) =>
    createAssociatedTokenAccountIdempotentInstruction(p.seller, usdcAta(p.mint, owner), owner, p.mint)
  const accept = new TransactionInstruction({
    programId,
    keys: [
      w(p.listing),
      w(offer),
      w(usdcAta(p.mint, offer)),
      w(entitlementPda(p.listing, programId)),
      r(configPda(programId)),
      r(p.mint),
      w(p.seller, true),
      w(usdcAta(p.mint, p.seller)),
      r(p.feeRecipient),
      w(usdcAta(p.mint, p.feeRecipient)),
      w(p.bidder),
      w(usdcAta(p.mint, p.bidder)),
      r(TOKEN_PROGRAM_ID),
      r(SystemProgram.programId),
    ],
    data: Buffer.from(encodeAcceptOffer(p.expectedAmount)),
  })
  return [ensure(p.seller), ensure(p.feeRecipient), ensure(p.bidder), accept]
}

/** Quant locks USDC behind a strategy's results; `charityIndex` points into the approved list. */
export function postBondIx(
  p: { quant: PublicKey; strategyId: string; mint: PublicKey; amount: bigint; lockDays: number; charityIndex: number },
  programId = AUCTION_PROGRAM_ID,
) {
  const bond = bondPda(p.quant, p.strategyId, programId)
  return new TransactionInstruction({
    programId,
    keys: [
      w(bond),
      w(usdcAta(p.mint, bond)),
      r(configPda(programId)),
      r(charitiesPda(programId)),
      r(p.mint),
      w(usdcAta(p.mint, p.quant)),
      w(p.quant, true),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
      r(SystemProgram.programId),
    ],
    data: Buffer.from(encodePostBond(p)),
  })
}

/** Quant takes an unlocked bond back. */
export function releaseBondIx(p: { quant: PublicKey; strategyId: string; mint: PublicKey }, programId = AUCTION_PROGRAM_ID) {
  const bond = bondPda(p.quant, p.strategyId, programId)
  return new TransactionInstruction({
    programId,
    keys: [w(bond), w(usdcAta(p.mint, bond)), r(configPda(programId)), r(p.mint), w(p.quant, true), w(usdcAta(p.mint, p.quant)), r(TOKEN_PROGRAM_ID)],
    data: Buffer.from(encodeReleaseBond()),
  })
}

export function cancelListingIx(listing: PublicKey, seller: PublicKey, programId = AUCTION_PROGRAM_ID) {
  return new TransactionInstruction({ programId, keys: [w(listing), r(seller, true)], data: Buffer.from(encodeCancelListing()) })
}

export function closeExpiredIx(listing: PublicKey, programId = AUCTION_PROGRAM_ID) {
  return new TransactionInstruction({ programId, keys: [w(listing)], data: Buffer.from(encodeCloseExpired()) })
}

/* ------------------------------------------------------------------ readers */

export interface OnchainListing {
  address: PublicKey
  account: ListingAccount
}
export interface OnchainOffer {
  address: PublicKey
  account: OfferAccount
}

export type ProgramStatus =
  | { kind: 'not-deployed'; programId: PublicKey }
  | { kind: 'config-missing'; programId: PublicKey }
  | { kind: 'ready'; programId: PublicKey; config: ConfigAccount; configAddress: PublicKey }

/** Checks the program account is deployed and executable, and that Config exists. */
export async function fetchProgramStatus(connection: Connection, programId = AUCTION_PROGRAM_ID): Promise<ProgramStatus> {
  const [programInfo, configInfo] = await connection.getMultipleAccountsInfo([programId, configPda(programId)], 'confirmed')
  if (!programInfo || !programInfo.executable) return { kind: 'not-deployed', programId }
  if (!configInfo || !configInfo.owner.equals(programId)) return { kind: 'config-missing', programId }
  return { kind: 'ready', programId, config: decodeConfig(configInfo.data), configAddress: configPda(programId) }
}

const disc = (d: readonly number[]) => bs58.encode(Uint8Array.from(d))

export async function fetchListings(connection: Connection, opts: { strategyId?: string } = {}, programId = AUCTION_PROGRAM_ID): Promise<OnchainListing[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: 'confirmed',
    filters: [
      { dataSize: ACCOUNT_SIZE.Listing },
      { memcmp: { offset: 0, bytes: disc(ACCOUNT_DISCRIMINATOR.Listing) } },
      ...(opts.strategyId ? [{ memcmp: { offset: LISTING_STRATEGY_ID_OFFSET, bytes: bs58.encode(encodeStrategyId(opts.strategyId)) } }] : []),
    ],
  })
  const out: OnchainListing[] = []
  for (const a of accounts) {
    try {
      out.push({ address: a.pubkey, account: decodeListing(a.account.data) })
    } catch {
      /* skip malformed */
    }
  }
  return out.sort((x, y) => Number(y.account.createdAt - x.account.createdAt))
}

/** Live (not yet withdrawn/accepted) offers — for one listing or all. */
export async function fetchOffers(connection: Connection, opts: { listing?: PublicKey } = {}, programId = AUCTION_PROGRAM_ID): Promise<OnchainOffer[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: 'confirmed',
    filters: [
      { dataSize: ACCOUNT_SIZE.Offer },
      { memcmp: { offset: 0, bytes: disc(ACCOUNT_DISCRIMINATOR.Offer) } },
      ...(opts.listing ? [{ memcmp: { offset: OFFER_LISTING_OFFSET, bytes: opts.listing.toBase58() } }] : []),
    ],
  })
  const out: OnchainOffer[] = []
  for (const a of accounts) {
    try {
      out.push({ address: a.pubkey, account: decodeOffer(a.account.data) })
    } catch {
      /* skip malformed */
    }
  }
  return out.sort((x, y) => (y.account.amount > x.account.amount ? 1 : y.account.amount < x.account.amount ? -1 : 0))
}

export async function fetchListing(connection: Connection, address: PublicKey, programId = AUCTION_PROGRAM_ID) {
  const info = await connection.getAccountInfo(address, 'confirmed')
  if (!info || !info.owner.equals(programId)) return null
  return decodeListing(info.data)
}

export async function fetchOffer(connection: Connection, address: PublicKey, programId = AUCTION_PROGRAM_ID) {
  const info = await connection.getAccountInfo(address, 'confirmed')
  if (!info || !info.owner.equals(programId)) return null
  return decodeOffer(info.data)
}

export async function fetchEntitlement(connection: Connection, listing: PublicKey, programId = AUCTION_PROGRAM_ID): Promise<EntitlementAccount | null> {
  const info = await connection.getAccountInfo(entitlementPda(listing, programId), 'confirmed')
  if (!info || !info.owner.equals(programId)) return null
  return decodeEntitlement(info.data)
}

/** The approved charity list, or [] before the admin has set one. */
export async function fetchCharities(connection: Connection, programId = AUCTION_PROGRAM_ID): Promise<Charity[]> {
  const info = await connection.getAccountInfo(charitiesPda(programId), 'confirmed')
  if (!info || !info.owner.equals(programId)) return []
  return decodeCharityList(info.data)
}

export interface OnchainBond {
  address: PublicKey
  account: BondAccount
}

/**
 * Bonds for a strategy posted by any of `quants` (e.g. its listing sellers and
 * the viewer), newest first. One getMultipleAccounts call on derived PDAs —
 * much lighter on public RPCs than scanning every program account.
 */
export async function fetchBondsFor(connection: Connection, strategyId: string, quants: PublicKey[], programId = AUCTION_PROGRAM_ID): Promise<OnchainBond[]> {
  const unique = [...new Map(quants.map((q) => [q.toBase58(), q])).values()]
  if (unique.length === 0) return []
  const addresses = unique.map((q) => bondPda(q, strategyId, programId))
  const infos = await connection.getMultipleAccountsInfo(addresses, 'confirmed')
  const out: OnchainBond[] = []
  infos.forEach((info, i) => {
    if (!info || !info.owner.equals(programId)) return
    try {
      out.push({ address: addresses[i], account: decodeBond(info.data) })
    } catch {
      /* skip malformed */
    }
  })
  return out.sort((x, y) => Number(y.account.createdAt - x.account.createdAt))
}

/** Every bond posted for a strategy by any wallet (full program scan — use sparingly on public RPCs). */
export async function fetchBonds(connection: Connection, strategyId: string, programId = AUCTION_PROGRAM_ID): Promise<OnchainBond[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: 'confirmed',
    filters: [
      { dataSize: ACCOUNT_SIZE.Bond },
      { memcmp: { offset: 0, bytes: disc(ACCOUNT_DISCRIMINATOR.Bond) } },
      { memcmp: { offset: BOND_STRATEGY_ID_OFFSET, bytes: bs58.encode(encodeStrategyId(strategyId)) } },
    ],
  })
  const out: OnchainBond[] = []
  for (const a of accounts) {
    try {
      out.push({ address: a.pubkey, account: decodeBond(a.account.data) })
    } catch {
      /* skip malformed */
    }
  }
  return out.sort((x, y) => Number(y.account.createdAt - x.account.createdAt))
}

export async function fetchBond(connection: Connection, quant: PublicKey, strategyId: string, programId = AUCTION_PROGRAM_ID): Promise<BondAccount | null> {
  const info = await connection.getAccountInfo(bondPda(quant, strategyId, programId), 'confirmed')
  if (!info || !info.owner.equals(programId)) return null
  return decodeBond(info.data)
}

/** USDC balance of a wallet in base units; null when it has no USDC account. */
export async function fetchUsdcBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<bigint | null> {
  try {
    const res = await connection.getTokenAccountBalance(usdcAta(mint, owner), 'confirmed')
    return BigInt(res.value.amount)
  } catch {
    return null
  }
}

/** Cluster unix time (seconds) — the clock the program actually uses. */
export async function fetchClusterTime(connection: Connection): Promise<number | null> {
  try {
    const slot = await connection.getSlot('confirmed')
    return await connection.getBlockTime(slot)
  } catch {
    return null
  }
}
