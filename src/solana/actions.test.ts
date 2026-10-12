import { Keypair, PublicKey, type VersionedTransaction } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'
import { acceptOffer, placeOffer } from '@/solana/actions'
import { listingPda, offerPda, type ProgramStatus } from '@/solana/program/client'
import { decodeListing, encodeStrategyId, encodeTitle } from '@/solana/program/codec'
import { ACCOUNT_DISCRIMINATOR, ACCOUNT_SIZE } from '@/solana/program/constants'
import { acceptGate, listingView, offerGate, withdrawGate } from '@/solana/program/view'
import { GENESIS_HASH } from '@/solana/network'
import type { OfferAccount } from '@/solana/program/codec'

const PROGRAM = new PublicKey('BZiqFMzhmosxLgqf1Z8QZJoVXvrSHkqiAhWdpunzMXQ')
const MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
const USDC = 1_000_000n
const T0 = 1_800_000_000
const seller = Keypair.generate().publicKey
const alice = Keypair.generate().publicKey
const bob = Keypair.generate().publicKey
const LISTING = listingPda(seller, 1n, PROGRAM)

function listingData(status: number, sale = 0n, buyer?: PublicKey) {
  const b = new Uint8Array(ACCOUNT_SIZE.Listing)
  const v = new DataView(b.buffer)
  b.set(ACCOUNT_DISCRIMINATOR.Listing, 0)
  b.set(seller.toBytes(), 8)
  v.setBigUint64(40, 1n, true)
  b.set(encodeStrategyId('basalt-basis-carry'), 48)
  b.set(encodeTitle('Basalt Basis Carry'), 80)
  v.setBigUint64(144, 15_000n * USDC, true)
  v.setBigUint64(152, 10_000n * USDC, true)
  v.setBigInt64(160, BigInt(T0), true)
  v.setBigInt64(168, BigInt(T0 + 86_400), true)
  v.setUint16(176, 90, true)
  v.setUint8(178, status)
  if (buyer) b.set(buyer.toBytes(), 179)
  v.setBigUint64(211, sale, true)
  return b
}

function offerData(bidder: PublicKey, amount: bigint) {
  const b = new Uint8Array(ACCOUNT_SIZE.Offer)
  const v = new DataView(b.buffer)
  b.set(ACCOUNT_DISCRIMINATOR.Offer, 0)
  b.set(LISTING.toBytes(), 8)
  b.set(bidder.toBytes(), 40)
  v.setBigUint64(72, amount, true)
  v.setBigInt64(80, BigInt(T0 + 60), true)
  return b
}

const program: ProgramStatus = {
  kind: 'ready',
  programId: PROGRAM,
  configAddress: Keypair.generate().publicKey,
  config: { admin: Keypair.generate().publicKey, feeRecipient: Keypair.generate().publicKey, usdcMint: MINT, bump: 255 },
}

function mockConnection(accounts: () => Map<string, Uint8Array>) {
  return {
    getGenesisHash: vi.fn().mockResolvedValue(GENESIS_HASH.devnet),
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1 }),
    simulateTransaction: vi.fn().mockResolvedValue({ value: { err: null, logs: [] } }),
    sendRawTransaction: vi.fn().mockResolvedValue('SIG'),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    getAccountInfo: vi.fn().mockImplementation(async (pk: PublicKey) => {
      const data = accounts().get(pk.toBase58())
      return data ? { owner: PROGRAM, data } : null
    }),
  }
}
const signer = (pk: PublicKey) => ({ publicKey: pk, signTransaction: async <T extends VersionedTransaction>(t: T) => t })

describe('acceptOffer', () => {
  it('re-reads the offer, sends with the exact amount, and refreshes after confirmation', async () => {
    const state = new Map([
      [LISTING.toBase58(), listingData(0)],
      [offerPda(LISTING, bob, PROGRAM).toBase58(), offerData(bob, 14_000n * USDC)],
    ])
    const connection = mockConnection(() => state)
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = await acceptOffer({ connection: connection as never, wallet: signer(seller), program, listing: LISTING, bidder: bob, shownAmount: 14_000n * USDC, nowSec: T0 + 900, refresh })
    expect(r.ok).toBe(true)
    expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalled()
  })

  it('refuses if the offer amount changed since the seller viewed it', async () => {
    const state = new Map([
      [LISTING.toBase58(), listingData(0)],
      [offerPda(LISTING, bob, PROGRAM).toBase58(), offerData(bob, 11_000n * USDC)],
    ])
    const connection = mockConnection(() => state)
    const r = await acceptOffer({ connection: connection as never, wallet: signer(seller), program, listing: LISTING, bidder: bob, shownAmount: 14_000n * USDC, nowSec: T0 + 900, refresh: vi.fn() })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure.programError).toBe('OfferAmountMismatch')
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('refuses for a non-seller and for a listing that is already sold', async () => {
    const offerKey = offerPda(LISTING, bob, PROGRAM).toBase58()
    const open = mockConnection(() => new Map([[LISTING.toBase58(), listingData(0)], [offerKey, offerData(bob, 14_000n * USDC)]]))
    const r1 = await acceptOffer({ connection: open as never, wallet: signer(alice), program, listing: LISTING, bidder: bob, shownAmount: 14_000n * USDC, nowSec: T0 + 900, refresh: vi.fn() })
    expect(!r1.ok && r1.failure.programError).toBe('Unauthorized')
    const sold = mockConnection(() => new Map([[LISTING.toBase58(), listingData(1, 12_000n * USDC, alice)], [offerKey, offerData(bob, 14_000n * USDC)]]))
    const r2 = await acceptOffer({ connection: sold as never, wallet: signer(seller), program, listing: LISTING, bidder: bob, shownAmount: 14_000n * USDC, nowSec: T0 + 900, refresh: vi.fn() })
    expect(!r2.ok && r2.failure.programError).toBe('ListingNotOpen')
    expect(sold.sendRawTransaction).not.toHaveBeenCalled()
  })
})

describe('placeOffer', () => {
  it('refuses offers below the minimum before asking the wallet', async () => {
    const connection = mockConnection(() => new Map([[LISTING.toBase58(), listingData(0)]]))
    const r = await placeOffer({ connection: connection as never, wallet: signer(alice), program, listing: LISTING, amount: 9_000n * USDC, expiresAt: 0, nowSec: T0 + 10, refresh: vi.fn() })
    expect(!r.ok && r.failure.programError).toBe('OfferBelowMinimum')
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
  })
  it('refuses after the auction ended', async () => {
    const connection = mockConnection(() => new Map([[LISTING.toBase58(), listingData(0)]]))
    const r = await placeOffer({ connection: connection as never, wallet: signer(alice), program, listing: LISTING, amount: 12_000n * USDC, expiresAt: 0, nowSec: T0 + 86_400, refresh: vi.fn() })
    expect(!r.ok && r.failure.programError).toBe('ListingEnded')
  })
  it('sends a valid offer and refreshes', async () => {
    const connection = mockConnection(() => new Map([[LISTING.toBase58(), listingData(0)]]))
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = await placeOffer({ connection: connection as never, wallet: signer(alice), program, listing: LISTING, amount: 12_000n * USDC, expiresAt: 0, nowSec: T0 + 10, refresh })
    expect(r.ok).toBe(true)
    expect(refresh).toHaveBeenCalled()
  })
})

describe('listing view & gates (UI state after on-chain changes)', () => {
  const offers: OfferAccount[] = [
    { listing: LISTING, bidder: alice, amount: 12_000n * USDC, createdAt: BigInt(T0 + 10), expiresAt: 0n, bump: 1 },
    { listing: LISTING, bidder: bob, amount: 14_000n * USDC, createdAt: BigInt(T0 + 910), expiresAt: 0n, bump: 1 },
  ]
  const open = decodeListing(listingData(0))

  it('ranks offers highest first and reports the best offer', () => {
    const v = listingView(open, offers, T0 + 1000)
    expect(v.phase).toBe('open')
    expect(v.bestOffer).toBe(14_000n * USDC)
    expect(v.offers.map((o) => o.bidder.toBase58())).toEqual([bob.toBase58(), alice.toBase58()])
    expect(v.offers[0].sellerProceeds).toBe(13_580n * USDC)
  })
  it('the quant can accept any live offer — not only the highest', () => {
    const v = listingView(open, offers, T0 + 1000)
    expect(acceptGate(v, open, v.offers[1], { programReady: true, viewer: seller, pending: false }).allowed).toBe(true)
    expect(acceptGate(v, open, v.offers[1], { programReady: true, viewer: alice, pending: false }).allowed).toBe(false)
    expect(acceptGate(v, open, v.offers[1], { programReady: true, viewer: seller, pending: true }).allowed).toBe(false)
  })
  it('after a sale the UI disables offers and acceptance, and enables refunds for others', () => {
    const sold = decodeListing(listingData(1, 14_000n * USDC, bob))
    const v = listingView(sold, [offers[0]], T0 + 2000)
    expect(v.phase).toBe('sold')
    const base = { programReady: true, viewer: Keypair.generate().publicKey, pending: false, termsAccepted: true, hasLiveOffer: false, amount: 15_000n * USDC, expiresAt: 0, usdcBalance: 100_000n * USDC, nowSec: T0 + 2000 }
    expect(offerGate(v, sold, base).allowed).toBe(false)
    expect(acceptGate(v, sold, v.offers[0], { programReady: true, viewer: seller, pending: false }).allowed).toBe(false)
    const w = withdrawGate(v, v.offers[0], { viewer: carolKey, pending: false })
    expect(w.allowed && w.refundForOther).toBe(true)
  })
  it('a live offer can only be withdrawn by its bidder', () => {
    const v = listingView(open, offers, T0 + 1000)
    const bobs = v.offers.find((o) => o.bidder.equals(bob))!
    expect(withdrawGate(v, bobs, { viewer: bob, pending: false })).toMatchObject({ allowed: true, refundForOther: false })
    expect(withdrawGate(v, bobs, { viewer: alice, pending: false }).allowed).toBe(false)
  })
  it('offer gate: seller, duplicates, minimum, balance, terms', () => {
    const v = listingView(open, offers, T0 + 1000)
    const base = { programReady: true, viewer: carolKey, pending: false, termsAccepted: true, hasLiveOffer: false, amount: 12_500n * USDC, expiresAt: 0, usdcBalance: 20_000n * USDC, nowSec: T0 + 1000 }
    expect(offerGate(v, open, base).allowed).toBe(true)
    expect(offerGate(v, open, { ...base, viewer: seller }).allowed).toBe(false)
    expect(offerGate(v, open, { ...base, hasLiveOffer: true }).allowed).toBe(false)
    expect(offerGate(v, open, { ...base, amount: 9_000n * USDC }).allowed).toBe(false)
    expect(offerGate(v, open, { ...base, usdcBalance: 1_000n * USDC }).allowed).toBe(false)
    expect(offerGate(v, open, { ...base, usdcBalance: null }).allowed).toBe(false)
    expect(offerGate(v, open, { ...base, termsAccepted: false }).allowed).toBe(false)
    expect(offerGate(v, open, { ...base, viewer: null }).allowed).toBe(false)
  })
  it('the auction ends at end_ts', () => {
    expect(listingView(open, offers, T0 + 86_400).phase).toBe('ended')
    expect(listingView(open, offers, T0 + 86_400).bestOffer).toBeNull()
  })
})

const carolKey = Keypair.generate().publicKey
