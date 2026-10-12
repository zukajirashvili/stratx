/**
 * Hand-written Borsh codec for the StratX offer-auction accounts and
 * instruction data. Layouts mirror the Rust structs field-for-field (lib.rs);
 * tests pin the byte layout and discriminators.
 */
import { PublicKey } from '@solana/web3.js'
import { ACCOUNT_DISCRIMINATOR, ACCOUNT_SIZE, IX_DISCRIMINATOR } from '@/solana/program/constants'

export type ListingStatusOnchain = 'open' | 'sold' | 'cancelled' | 'expired'
const STATUS: ListingStatusOnchain[] = ['open', 'sold', 'cancelled', 'expired']

export interface ConfigAccount {
  admin: PublicKey
  feeRecipient: PublicKey
  usdcMint: PublicKey
  bump: number
}

export interface ListingAccount {
  seller: PublicKey
  listingId: bigint
  strategyId: string
  title: string
  askPrice: bigint
  minOffer: bigint
  createdAt: bigint
  endTs: bigint
  accessTermDays: number
  status: ListingStatusOnchain
  buyer: PublicKey | null
  salePrice: bigint
  soldAt: bigint
  offerCount: number
  bump: number
}

export interface OfferAccount {
  listing: PublicKey
  bidder: PublicKey
  amount: bigint
  createdAt: bigint
  /** 0 = valid until the listing ends. */
  expiresAt: bigint
  bump: number
}

export interface EntitlementAccount {
  listing: PublicKey
  buyer: PublicKey
  seller: PublicKey
  strategyId: string
  pricePaid: bigint
  protocolFee: bigint
  sellerProceeds: bigint
  purchasedAt: bigint
  accessExpiresAt: bigint
  termsVersion: number
  bump: number
}

export interface Charity {
  wallet: PublicKey
  name: string
}

export type BondStatusOnchain = 'active' | 'released' | 'slashed'
const BOND_STATUS: BondStatusOnchain[] = ['active', 'released', 'slashed']

export interface BondAccount {
  quant: PublicKey
  strategyId: string
  amount: bigint
  charity: PublicKey
  createdAt: bigint
  unlockAt: bigint
  status: BondStatusOnchain
  resolvedAt: bigint
  bump: number
}

export class CodecError extends Error {}

class Reader {
  private o = 0
  private readonly view: DataView
  private readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }
  private need(n: number) {
    if (this.o + n > this.bytes.length) throw new CodecError('Account data too short')
  }
  pubkey() {
    this.need(32)
    const pk = new PublicKey(this.bytes.slice(this.o, this.o + 32))
    this.o += 32
    return pk
  }
  fixed(n: number) {
    this.need(n)
    const b = this.bytes.slice(this.o, this.o + n)
    this.o += n
    return b
  }
  u8() {
    this.need(1)
    return this.view.getUint8(this.o++)
  }
  u16() {
    this.need(2)
    const v = this.view.getUint16(this.o, true)
    this.o += 2
    return v
  }
  u32() {
    this.need(4)
    const v = this.view.getUint32(this.o, true)
    this.o += 4
    return v
  }
  u64() {
    this.need(8)
    const v = this.view.getBigUint64(this.o, true)
    this.o += 8
    return v
  }
  i64() {
    this.need(8)
    const v = this.view.getBigInt64(this.o, true)
    this.o += 8
    return v
  }
}

function checkDiscriminator(data: Uint8Array, disc: readonly number[], name: string) {
  if (data.length < 8 || disc.some((b, i) => data[i] !== b)) throw new CodecError(`Not a ${name} account`)
}

/** UTF-8 encode into a zero-padded fixed-size field (rejects empty or oversize values). */
export function encodeFixed(value: string, size: number): Uint8Array {
  const bytes = new TextEncoder().encode(value)
  if (bytes.length === 0 || bytes.length > size) throw new CodecError(`Value must be 1–${size} bytes`)
  const out = new Uint8Array(size)
  out.set(bytes)
  return out
}
export const encodeStrategyId = (id: string) => encodeFixed(id, 32)
export const encodeTitle = (t: string) => encodeFixed(t, 64)

/** Trims a title to at most 64 UTF-8 bytes without splitting a character. */
export function fitTitle(t: string): string {
  let out = t.trim()
  while (new TextEncoder().encode(out).length > 64) out = out.slice(0, -1)
  return out
}

export function decodeFixed(bytes: Uint8Array): string {
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end === -1 ? bytes : bytes.slice(0, end))
}

export function decodeConfig(data: Uint8Array): ConfigAccount {
  checkDiscriminator(data, ACCOUNT_DISCRIMINATOR.Config, 'Config')
  const r = new Reader(data.subarray(8))
  return { admin: r.pubkey(), feeRecipient: r.pubkey(), usdcMint: r.pubkey(), bump: r.u8() }
}

export function decodeListing(data: Uint8Array): ListingAccount {
  checkDiscriminator(data, ACCOUNT_DISCRIMINATOR.Listing, 'Listing')
  if (data.length < ACCOUNT_SIZE.Listing) throw new CodecError('Listing account too short')
  const r = new Reader(data.subarray(8))
  const seller = r.pubkey()
  const listingId = r.u64()
  const strategyId = decodeFixed(r.fixed(32))
  const title = decodeFixed(r.fixed(64))
  const askPrice = r.u64()
  const minOffer = r.u64()
  const createdAt = r.i64()
  const endTs = r.i64()
  const accessTermDays = r.u16()
  const statusByte = r.u8()
  const status = STATUS[statusByte]
  if (!status) throw new CodecError(`Unknown listing status ${statusByte}`)
  const buyer = r.pubkey()
  return {
    seller,
    listingId,
    strategyId,
    title,
    askPrice,
    minOffer,
    createdAt,
    endTs,
    accessTermDays,
    status,
    buyer: buyer.equals(PublicKey.default) ? null : buyer,
    salePrice: r.u64(),
    soldAt: r.i64(),
    offerCount: r.u32(),
    bump: r.u8(),
  }
}

export function decodeOffer(data: Uint8Array): OfferAccount {
  checkDiscriminator(data, ACCOUNT_DISCRIMINATOR.Offer, 'Offer')
  const r = new Reader(data.subarray(8))
  return { listing: r.pubkey(), bidder: r.pubkey(), amount: r.u64(), createdAt: r.i64(), expiresAt: r.i64(), bump: r.u8() }
}

export function decodeEntitlement(data: Uint8Array): EntitlementAccount {
  checkDiscriminator(data, ACCOUNT_DISCRIMINATOR.Entitlement, 'Entitlement')
  const r = new Reader(data.subarray(8))
  return {
    listing: r.pubkey(),
    buyer: r.pubkey(),
    seller: r.pubkey(),
    strategyId: decodeFixed(r.fixed(32)),
    pricePaid: r.u64(),
    protocolFee: r.u64(),
    sellerProceeds: r.u64(),
    purchasedAt: r.i64(),
    accessExpiresAt: r.i64(),
    termsVersion: r.u8(),
    bump: r.u8(),
  }
}

/** Approved charities, in list order (the order `post_bond`'s charity index refers to). */
export function decodeCharityList(data: Uint8Array): Charity[] {
  checkDiscriminator(data, ACCOUNT_DISCRIMINATOR.CharityList, 'CharityList')
  const r = new Reader(data.subarray(8))
  const count = r.u8()
  const wallets = Array.from({ length: 5 }, () => r.pubkey())
  const names = Array.from({ length: 5 }, () => decodeFixed(r.fixed(32)))
  return wallets.slice(0, Math.min(count, 5)).map((wallet, i) => ({ wallet, name: names[i] }))
}

export function decodeBond(data: Uint8Array): BondAccount {
  checkDiscriminator(data, ACCOUNT_DISCRIMINATOR.Bond, 'Bond')
  const r = new Reader(data.subarray(8))
  const quant = r.pubkey()
  const strategyId = decodeFixed(r.fixed(32))
  const amount = r.u64()
  const charity = r.pubkey()
  const createdAt = r.i64()
  const unlockAt = r.i64()
  const statusByte = r.u8()
  const status = BOND_STATUS[statusByte]
  if (!status) throw new CodecError(`Unknown bond status ${statusByte}`)
  return { quant, strategyId, amount, charity, createdAt, unlockAt, status, resolvedAt: r.i64(), bump: r.u8() }
}

/* ------------------------------------------------------------------ instruction data */

class Writer {
  private readonly buf: Uint8Array
  private readonly view: DataView
  private o = 0
  constructor(size: number) {
    this.buf = new Uint8Array(size)
    this.view = new DataView(this.buf.buffer)
  }
  raw(b: ArrayLike<number>) {
    this.buf.set(b, this.o)
    this.o += b.length
    return this
  }
  u16(v: number) {
    this.view.setUint16(this.o, v, true)
    this.o += 2
    return this
  }
  u64(v: bigint) {
    if (v < 0n || v > 0xffff_ffff_ffff_ffffn) throw new CodecError('u64 out of range')
    this.view.setBigUint64(this.o, v, true)
    this.o += 8
    return this
  }
  i64(v: bigint) {
    this.view.setBigInt64(this.o, v, true)
    this.o += 8
    return this
  }
  done() {
    if (this.o !== this.buf.length) throw new CodecError('Instruction length mismatch')
    return this.buf
  }
}

export function encodeCreateListing(a: {
  listingId: bigint
  strategyId: string
  title: string
  askPrice: bigint
  minOffer: bigint
  endTs: bigint
  accessTermDays: number
}): Uint8Array {
  return new Writer(8 + 8 + 32 + 64 + 8 + 8 + 8 + 2)
    .raw(IX_DISCRIMINATOR.createListing)
    .u64(a.listingId)
    .raw(encodeStrategyId(a.strategyId))
    .raw(encodeTitle(a.title))
    .u64(a.askPrice)
    .u64(a.minOffer)
    .i64(a.endTs)
    .u16(a.accessTermDays)
    .done()
}

export function encodePlaceOffer(amount: bigint, expiresAt: bigint): Uint8Array {
  return new Writer(24).raw(IX_DISCRIMINATOR.placeOffer).u64(amount).i64(expiresAt).done()
}

export function encodeAcceptOffer(expectedAmount: bigint): Uint8Array {
  return new Writer(16).raw(IX_DISCRIMINATOR.acceptOffer).u64(expectedAmount).done()
}

export function encodePostBond(a: { strategyId: string; amount: bigint; lockDays: number; charityIndex: number }): Uint8Array {
  if (!Number.isInteger(a.charityIndex) || a.charityIndex < 0 || a.charityIndex > 255) throw new CodecError('Charity index out of range')
  return new Writer(8 + 32 + 8 + 2 + 1)
    .raw(IX_DISCRIMINATOR.postBond)
    .raw(encodeStrategyId(a.strategyId))
    .u64(a.amount)
    .u16(a.lockDays)
    .raw([a.charityIndex])
    .done()
}

export const encodeReleaseBond = () => new Uint8Array(IX_DISCRIMINATOR.releaseBond)
export const encodeWithdrawOffer = () => new Uint8Array(IX_DISCRIMINATOR.withdrawOffer)
export const encodeCancelListing = () => new Uint8Array(IX_DISCRIMINATOR.cancelListing)
export const encodeCloseExpired = () => new Uint8Array(IX_DISCRIMINATOR.closeExpired)
