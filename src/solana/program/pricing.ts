/**
 * Exact TypeScript mirror of onchain/programs/stratx_auction/src/pricing.rs.
 * All amounts are bigint USDC base units (6 decimals). Used for display and
 * pre-flight validation only — the program re-checks everything on-chain.
 */
import {
  BPS_DENOMINATOR,
  MAX_ACCESS_DAYS,
  MAX_AMOUNT,
  MAX_BOND_DAYS,
  MAX_LISTING_SECONDS,
  MIN_ACCESS_DAYS,
  MIN_AMOUNT,
  MIN_BOND_DAYS,
  MIN_LISTING_SECONDS,
  MIN_OFFER_SECONDS,
  ONE_USDC,
  PROTOCOL_FEE_BPS,
} from '@/solana/program/constants'

/** fee = floor(amount × 3%), seller = amount − fee. Always sums to `amount`. */
export function splitPayment(amount: bigint): { fee: bigint; seller: bigint } {
  const fee = (amount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR
  return { fee, seller: amount - fee }
}

export type ParamError =
  | 'AmountOutOfRange'
  | 'MinOfferAboveAsk'
  | 'ListingWindowOutOfRange'
  | 'AccessTermOutOfRange'
  | 'OfferBelowMinimum'
  | 'InvalidOfferExpiry'
  | 'BondTermOutOfRange'

/** Mirrors `validate_bond`: 1–100M USDC, locked 1–365 days. */
export function validateBond(p: { amount: bigint; lockDays: number }): ParamError | null {
  if (p.amount < MIN_AMOUNT || p.amount > MAX_AMOUNT) return 'AmountOutOfRange'
  if (!Number.isInteger(p.lockDays) || p.lockDays < MIN_BOND_DAYS || p.lockDays > MAX_BOND_DAYS) return 'BondTermOutOfRange'
  return null
}

export function validateListing(p: { askPrice: bigint; minOffer: bigint; endTs: number; accessTermDays: number; now: number }): ParamError | null {
  const inRange = (x: bigint) => x >= MIN_AMOUNT && x <= MAX_AMOUNT
  if (!inRange(p.askPrice) || !inRange(p.minOffer)) return 'AmountOutOfRange'
  if (p.minOffer > p.askPrice) return 'MinOfferAboveAsk'
  const window = p.endTs - p.now
  if (window < MIN_LISTING_SECONDS || window > MAX_LISTING_SECONDS) return 'ListingWindowOutOfRange'
  if (!Number.isInteger(p.accessTermDays) || p.accessTermDays < MIN_ACCESS_DAYS || p.accessTermDays > MAX_ACCESS_DAYS)
    return 'AccessTermOutOfRange'
  return null
}

export function validateOffer(p: { amount: bigint; minOffer: bigint; expiresAt: number; listingEndTs: number; now: number }): ParamError | null {
  if (p.amount > MAX_AMOUNT) return 'AmountOutOfRange'
  if (p.amount < p.minOffer || p.amount < MIN_AMOUNT) return 'OfferBelowMinimum'
  if (p.expiresAt !== 0 && (p.expiresAt < p.now + MIN_OFFER_SECONDS || p.expiresAt > p.listingEndTs)) return 'InvalidOfferExpiry'
  return null
}

export function offerExpired(expiresAt: number, listingEndTs: number, now: number) {
  return now >= listingEndTs || (expiresAt !== 0 && now >= expiresAt)
}

/** Parses "15,000.50" / "15000.5" into USDC base units without floating point. */
export function parseUsdc(input: string): bigint | null {
  const s = input.trim().replace(/[,$\s]/g, '')
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  return BigInt(whole) * ONE_USDC + BigInt(frac.padEnd(6, '0'))
}

/** Formats USDC base units as "$15,000" / "$1,000.03". */
export function formatUsdc(units: bigint, opts: { decimals?: number; symbol?: boolean } = {}): string {
  const { decimals = 2, symbol = true } = opts
  const neg = units < 0n
  const abs = neg ? -units : units
  const whole = (abs / ONE_USDC).toLocaleString('en-US')
  let frac = (abs % ONE_USDC).toString().padStart(6, '0').slice(0, decimals).replace(/0+$/, '')
  if (frac.length === 1) frac += '0'
  return `${neg ? '-' : ''}${symbol ? '$' : ''}${whole}${frac ? `.${frac}` : ''}`
}

export function usdcToNumber(units: bigint): number {
  return Number(units) / 1e6
}
