import { describe, expect, it } from 'vitest'
import { formatUsdc, offerExpired, parseUsdc, splitPayment, validateListing, validateOffer } from '@/solana/program/pricing'

const USDC = 1_000_000n

describe('3% / 97% split (mirrors pricing.rs)', () => {
  it('your example: $14,000 accepted → $420 fee, $13,580 to the quant', () => {
    expect(splitPayment(14_000n * USDC)).toEqual({ fee: 420n * USDC, seller: 13_580n * USDC })
  })
  it('1 USDC → 0.03 / 0.97', () => {
    expect(splitPayment(USDC)).toEqual({ fee: 30_000n, seller: 970_000n })
  })
  it('rounds the fee down and always sums to the amount', () => {
    for (const a of [1n, 33n, 34n, 99n, 101n, 333n, 1_000_001n, 123_456_789n, 1_000_033n, 100_000_000n * USDC]) {
      const { fee, seller } = splitPayment(a)
      expect(fee + seller).toBe(a)
      expect(fee).toBe((a * 3n) / 100n)
    }
    expect(splitPayment(33n)).toEqual({ fee: 0n, seller: 33n })
    expect(splitPayment(1_000_033n)).toEqual({ fee: 30_000n, seller: 970_033n })
  })
})

describe('listing validation (mirrors validate_listing)', () => {
  const ok = { askPrice: 15_000n * USDC, minOffer: 10_000n * USDC, endTs: 10_000 + 3_600, accessTermDays: 90, now: 10_000 }
  it('accepts valid parameters (min may equal ask)', () => {
    expect(validateListing(ok)).toBeNull()
    expect(validateListing({ ...ok, minOffer: ok.askPrice })).toBeNull()
  })
  it.each([
    [{ minOffer: 15_001n * USDC }, 'MinOfferAboveAsk'],
    [{ askPrice: USDC - 1n, minOffer: USDC - 1n }, 'AmountOutOfRange'],
    [{ askPrice: 100_000_001n * USDC }, 'AmountOutOfRange'],
    [{ endTs: 10_000 + 299 }, 'ListingWindowOutOfRange'],
    [{ endTs: 9_999 }, 'ListingWindowOutOfRange'],
    [{ endTs: 10_000 + 90 * 86_400 + 1 }, 'ListingWindowOutOfRange'],
    [{ accessTermDays: 0 }, 'AccessTermOutOfRange'],
    [{ accessTermDays: 366 }, 'AccessTermOutOfRange'],
    [{ accessTermDays: 1.5 }, 'AccessTermOutOfRange'],
  ])('rejects %o with %s', (patch, expected) => {
    expect(validateListing({ ...ok, ...patch })).toBe(expected)
  })
})

describe('offer validation (mirrors validate_offer)', () => {
  const ok = { amount: 12_000n * USDC, minOffer: 10_000n * USDC, expiresAt: 0, listingEndTs: 20_000, now: 10_000 }
  it('accepts an offer above the minimum and below the asking price', () => {
    expect(validateOffer(ok)).toBeNull() // offers below the ask are allowed — the quant decides
  })
  it.each([
    [{ amount: 9_999n * USDC }, 'OfferBelowMinimum'],
    [{ amount: 100_000_001n * USDC }, 'AmountOutOfRange'],
    [{ expiresAt: 10_059 }, 'InvalidOfferExpiry'],
    [{ expiresAt: 20_001 }, 'InvalidOfferExpiry'],
  ])('rejects %o with %s', (patch, expected) => {
    expect(validateOffer({ ...ok, ...patch })).toBe(expected)
  })
  it('expiry rules', () => {
    expect(offerExpired(0, 100, 99)).toBe(false)
    expect(offerExpired(0, 100, 100)).toBe(true)
    expect(offerExpired(50, 100, 50)).toBe(true)
    expect(offerExpired(50, 100, 49)).toBe(false)
  })
})

describe('USDC text ↔ base units (no floating point)', () => {
  it('parses dollar amounts exactly', () => {
    expect(parseUsdc('15000')).toBe(15_000n * USDC)
    expect(parseUsdc('$15,000.50')).toBe(15_000_500_000n)
    expect(parseUsdc('0.000001')).toBe(1n)
    expect(parseUsdc('1.0000001')).toBeNull() // finer than 1 micro-USDC
    expect(parseUsdc('-5')).toBeNull()
    expect(parseUsdc('1e3')).toBeNull()
    expect(parseUsdc('')).toBeNull()
  })
  it('formats dollars', () => {
    expect(formatUsdc(15_000n * USDC)).toBe('$15,000')
    expect(formatUsdc(420n * USDC)).toBe('$420')
    expect(formatUsdc(1_000_030_000n)).toBe('$1,000.03')
    expect(formatUsdc(1_500_000n)).toBe('$1.50')
    expect(formatUsdc(13_580n * USDC, { symbol: false })).toBe('13,580')
  })
})
