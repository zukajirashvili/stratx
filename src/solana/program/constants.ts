import { PublicKey } from '@solana/web3.js'

/**
 * StratX offer-auction program constants. These mirror
 * `onchain/programs/stratx_auction`. The program id can be overridden with
 * VITE_AUCTION_PROGRAM_ID (a public key — not a secret). The app verifies
 * on-chain that it is actually deployed before enabling any transaction.
 */
export const DEFAULT_PROGRAM_ID = 'HhYcWNq54GpyoJ2VaWexsgNF356PQMkKMsW5ZShaLjK'

function readProgramId(): PublicKey {
  const raw = (import.meta.env?.VITE_AUCTION_PROGRAM_ID as string | undefined)?.trim() || DEFAULT_PROGRAM_ID
  try {
    return new PublicKey(raw)
  } catch {
    console.error(`Invalid VITE_AUCTION_PROGRAM_ID "${raw}", falling back to ${DEFAULT_PROGRAM_ID}`)
    return new PublicKey(DEFAULT_PROGRAM_ID)
  }
}

export const AUCTION_PROGRAM_ID = readProgramId()

/** Circle's Devnet USDC. The authoritative mint is the one stored in the program Config. */
export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
export const USDC_FAUCET_URL = 'https://faucet.circle.com'

export const SEEDS = { config: 'config', listing: 'listing', offer: 'offer', entitlement: 'entitlement', charities: 'charities', bond: 'bond' } as const

/** Truth bonds: lock period range and the size of the approved charity list. */
export const MIN_BOND_DAYS = 1
export const MAX_BOND_DAYS = 365
export const MAX_CHARITIES = 5

export const USDC_DECIMALS = 6
export const ONE_USDC = 1_000_000n
export const PROTOCOL_FEE_BPS = 300n
export const BPS_DENOMINATOR = 10_000n
export const MIN_AMOUNT = ONE_USDC
export const MAX_AMOUNT = 100_000_000n * ONE_USDC
export const MIN_LISTING_SECONDS = 5 * 60
export const MAX_LISTING_SECONDS = 90 * 24 * 60 * 60
export const MIN_OFFER_SECONDS = 60
export const MIN_ACCESS_DAYS = 1
export const MAX_ACCESS_DAYS = 365
export const TERMS_VERSION = 1

/** Anchor discriminators = sha256("global:<ix>")[..8] / sha256("account:<Name>")[..8]. Verified in tests. */
export const IX_DISCRIMINATOR = {
  initializeConfig: [208, 127, 21, 1, 194, 190, 196, 70],
  updateFeeRecipient: [249, 0, 198, 35, 183, 123, 57, 188],
  transferAdmin: [42, 242, 66, 106, 228, 10, 111, 156],
  createListing: [18, 168, 45, 24, 191, 31, 117, 54],
  placeOffer: [55, 98, 219, 43, 72, 108, 121, 97],
  withdrawOffer: [203, 38, 131, 234, 204, 122, 53, 150],
  acceptOffer: [227, 82, 234, 131, 1, 18, 48, 2],
  cancelListing: [41, 183, 50, 232, 230, 233, 157, 70],
  closeExpired: [138, 186, 164, 245, 32, 116, 162, 62],
  setCharities: [10, 92, 150, 233, 61, 11, 71, 139],
  postBond: [168, 151, 202, 119, 163, 58, 147, 247],
  releaseBond: [15, 50, 71, 19, 101, 191, 81, 142],
  slashBond: [143, 246, 51, 243, 88, 198, 217, 48],
} as const

export const ACCOUNT_DISCRIMINATOR = {
  Config: [155, 12, 170, 224, 30, 250, 204, 130],
  Listing: [218, 32, 50, 73, 43, 134, 26, 58],
  Offer: [215, 88, 60, 71, 170, 162, 73, 229],
  Entitlement: [220, 250, 27, 244, 55, 49, 74, 154],
  CharityList: [11, 171, 58, 60, 233, 52, 186, 81],
  Bond: [224, 128, 48, 251, 182, 246, 111, 196],
} as const

/** Account sizes (8-byte discriminator included) — must match `InitSpace` in lib.rs. */
export const ACCOUNT_SIZE = {
  Config: 8 + 32 + 32 + 32 + 1,
  Listing: 8 + 32 + 8 + 32 + 64 + 8 + 8 + 8 + 8 + 2 + 1 + 32 + 8 + 8 + 4 + 1,
  Offer: 8 + 32 + 32 + 8 + 8 + 8 + 1,
  Entitlement: 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1,
  CharityList: 8 + 1 + 32 * 5 + 32 * 5 + 1,
  Bond: 8 + 32 + 32 + 8 + 32 + 8 + 8 + 1 + 8 + 1,
} as const

/** Byte offsets used for memcmp filters. */
export const LISTING_STRATEGY_ID_OFFSET = 8 + 32 + 8
export const OFFER_LISTING_OFFSET = 8
export const BOND_STRATEGY_ID_OFFSET = 8 + 32

/** Anchor custom error codes (6000+), in declaration order. */
export const PROGRAM_ERRORS = [
  ['AmountOutOfRange', 'Amount must be between 1 and 100,000,000 USDC.'],
  ['MinOfferAboveAsk', 'The minimum offer cannot be higher than the asking price.'],
  ['ListingWindowOutOfRange', 'The auction must run between 5 minutes and 90 days.'],
  ['AccessTermOutOfRange', 'Access term must be 1–365 days.'],
  ['OfferBelowMinimum', 'Your offer is below the minimum the quant will consider.'],
  ['InvalidOfferExpiry', 'Offer expiry must be at least a minute away and before the auction ends.'],
  ['InvalidStrategyId', 'Strategy id is empty.'],
  ['InvalidTitle', 'Title is empty.'],
  ['ListingNotOpen', 'This auction is closed (sold, cancelled or expired).'],
  ['ListingEnded', 'This auction has ended.'],
  ['ListingNotEnded', 'This auction has not ended yet.'],
  ['OfferExpired', 'This offer has expired.'],
  ['OfferAmountMismatch', 'The offer changed since you loaded it. Refresh and try again.'],
  ['SellerCannotBid', 'You cannot make an offer on your own auction.'],
  ['NotAllowedToWithdraw', 'Only the investor who made this offer can withdraw it while the auction is open.'],
  ['InvalidBidder', 'Bidder account does not match the offer.'],
  ['InvalidFeeRecipient', 'Fee recipient does not match the program configuration.'],
  ['InvalidMint', 'Wrong token — this auction only accepts the configured USDC.'],
  ['Unauthorized', 'You are not authorised to do this.'],
  ['MathOverflow', 'Arithmetic overflow.'],
  ['InsufficientEscrow', 'The escrow holds less than the offer amount.'],
  ['InvalidCharity', 'That charity is not on the approved list.'],
  ['InvalidCharityList', 'The charity list must have 1–5 named wallets.'],
  ['BondTermOutOfRange', 'The bond must be locked for 1–365 days.'],
  ['BondLocked', 'This bond is still locked. You can take it back once the lock period ends.'],
  ['BondNotActive', 'This bond has already been returned or sent to charity.'],
] as const

/**
 * Entitlement terms shown before an offer is placed (TERMS_VERSION = 1).
 * The on-chain Entitlement stores only the version number, never the text.
 */
export const ENTITLEMENT_TERMS = [
  'If the quant accepts your offer, you receive a non-transferable licence to the strategy information or service they disclose on StratX (for example signals or reports) for the stated access term.',
  'You do not get the strategy’s source code, parameters, execution logic or live positions.',
  'It is not a guarantee of profit, an investment product, or a right to have the quant manage your funds.',
  'Your offer is locked in escrow until it is accepted, you withdraw it, or the auction closes. Accepted offers are final. This is an unaudited Devnet MVP using test USDC with no monetary value.',
]
