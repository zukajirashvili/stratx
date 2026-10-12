//! Offer-auction arithmetic and parameter validation.
//!
//! Pure integer arithmetic in USDC base units (6 decimals) — no floating
//! point, no Anchor types — so it can be unit-tested with plain `cargo test`
//! and mirrored exactly by the TypeScript client (`src/solana/program/pricing.ts`).

/// Protocol fee: 3.00% expressed in basis points.
pub const PROTOCOL_FEE_BPS: u64 = 300;
pub const BPS_DENOMINATOR: u64 = 10_000;

/// USDC has 6 decimals.
pub const USDC_DECIMALS: u8 = 6;
pub const ONE_USDC: u64 = 1_000_000;

/// Smallest asking price / offer (1 USDC) and largest asking price / offer (100,000,000 USDC).
pub const MIN_AMOUNT: u64 = ONE_USDC;
pub const MAX_AMOUNT: u64 = 100_000_000 * ONE_USDC;

/// Listing window: at least 5 minutes, at most 90 days.
pub const MIN_LISTING_SECONDS: i64 = 5 * 60;
pub const MAX_LISTING_SECONDS: i64 = 90 * 24 * 60 * 60;
/// An offer with its own expiry must stay valid at least 1 minute.
pub const MIN_OFFER_SECONDS: i64 = 60;

pub const MIN_ACCESS_DAYS: u16 = 1;
pub const MAX_ACCESS_DAYS: u16 = 365;

/// Truth bond lock period: 1 to 365 days.
pub const MIN_BOND_DAYS: u16 = 1;
pub const MAX_BOND_DAYS: u16 = 365;

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum ParamError {
    AmountOutOfRange,
    MinOfferAboveAsk,
    ListingWindowOutOfRange,
    AccessTermOutOfRange,
    OfferBelowMinimum,
    InvalidOfferExpiry,
    BondTermOutOfRange,
}

/// Validates a new truth bond and returns its unlock time.
pub fn validate_bond(amount: u64, lock_days: u16, now: i64) -> Result<i64, ParamError> {
    if !(MIN_AMOUNT..=MAX_AMOUNT).contains(&amount) {
        return Err(ParamError::AmountOutOfRange);
    }
    if !(MIN_BOND_DAYS..=MAX_BOND_DAYS).contains(&lock_days) {
        return Err(ParamError::BondTermOutOfRange);
    }
    now.checked_add(lock_days as i64 * 86_400).ok_or(ParamError::BondTermOutOfRange)
}

/// Validates a new listing. `now` is the cluster clock.
pub fn validate_listing(ask_price: u64, min_offer: u64, end_ts: i64, access_term_days: u16, now: i64) -> Result<(), ParamError> {
    if !(MIN_AMOUNT..=MAX_AMOUNT).contains(&ask_price) || !(MIN_AMOUNT..=MAX_AMOUNT).contains(&min_offer) {
        return Err(ParamError::AmountOutOfRange);
    }
    if min_offer > ask_price {
        return Err(ParamError::MinOfferAboveAsk);
    }
    let window = end_ts.checked_sub(now).ok_or(ParamError::ListingWindowOutOfRange)?;
    if !(MIN_LISTING_SECONDS..=MAX_LISTING_SECONDS).contains(&window) {
        return Err(ParamError::ListingWindowOutOfRange);
    }
    if !(MIN_ACCESS_DAYS..=MAX_ACCESS_DAYS).contains(&access_term_days) {
        return Err(ParamError::AccessTermOutOfRange);
    }
    Ok(())
}

/// Validates a new offer against its listing. `expires_at == 0` means "valid until the listing ends".
pub fn validate_offer(amount: u64, min_offer: u64, expires_at: i64, listing_end_ts: i64, now: i64) -> Result<(), ParamError> {
    if amount > MAX_AMOUNT {
        return Err(ParamError::AmountOutOfRange);
    }
    if amount < min_offer || amount < MIN_AMOUNT {
        return Err(ParamError::OfferBelowMinimum);
    }
    if expires_at != 0 && (expires_at < now.saturating_add(MIN_OFFER_SECONDS) || expires_at > listing_end_ts) {
        return Err(ParamError::InvalidOfferExpiry);
    }
    Ok(())
}

/// True when an offer can no longer be accepted.
pub fn offer_expired(expires_at: i64, listing_end_ts: i64, now: i64) -> bool {
    now >= listing_end_ts || (expires_at != 0 && now >= expires_at)
}

/// Splits an accepted offer into (protocol_fee, seller_proceeds).
///
/// fee = floor(amount × 300 / 10_000); seller = amount − fee. The fee is
/// rounded DOWN (the protocol never takes more than 3%) and the seller
/// receives the remainder, so `fee + seller == amount` for every input.
pub fn split_payment(amount: u64) -> (u64, u64) {
    let fee = ((amount as u128) * (PROTOCOL_FEE_BPS as u128) / (BPS_DENOMINATOR as u128)) as u64;
    (fee, amount - fee)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_split_15000_usdc() {
        // 14,000 USDC accepted → 420 USDC fee, 13,580 USDC to the quant.
        assert_eq!(split_payment(14_000 * ONE_USDC), (420 * ONE_USDC, 13_580 * ONE_USDC));
        assert_eq!(split_payment(ONE_USDC), (30_000, 970_000));
    }

    #[test]
    fn fee_split_rounds_fee_down_and_sums_exactly() {
        for amount in [1u64, 33, 34, 99, 101, 333, 1_000_001, 123_456_789, MAX_AMOUNT] {
            let (fee, seller) = split_payment(amount);
            assert_eq!(fee + seller, amount);
            assert_eq!(fee, amount * 3 / 100);
        }
        assert_eq!(split_payment(33), (0, 33));
        assert_eq!(split_payment(1_000_033), (30_000, 970_033));
    }

    #[test]
    fn validates_listings() {
        let now = 10_000;
        let ask = 15_000 * ONE_USDC;
        assert_eq!(validate_listing(ask, 10_000 * ONE_USDC, now + 3_600, 30, now), Ok(()));
        assert_eq!(validate_listing(ask, ask, now + 3_600, 30, now), Ok(()));
        assert_eq!(validate_listing(ask, ask + 1, now + 3_600, 30, now), Err(ParamError::MinOfferAboveAsk));
        assert_eq!(validate_listing(ONE_USDC - 1, ONE_USDC - 1, now + 3_600, 30, now), Err(ParamError::AmountOutOfRange));
        assert_eq!(validate_listing(MAX_AMOUNT + 1, ONE_USDC, now + 3_600, 30, now), Err(ParamError::AmountOutOfRange));
        assert_eq!(validate_listing(ask, ONE_USDC, now + 299, 30, now), Err(ParamError::ListingWindowOutOfRange));
        assert_eq!(validate_listing(ask, ONE_USDC, now - 1, 30, now), Err(ParamError::ListingWindowOutOfRange));
        assert_eq!(validate_listing(ask, ONE_USDC, now + MAX_LISTING_SECONDS + 1, 30, now), Err(ParamError::ListingWindowOutOfRange));
        assert_eq!(validate_listing(ask, ONE_USDC, now + 3_600, 0, now), Err(ParamError::AccessTermOutOfRange));
        assert_eq!(validate_listing(ask, ONE_USDC, now + 3_600, 366, now), Err(ParamError::AccessTermOutOfRange));
    }

    #[test]
    fn validates_offers() {
        let (now, end, min) = (10_000, 20_000, 5 * ONE_USDC);
        assert_eq!(validate_offer(12 * ONE_USDC, min, 0, end, now), Ok(()));
        assert_eq!(validate_offer(min, min, now + 60, end, now), Ok(()));
        assert_eq!(validate_offer(min - 1, min, 0, end, now), Err(ParamError::OfferBelowMinimum));
        assert_eq!(validate_offer(MAX_AMOUNT + 1, min, 0, end, now), Err(ParamError::AmountOutOfRange));
        assert_eq!(validate_offer(min, min, now + 59, end, now), Err(ParamError::InvalidOfferExpiry));
        assert_eq!(validate_offer(min, min, end + 1, end, now), Err(ParamError::InvalidOfferExpiry));
    }

    #[test]
    fn validates_bonds() {
        let now = 10_000;
        assert_eq!(validate_bond(100 * ONE_USDC, 90, now), Ok(now + 90 * 86_400));
        assert_eq!(validate_bond(ONE_USDC, 1, now), Ok(now + 86_400));
        assert_eq!(validate_bond(ONE_USDC - 1, 90, now), Err(ParamError::AmountOutOfRange));
        assert_eq!(validate_bond(MAX_AMOUNT + 1, 90, now), Err(ParamError::AmountOutOfRange));
        assert_eq!(validate_bond(100 * ONE_USDC, 0, now), Err(ParamError::BondTermOutOfRange));
        assert_eq!(validate_bond(100 * ONE_USDC, 366, now), Err(ParamError::BondTermOutOfRange));
    }

    #[test]
    fn expiry_rules() {
        assert!(!offer_expired(0, 100, 99));
        assert!(offer_expired(0, 100, 100));
        assert!(offer_expired(50, 100, 50));
        assert!(!offer_expired(50, 100, 49));
    }
}
