import type { PublicKey } from '@solana/web3.js'
import type { ListingAccount, OfferAccount } from '@/solana/program/codec'
import { offerExpired, splitPayment, validateOffer } from '@/solana/program/pricing'
import { PROGRAM_ERRORS } from '@/solana/program/constants'

/**
 * UI view of an on-chain listing at a given time. `nowSec` should be the
 * browser clock corrected by the measured cluster-clock offset. DISPLAY ONLY:
 * the program re-checks status, timing and amounts in every instruction.
 */
export type ListingPhase = 'open' | 'ended' | 'sold' | 'cancelled' | 'expired'

export interface OfferView {
  bidder: PublicKey
  amount: bigint
  fee: bigint
  sellerProceeds: bigint
  createdAt: number
  expiresAt: number
  expired: boolean
}

export interface ListingView {
  phase: ListingPhase
  secondsRemaining: number
  bestOffer: bigint | null
  offers: OfferView[]
}

export function listingView(l: ListingAccount, offers: OfferAccount[], nowSec: number): ListingView {
  const now = Math.floor(nowSec)
  const end = Number(l.endTs)
  let phase: ListingPhase
  if (l.status === 'sold') phase = 'sold'
  else if (l.status === 'cancelled') phase = 'cancelled'
  else if (l.status === 'expired') phase = 'expired'
  else phase = now < end ? 'open' : 'ended'

  const views = offers
    .map((o) => {
      const { fee, seller } = splitPayment(o.amount)
      return {
        bidder: o.bidder,
        amount: o.amount,
        fee,
        sellerProceeds: seller,
        createdAt: Number(o.createdAt),
        expiresAt: Number(o.expiresAt),
        expired: offerExpired(Number(o.expiresAt), end, now),
      }
    })
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : a.createdAt - b.createdAt))
  const live = views.filter((o) => !o.expired)
  return {
    phase,
    secondsRemaining: phase === 'open' ? end - now : 0,
    bestOffer: phase === 'open' && live.length ? live[0].amount : null,
    offers: views,
  }
}

export interface Gate {
  allowed: boolean
  reason: string | null
}
const no = (reason: string): Gate => ({ allowed: false, reason })
const yes: Gate = { allowed: true, reason: null }
const msg = (code: string) => PROGRAM_ERRORS.find(([n]) => n === code)?.[1] ?? code

function closedReason(phase: ListingPhase): string | null {
  if (phase === 'sold') return 'Sold — the quant accepted an offer.'
  if (phase === 'cancelled') return 'The quant cancelled this auction.'
  if (phase === 'expired' || phase === 'ended') return 'This auction has ended.'
  return null
}

/** Can the viewer place an offer of `amount`? */
export function offerGate(
  view: ListingView,
  l: ListingAccount,
  ctx: {
    programReady: boolean
    viewer: PublicKey | null
    pending: boolean
    termsAccepted: boolean
    hasLiveOffer: boolean
    amount: bigint | null
    expiresAt: number
    usdcBalance: bigint | null
    nowSec: number
  },
): Gate {
  if (!ctx.programReady) return no('The auction program is not available on Devnet.')
  const closed = closedReason(view.phase)
  if (closed) return no(closed)
  if (ctx.pending) return no('A transaction is already in progress.')
  if (!ctx.viewer) return no('Sign in or connect a wallet to make an offer.')
  if (ctx.viewer.equals(l.seller)) return no(msg('SellerCannotBid'))
  if (ctx.hasLiveOffer) return no('You already have an offer here. Withdraw it first to change the amount.')
  if (ctx.amount === null) return no('Enter an amount in USDC.')
  const err = validateOffer({ amount: ctx.amount, minOffer: l.minOffer, expiresAt: ctx.expiresAt, listingEndTs: Number(l.endTs), now: Math.floor(ctx.nowSec) })
  if (err) return no(msg(err))
  if (ctx.usdcBalance === null) return no('No USDC found in this wallet. Get Devnet test USDC first.')
  if (ctx.usdcBalance < ctx.amount) return no('Not enough USDC in this wallet for this offer.')
  if (!ctx.termsAccepted) return no('Accept the licence terms to continue.')
  return yes
}

/** Can the viewer (must be the seller) accept this offer? */
export function acceptGate(view: ListingView, l: ListingAccount, offer: OfferView, ctx: { programReady: boolean; viewer: PublicKey | null; pending: boolean }): Gate {
  if (!ctx.programReady) return no('The auction program is not available on Devnet.')
  if (!ctx.viewer || !ctx.viewer.equals(l.seller)) return no('Only the quant who created this auction can accept offers.')
  const closed = closedReason(view.phase)
  if (closed) return no(closed)
  if (offer.expired) return no(msg('OfferExpired'))
  if (ctx.pending) return no('A transaction is already in progress.')
  return yes
}

/** Who may withdraw/refund this offer: the bidder any time, anyone once refunds open up. */
export function withdrawGate(view: ListingView, offer: OfferView, ctx: { viewer: PublicKey | null; pending: boolean }): Gate & { refundForOther: boolean } {
  const isBidder = !!ctx.viewer?.equals(offer.bidder)
  const refundsOpen = view.phase !== 'open' || offer.expired
  if (ctx.pending) return { ...no('A transaction is already in progress.'), refundForOther: false }
  if (!ctx.viewer) return { ...no('Connect to withdraw.'), refundForOther: false }
  if (isBidder) return { ...yes, refundForOther: false }
  if (refundsOpen) return { ...yes, refundForOther: true }
  return { ...no(msg('NotAllowedToWithdraw')), refundForOther: false }
}

/** Compact summary of a live on-chain listing, for cards and tables. */
export interface ListingSummary {
  askPrice: bigint
  bestOffer: bigint | null
  offerCount: number
  secondsRemaining: number
}
