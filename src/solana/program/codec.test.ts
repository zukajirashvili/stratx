import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import {
  acceptOfferIxs,
  bondPda,
  charitiesPda,
  configPda,
  createListingIx,
  entitlementPda,
  listingPda,
  offerPda,
  placeOfferIx,
  postBondIx,
  releaseBondIx,
  withdrawOfferIx,
} from '@/solana/program/client'
import {
  decodeBond,
  decodeCharityList,
  decodeConfig,
  encodeFixed,
  encodePostBond,
  decodeListing,
  decodeOffer,
  encodeAcceptOffer,
  encodeCreateListing,
  encodePlaceOffer,
  encodeStrategyId,
  encodeTitle,
  fitTitle,
} from '@/solana/program/codec'
import { ACCOUNT_DISCRIMINATOR, ACCOUNT_SIZE, BOND_STRATEGY_ID_OFFSET, IX_DISCRIMINATOR, LISTING_STRATEGY_ID_OFFSET, OFFER_LISTING_OFFSET } from '@/solana/program/constants'

async function sha8(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  return [...d.slice(0, 8)]
}

const PROGRAM = new PublicKey('BZiqFMzhmosxLgqf1Z8QZJoVXvrSHkqiAhWdpunzMXQ')
const MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
const flags = (ix: { keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] }) => ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable])
const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(MINT, owner, true)

describe('Anchor discriminators', () => {
  it('match sha256("global:<ix>")[..8]', async () => {
    const names: Record<keyof typeof IX_DISCRIMINATOR, string> = {
      initializeConfig: 'initialize_config',
      updateFeeRecipient: 'update_fee_recipient',
      transferAdmin: 'transfer_admin',
      createListing: 'create_listing',
      placeOffer: 'place_offer',
      withdrawOffer: 'withdraw_offer',
      acceptOffer: 'accept_offer',
      cancelListing: 'cancel_listing',
      closeExpired: 'close_expired',
      setCharities: 'set_charities',
      postBond: 'post_bond',
      releaseBond: 'release_bond',
      slashBond: 'slash_bond',
    }
    for (const [k, rust] of Object.entries(names)) {
      expect(IX_DISCRIMINATOR[k as keyof typeof IX_DISCRIMINATOR], k).toEqual(await sha8(`global:${rust}`))
    }
  })
  it('match sha256("account:<Name>")[..8]', async () => {
    for (const name of ['Config', 'Listing', 'Offer', 'Entitlement', 'CharityList', 'Bond'] as const) {
      expect(ACCOUNT_DISCRIMINATOR[name], name).toEqual(await sha8(`account:${name}`))
    }
  })
})

/** Builds Listing account bytes exactly as Borsh would for the Rust struct. */
function listingBytes(p: { seller: PublicKey; status: number; buyer?: PublicKey; sale?: bigint; offerCount?: number }) {
  const b = new Uint8Array(ACCOUNT_SIZE.Listing)
  const v = new DataView(b.buffer)
  let o = 0
  b.set(ACCOUNT_DISCRIMINATOR.Listing, o); o += 8
  b.set(p.seller.toBytes(), o); o += 32
  v.setBigUint64(o, 7n, true); o += 8
  b.set(encodeStrategyId('basalt-basis-carry'), o); o += 32
  b.set(encodeTitle('Basalt Basis Carry'), o); o += 64
  v.setBigUint64(o, 15_000_000_000n, true); o += 8 // ask $15,000
  v.setBigUint64(o, 10_000_000_000n, true); o += 8 // min $10,000
  v.setBigInt64(o, 1_800_000_000n, true); o += 8 // created
  v.setBigInt64(o, 1_800_086_400n, true); o += 8 // end
  v.setUint16(o, 90, true); o += 2
  v.setUint8(o, p.status); o += 1
  b.set((p.buyer ?? PublicKey.default).toBytes(), o); o += 32
  v.setBigUint64(o, p.sale ?? 0n, true); o += 8
  v.setBigInt64(o, p.sale ? 1_800_001_000n : 0n, true); o += 8
  v.setUint32(o, p.offerCount ?? 0, true); o += 4
  v.setUint8(o, 253); o += 1
  expect(o).toBe(ACCOUNT_SIZE.Listing)
  return b
}

describe('account decoding', () => {
  const seller = Keypair.generate().publicKey
  it('decodes an open listing', () => {
    const l = decodeListing(listingBytes({ seller, status: 0, offerCount: 2 }))
    expect(l.seller.equals(seller)).toBe(true)
    expect(l.strategyId).toBe('basalt-basis-carry')
    expect(l.title).toBe('Basalt Basis Carry')
    expect(l.askPrice).toBe(15_000_000_000n)
    expect(l.minOffer).toBe(10_000_000_000n)
    expect(l.status).toBe('open')
    expect(l.buyer).toBeNull()
    expect(l.offerCount).toBe(2)
    expect(l.bump).toBe(253)
  })
  it('decodes a sold listing', () => {
    const buyer = Keypair.generate().publicKey
    const l = decodeListing(listingBytes({ seller, status: 1, buyer, sale: 14_000_000_000n }))
    expect(l.status).toBe('sold')
    expect(l.buyer?.equals(buyer)).toBe(true)
    expect(l.salePrice).toBe(14_000_000_000n)
  })
  it('rejects wrong discriminators, unknown statuses and short data', () => {
    const bad = listingBytes({ seller, status: 0 })
    bad[0] ^= 0xff
    expect(() => decodeListing(bad)).toThrow()
    expect(() => decodeListing(listingBytes({ seller, status: 9 }))).toThrow()
    expect(() => decodeListing(listingBytes({ seller, status: 0 }).slice(0, 100))).toThrow()
  })
  it('places memcmp fields at the documented offsets', () => {
    const bytes = listingBytes({ seller, status: 0 })
    expect([...bytes.slice(LISTING_STRATEGY_ID_OFFSET, LISTING_STRATEGY_ID_OFFSET + 32)]).toEqual([...encodeStrategyId('basalt-basis-carry')])
    expect(OFFER_LISTING_OFFSET).toBe(8)
  })
  it('decodes offers and config', () => {
    const listing = Keypair.generate().publicKey
    const bidder = Keypair.generate().publicKey
    const ob = new Uint8Array(ACCOUNT_SIZE.Offer)
    const ov = new DataView(ob.buffer)
    ob.set(ACCOUNT_DISCRIMINATOR.Offer)
    ob.set(listing.toBytes(), 8)
    ob.set(bidder.toBytes(), 40)
    ov.setBigUint64(72, 12_000_000_000n, true)
    ov.setBigInt64(80, 1_800_000_100n, true)
    ov.setBigInt64(88, 0n, true)
    ob[96] = 250
    const o = decodeOffer(ob)
    expect(o.listing.equals(listing) && o.bidder.equals(bidder)).toBe(true)
    expect(o.amount).toBe(12_000_000_000n)
    expect(o.expiresAt).toBe(0n)

    const admin = Keypair.generate().publicKey
    const fee = Keypair.generate().publicKey
    const cb = new Uint8Array(ACCOUNT_SIZE.Config)
    cb.set(ACCOUNT_DISCRIMINATOR.Config)
    cb.set(admin.toBytes(), 8)
    cb.set(fee.toBytes(), 40)
    cb.set(MINT.toBytes(), 72)
    cb[104] = 7
    const c = decodeConfig(cb)
    expect(c.admin.equals(admin) && c.feeRecipient.equals(fee) && c.usdcMint.equals(MINT) && c.bump === 7).toBe(true)
  })
  it('validates fixed-size text fields', () => {
    expect(() => encodeStrategyId('')).toThrow()
    expect(() => encodeStrategyId('x'.repeat(33))).toThrow()
    expect(new TextEncoder().encode(fitTitle('é'.repeat(50))).length).toBeLessThanOrEqual(64)
  })
})

describe('instruction encoding & account order (must match lib.rs)', () => {
  const seller = Keypair.generate().publicKey
  const bidder = Keypair.generate().publicKey
  const feeRecipient = Keypair.generate().publicKey
  const listing = listingPda(seller, 42n, PROGRAM)

  it('encodes create_listing args in declaration order', () => {
    const d = encodeCreateListing({ listingId: 42n, strategyId: 'atlas-stat-arb-pairs', title: 'Atlas Pairs', askPrice: 3n, minOffer: 2n, endTs: 99n, accessTermDays: 30 })
    const v = new DataView(d.buffer)
    expect(d.length).toBe(8 + 8 + 32 + 64 + 8 + 8 + 8 + 2)
    expect(v.getBigUint64(8, true)).toBe(42n)
    expect(new TextDecoder().decode(d.slice(16, 16 + 20))).toBe('atlas-stat-arb-pairs')
    expect(new TextDecoder().decode(d.slice(48, 48 + 11))).toBe('Atlas Pairs')
    expect(v.getBigUint64(112, true)).toBe(3n)
    expect(v.getBigUint64(120, true)).toBe(2n)
    expect(v.getBigInt64(128, true)).toBe(99n)
    expect(v.getUint16(136, true)).toBe(30)
  })
  it('encodes place_offer and accept_offer', () => {
    const p = encodePlaceOffer(12_000_000_000n, 0n)
    expect([...p.slice(0, 8)]).toEqual(IX_DISCRIMINATOR.placeOffer)
    expect(new DataView(p.buffer).getBigUint64(8, true)).toBe(12_000_000_000n)
    const a = encodeAcceptOffer(14_000_000_000n)
    expect([...a.slice(0, 8)]).toEqual(IX_DISCRIMINATOR.acceptOffer)
    expect(new DataView(a.buffer).getBigUint64(8, true)).toBe(14_000_000_000n)
  })
  it('create_listing accounts', () => {
    const ix = createListingIx({ seller, listingId: 42n, strategyId: 'x', title: 'X', askPrice: 2n, minOffer: 1n, endTs: 600n, accessTermDays: 1 }, PROGRAM)
    expect(flags(ix)).toEqual([
      [listing.toBase58(), false, true],
      [seller.toBase58(), true, true],
      [configPda(PROGRAM).toBase58(), false, false],
      [SystemProgram.programId.toBase58(), false, false],
    ])
  })
  it('place_offer accounts: escrow vault is the offer PDA’s USDC account', () => {
    const offer = offerPda(listing, bidder, PROGRAM)
    const ix = placeOfferIx({ listing, bidder, mint: MINT, amount: 1n, expiresAt: 0n }, PROGRAM)
    expect(flags(ix).slice(0, 7)).toEqual([
      [listing.toBase58(), false, true],
      [offer.toBase58(), false, true],
      [ata(offer).toBase58(), false, true],
      [configPda(PROGRAM).toBase58(), false, false],
      [MINT.toBase58(), false, false],
      [ata(bidder).toBase58(), false, true],
      [bidder.toBase58(), true, true],
    ])
    expect(ix.keys[7].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true)
  })
  it('accept_offer creates token accounts first, pays the CONFIGURED fee recipient, and only the seller signs', () => {
    const ixs = acceptOfferIxs({ listing, seller, bidder, feeRecipient, mint: MINT, expectedAmount: 5n }, PROGRAM)
    expect(ixs).toHaveLength(4) // 3 idempotent ATA creations + accept
    const accept = ixs[3]
    const offer = offerPda(listing, bidder, PROGRAM)
    expect(flags(accept)).toEqual([
      [listing.toBase58(), false, true],
      [offer.toBase58(), false, true],
      [ata(offer).toBase58(), false, true],
      [entitlementPda(listing, PROGRAM).toBase58(), false, true],
      [configPda(PROGRAM).toBase58(), false, false],
      [MINT.toBase58(), false, false],
      [seller.toBase58(), true, true],
      [ata(seller).toBase58(), false, true],
      [feeRecipient.toBase58(), false, false],
      [ata(feeRecipient).toBase58(), false, true],
      [bidder.toBase58(), false, true],
      [ata(bidder).toBase58(), false, true],
      [TOKEN_PROGRAM_ID.toBase58(), false, false],
      [SystemProgram.programId.toBase58(), false, false],
    ])
    expect(accept.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())).toEqual([seller.toBase58()])
  })
  it('encodes post_bond args and accounts: vault is the bond PDA’s USDC account, only the quant signs', () => {
    const quant = Keypair.generate().publicKey
    const d = encodePostBond({ strategyId: 'my-strategy', amount: 100_000_000n, lockDays: 90, charityIndex: 2 })
    const v = new DataView(d.buffer)
    expect(d.length).toBe(8 + 32 + 8 + 2 + 1)
    expect([...d.slice(0, 8)]).toEqual(IX_DISCRIMINATOR.postBond)
    expect(new TextDecoder().decode(d.slice(8, 8 + 11))).toBe('my-strategy')
    expect(v.getBigUint64(40, true)).toBe(100_000_000n)
    expect(v.getUint16(48, true)).toBe(90)
    expect(d[50]).toBe(2)
    expect(() => encodePostBond({ strategyId: 'x', amount: 1n, lockDays: 1, charityIndex: 256 })).toThrow()

    const bond = bondPda(quant, 'my-strategy', PROGRAM)
    const ix = postBondIx({ quant, strategyId: 'my-strategy', mint: MINT, amount: 1n, lockDays: 1, charityIndex: 0 }, PROGRAM)
    expect(flags(ix).slice(0, 7)).toEqual([
      [bond.toBase58(), false, true],
      [ata(bond).toBase58(), false, true],
      [configPda(PROGRAM).toBase58(), false, false],
      [charitiesPda(PROGRAM).toBase58(), false, false],
      [MINT.toBase58(), false, false],
      [ata(quant).toBase58(), false, true],
      [quant.toBase58(), true, true],
    ])
    expect(ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())).toEqual([quant.toBase58()])

    const rel = releaseBondIx({ quant, strategyId: 'my-strategy', mint: MINT }, PROGRAM)
    expect([...rel.data]).toEqual(IX_DISCRIMINATOR.releaseBond)
    expect(flags(rel)).toEqual([
      [bond.toBase58(), false, true],
      [ata(bond).toBase58(), false, true],
      [configPda(PROGRAM).toBase58(), false, false],
      [MINT.toBase58(), false, false],
      [quant.toBase58(), true, true],
      [ata(quant).toBase58(), false, true],
      [TOKEN_PROGRAM_ID.toBase58(), false, false],
    ])
  })
  it('decodes bonds and the charity list', () => {
    const quant = Keypair.generate().publicKey
    const charity = Keypair.generate().publicKey
    const bb = new Uint8Array(ACCOUNT_SIZE.Bond)
    const bv = new DataView(bb.buffer)
    bb.set(ACCOUNT_DISCRIMINATOR.Bond)
    bb.set(quant.toBytes(), 8)
    bb.set(encodeStrategyId('my-strategy'), BOND_STRATEGY_ID_OFFSET)
    bv.setBigUint64(72, 100_000_000n, true)
    bb.set(charity.toBytes(), 80)
    bv.setBigInt64(112, 1_800_000_000n, true)
    bv.setBigInt64(120, 1_807_776_000n, true)
    bb[128] = 2 // slashed
    bv.setBigInt64(129, 1_800_100_000n, true)
    bb[137] = 251
    expect(138).toBe(ACCOUNT_SIZE.Bond)
    const b = decodeBond(bb)
    expect(b.quant.equals(quant) && b.charity.equals(charity)).toBe(true)
    expect(b.strategyId).toBe('my-strategy')
    expect(b.amount).toBe(100_000_000n)
    expect(b.unlockAt).toBe(1_807_776_000n)
    expect(b.status).toBe('slashed')
    expect(b.resolvedAt).toBe(1_800_100_000n)
    expect(b.bump).toBe(251)
    bb[128] = 7
    expect(() => decodeBond(bb)).toThrow()

    const cb = new Uint8Array(ACCOUNT_SIZE.CharityList)
    cb.set(ACCOUNT_DISCRIMINATOR.CharityList)
    cb[8] = 2
    const w1 = Keypair.generate().publicKey
    const w2 = Keypair.generate().publicKey
    cb.set(w1.toBytes(), 9)
    cb.set(w2.toBytes(), 41)
    cb.set(encodeFixed('Education fund', 32), 9 + 160)
    cb.set(encodeFixed('Health fund', 32), 9 + 160 + 32)
    const list = decodeCharityList(cb)
    expect(list.map((c) => c.name)).toEqual(['Education fund', 'Health fund'])
    expect(list[1].wallet.equals(w2)).toBe(true)
  })
  it('withdraw_offer refunds to the bidder even when someone else submits it', () => {
    const actor = Keypair.generate().publicKey
    const ix = withdrawOfferIx({ listing, bidder, actor, mint: MINT }, PROGRAM)
    expect(ix.keys[5].pubkey.equals(bidder)).toBe(true)
    expect(ix.keys[6].pubkey.equals(ata(bidder))).toBe(true)
    expect(ix.keys[7]).toMatchObject({ isSigner: true })
    expect(ix.keys[7].pubkey.equals(actor)).toBe(true)
  })
})
