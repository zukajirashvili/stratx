//! StratX Offer Auction — Solana program (Anchor), paid in USDC.
//!
//! How it works
//! 1. A quant creates a LISTING for a strategy access licence with an asking
//!    price, a minimum acceptable offer and an end time.
//! 2. Investors place OFFERS. Each offer's USDC is locked in an escrow vault
//!    owned by the program (one vault per offer).
//! 3. The quant ACCEPTS the offer they like (not necessarily the highest).
//!    The program atomically pays exactly 3% to the configured protocol fee
//!    recipient and 97% to the quant, records an Entitlement, and closes the
//!    listing. Only one offer can ever be accepted.
//! 4. Every other offer can be withdrawn by its bidder at any time while the
//!    listing is open, and by anyone (refund always goes to the bidder) once
//!    the listing is sold, cancelled, ended, or the offer expired.
//!
//! Truth bonds: a quant can lock USDC behind the claim that a strategy's
//! published results are genuine. If the StratX admin finds them false, the
//! bond goes to the charity the quant picked from an admin-approved list;
//! otherwise the quant can take it back after the lock period.
//!
//! The entitlement grants access to the strategy's permitted, creator-disclosed
//! information for `access_term_days`. It does NOT convey ownership of source
//! code, any guarantee of profit, or any right to manage investor funds. Only
//! the public strategy id/title and settlement data are stored on-chain.
//!
//! NOT AUDITED. Devnet MVP.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

pub mod pricing;
use pricing::{offer_expired, split_payment, validate_bond, validate_listing, validate_offer, ParamError, USDC_DECIMALS};

declare_id!("HhYcWNq54GpyoJ2VaWexsgNF356PQMkKMsW5ZShaLjK");

pub const CONFIG_SEED: &[u8] = b"config";
pub const LISTING_SEED: &[u8] = b"listing";
pub const OFFER_SEED: &[u8] = b"offer";
pub const ENTITLEMENT_SEED: &[u8] = b"entitlement";
pub const CHARITIES_SEED: &[u8] = b"charities";
pub const BOND_SEED: &[u8] = b"bond";
/// Maximum number of approved charities.
pub const MAX_CHARITIES: usize = 5;
/// Version of the licence terms shown to buyers (docs/AUCTION.md).
pub const TERMS_VERSION: u8 = 1;

#[program]
pub mod stratx_auction {
    use super::*;

    /// One-time setup by the program's upgrade authority (prevents front-running
    /// the admin role). Stores the fee recipient wallet and the USDC mint.
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        require!(ctx.accounts.usdc_mint.decimals == USDC_DECIMALS, AuctionError::InvalidMint);
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.fee_recipient = ctx.accounts.fee_recipient.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.bump = ctx.bumps.config;
        emit!(ConfigUpdated { admin: config.admin, fee_recipient: config.fee_recipient });
        Ok(())
    }

    /// Admin-only: change the wallet that receives the 3% protocol fee.
    pub fn update_fee_recipient(ctx: Context<UpdateFeeRecipient>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.fee_recipient = ctx.accounts.new_fee_recipient.key();
        emit!(ConfigUpdated { admin: config.admin, fee_recipient: config.fee_recipient });
        Ok(())
    }

    /// Admin-only: hand the admin role to another key.
    pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
        require_keys_neq!(new_admin, Pubkey::default(), AuctionError::Unauthorized);
        let config = &mut ctx.accounts.config;
        config.admin = new_admin;
        emit!(ConfigUpdated { admin: config.admin, fee_recipient: config.fee_recipient });
        Ok(())
    }

    /// Quant creates a listing. The signer becomes the seller (authorised payee).
    pub fn create_listing(
        ctx: Context<CreateListing>,
        listing_id: u64,
        strategy_id: [u8; 32],
        title: [u8; 64],
        ask_price: u64,
        min_offer: u64,
        end_ts: i64,
        access_term_days: u16,
    ) -> Result<()> {
        require!(strategy_id[0] != 0, AuctionError::InvalidStrategyId);
        require!(title[0] != 0, AuctionError::InvalidTitle);
        let now = Clock::get()?.unix_timestamp;
        validate_listing(ask_price, min_offer, end_ts, access_term_days, now).map_err(to_error)?;

        let l = &mut ctx.accounts.listing;
        l.seller = ctx.accounts.seller.key();
        l.listing_id = listing_id;
        l.strategy_id = strategy_id;
        l.title = title;
        l.ask_price = ask_price;
        l.min_offer = min_offer;
        l.created_at = now;
        l.end_ts = end_ts;
        l.access_term_days = access_term_days;
        l.status = ListingStatus::Open;
        l.buyer = Pubkey::default();
        l.sale_price = 0;
        l.sold_at = 0;
        l.offer_count = 0;
        l.bump = ctx.bumps.listing;

        emit!(ListingCreated { listing: l.key(), seller: l.seller, strategy_id, ask_price, min_offer, end_ts, access_term_days });
        Ok(())
    }

    /// Investor places an offer; `amount` USDC moves into the offer's escrow vault.
    /// `expires_at == 0` keeps the offer valid until the listing ends.
    pub fn place_offer(ctx: Context<PlaceOffer>, amount: u64, expires_at: i64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let l = &ctx.accounts.listing;
        require!(l.status == ListingStatus::Open, AuctionError::ListingNotOpen);
        require!(now < l.end_ts, AuctionError::ListingEnded);
        require_keys_neq!(ctx.accounts.bidder.key(), l.seller, AuctionError::SellerCannotBid);
        validate_offer(amount, l.min_offer, expires_at, l.end_ts, now).map_err(to_error)?;

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.bidder_token.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.bidder.to_account_info(),
                },
            ),
            amount,
            USDC_DECIMALS,
        )?;

        let o = &mut ctx.accounts.offer;
        o.listing = ctx.accounts.listing.key();
        o.bidder = ctx.accounts.bidder.key();
        o.amount = amount;
        o.created_at = now;
        o.expires_at = expires_at;
        o.bump = ctx.bumps.offer;

        let l = &mut ctx.accounts.listing;
        l.offer_count = l.offer_count.checked_add(1).ok_or(AuctionError::MathOverflow)?;

        emit!(OfferPlaced { listing: l.key(), offer: o.key(), bidder: o.bidder, amount, expires_at });
        Ok(())
    }

    /// Returns an offer's escrowed USDC to the bidder and closes the offer.
    /// The bidder may withdraw at any time while the offer is live; anyone may
    /// trigger the refund once the listing is no longer open, has ended, or the
    /// offer expired. Funds only ever go back to the bidder.
    pub fn withdraw_offer(ctx: Context<WithdrawOffer>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let l = &ctx.accounts.listing;
        let o = &ctx.accounts.offer;
        let allowed = ctx.accounts.actor.key() == o.bidder
            || l.status != ListingStatus::Open
            || offer_expired(o.expires_at, l.end_ts, now);
        require!(allowed, AuctionError::NotAllowedToWithdraw);

        let listing_key = l.key();
        let bidder_key = o.bidder;
        let bump = [o.bump];
        let seeds: &[&[u8]] = &[OFFER_SEED, listing_key.as_ref(), bidder_key.as_ref(), &bump];
        let signer = &[seeds];

        let refund = ctx.accounts.vault.amount;
        let a = &ctx.accounts;
        pay_from_vault(&a.token_program, &a.vault, &a.usdc_mint, &a.offer, a.bidder_token.to_account_info(), refund, signer)?;
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.bidder.to_account_info(),
                authority: ctx.accounts.offer.to_account_info(),
            },
            signer,
        ))?;

        let l = &mut ctx.accounts.listing;
        l.offer_count = l.offer_count.saturating_sub(1);
        emit!(OfferWithdrawn { listing: listing_key, bidder: bidder_key, amount: refund });
        Ok(())
        // `close = bidder` on the offer account returns its rent to the bidder.
    }

    /// Seller accepts one offer. `expected_amount` must equal the offer's
    /// amount, so a bidder cannot swap in a lower offer between the seller
    /// viewing it and accepting it.
    pub fn accept_offer(ctx: Context<AcceptOffer>, expected_amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let l = &ctx.accounts.listing;
        let o = &ctx.accounts.offer;
        require!(l.status == ListingStatus::Open, AuctionError::ListingNotOpen);
        require!(!offer_expired(o.expires_at, l.end_ts, now), AuctionError::OfferExpired);
        require!(o.amount == expected_amount, AuctionError::OfferAmountMismatch);
        require!(ctx.accounts.vault.amount >= o.amount, AuctionError::InsufficientEscrow);

        let amount = o.amount;
        let (fee, proceeds) = split_payment(amount);
        require!(fee.checked_add(proceeds) == Some(amount), AuctionError::MathOverflow);

        let listing_key = l.key();
        let bidder_key = o.bidder;
        let bump = [o.bump];
        let seeds: &[&[u8]] = &[OFFER_SEED, listing_key.as_ref(), bidder_key.as_ref(), &bump];
        let signer = &[seeds];
        let a = &ctx.accounts;

        // Atomic distribution: all transfers succeed or the whole transaction reverts.
        pay_from_vault(&a.token_program, &a.vault, &a.usdc_mint, &a.offer, a.fee_recipient_token.to_account_info(), fee, signer)?;
        pay_from_vault(&a.token_program, &a.vault, &a.usdc_mint, &a.offer, a.seller_token.to_account_info(), proceeds, signer)?;
        // Anything else in the vault (e.g. a stray deposit) goes back to the bidder.
        // `vault.amount` is the balance read before these transfers.
        let dust = a.vault.amount - amount;
        pay_from_vault(&a.token_program, &a.vault, &a.usdc_mint, &a.offer, a.bidder_token.to_account_info(), dust, signer)?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.bidder.to_account_info(),
                authority: ctx.accounts.offer.to_account_info(),
            },
            signer,
        ))?;

        let l = &mut ctx.accounts.listing;
        l.status = ListingStatus::Sold;
        l.buyer = bidder_key;
        l.sale_price = amount;
        l.sold_at = now;
        l.offer_count = l.offer_count.saturating_sub(1);

        let e = &mut ctx.accounts.entitlement;
        e.listing = listing_key;
        e.buyer = bidder_key;
        e.seller = l.seller;
        e.strategy_id = l.strategy_id;
        e.price_paid = amount;
        e.protocol_fee = fee;
        e.seller_proceeds = proceeds;
        e.purchased_at = now;
        e.access_expires_at = now
            .checked_add((l.access_term_days as i64) * 86_400)
            .ok_or(AuctionError::MathOverflow)?;
        e.terms_version = TERMS_VERSION;
        e.bump = ctx.bumps.entitlement;

        emit!(OfferAccepted {
            listing: listing_key,
            buyer: bidder_key,
            seller: l.seller,
            fee_recipient: ctx.accounts.fee_recipient.key(),
            amount,
            protocol_fee: fee,
            seller_proceeds: proceeds,
        });
        Ok(())
    }

    /// Seller withdraws an open listing. Outstanding offers become refundable by anyone.
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let l = &mut ctx.accounts.listing;
        require!(l.status == ListingStatus::Open, AuctionError::ListingNotOpen);
        l.status = ListingStatus::Cancelled;
        emit!(ListingClosed { listing: l.key(), status: 2 });
        Ok(())
    }

    /// Permissionless: records that an unsold listing has ended. No offer can
    /// be placed or accepted after `end_ts` regardless.
    pub fn close_expired(ctx: Context<CloseExpired>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let l = &mut ctx.accounts.listing;
        require!(l.status == ListingStatus::Open, AuctionError::ListingNotOpen);
        require!(now >= l.end_ts, AuctionError::ListingNotEnded);
        l.status = ListingStatus::Expired;
        emit!(ListingClosed { listing: l.key(), status: 3 });
        Ok(())
    }

    /* -------------------------------------------------------------- truth bonds */

    /// Admin-only: sets the approved charities a quant can choose for a truth bond
    /// (1–5 wallets, each with a display name). Creates the list on first use.
    pub fn set_charities(ctx: Context<SetCharities>, wallets: Vec<Pubkey>, names: Vec<[u8; 32]>) -> Result<()> {
        require!(!wallets.is_empty() && wallets.len() <= MAX_CHARITIES, AuctionError::InvalidCharityList);
        require!(wallets.len() == names.len(), AuctionError::InvalidCharityList);
        for (w, n) in wallets.iter().zip(names.iter()) {
            require!(*w != Pubkey::default() && n[0] != 0, AuctionError::InvalidCharityList);
        }
        let list = &mut ctx.accounts.charities;
        list.count = wallets.len() as u8;
        list.wallets = [Pubkey::default(); MAX_CHARITIES];
        list.names = [[0u8; 32]; MAX_CHARITIES];
        for i in 0..wallets.len() {
            list.wallets[i] = wallets[i];
            list.names[i] = names[i];
        }
        list.bump = ctx.bumps.charities;
        Ok(())
    }

    /// Quant locks `amount` USDC behind the claim that a strategy's published
    /// results are genuine. If the StratX admin later finds them false, the bond
    /// goes to the charity the quant picked (`charity_index` in the approved
    /// list). Otherwise the quant can take it back after `lock_days`.
    pub fn post_bond(ctx: Context<PostBond>, strategy_id: [u8; 32], amount: u64, lock_days: u16, charity_index: u8) -> Result<()> {
        require!(strategy_id[0] != 0, AuctionError::InvalidStrategyId);
        let list = &ctx.accounts.charities;
        require!((charity_index as usize) < list.count as usize, AuctionError::InvalidCharity);
        let now = Clock::get()?.unix_timestamp;
        let unlock_at = validate_bond(amount, lock_days, now).map_err(to_error)?;

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.quant_token.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.quant.to_account_info(),
                },
            ),
            amount,
            USDC_DECIMALS,
        )?;

        let b = &mut ctx.accounts.bond;
        b.quant = ctx.accounts.quant.key();
        b.strategy_id = strategy_id;
        b.amount = amount;
        b.charity = list.wallets[charity_index as usize];
        b.created_at = now;
        b.unlock_at = unlock_at;
        b.status = BondStatus::Active;
        b.resolved_at = 0;
        b.bump = ctx.bumps.bond;
        emit!(BondPosted { bond: b.key(), quant: b.quant, strategy_id, amount, charity: b.charity, unlock_at });
        Ok(())
    }

    /// Quant takes an active bond back once its lock period has passed.
    pub fn release_bond(ctx: Context<ReleaseBond>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let b = &ctx.accounts.bond;
        require!(b.status == BondStatus::Active, AuctionError::BondNotActive);
        require!(now >= b.unlock_at, AuctionError::BondLocked);
        let amount = ctx.accounts.vault.amount;
        empty_bond_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.usdc_mint, &ctx.accounts.bond, ctx.accounts.quant_token.to_account_info(), ctx.accounts.quant.to_account_info(), amount)?;
        let b = &mut ctx.accounts.bond;
        b.status = BondStatus::Released;
        b.resolved_at = now;
        emit!(BondResolved { bond: b.key(), quant: b.quant, to: b.quant, amount, slashed: false });
        Ok(())
    }

    /// Admin-only: the strategy's published results were found to be false.
    /// The whole bond goes to the charity the quant chose. Allowed while the
    /// bond is active, including after its lock period if it wasn't released.
    pub fn slash_bond(ctx: Context<SlashBond>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.bond.status == BondStatus::Active, AuctionError::BondNotActive);
        let amount = ctx.accounts.vault.amount;
        empty_bond_vault(&ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.usdc_mint, &ctx.accounts.bond, ctx.accounts.charity_token.to_account_info(), ctx.accounts.quant.to_account_info(), amount)?;
        let b = &mut ctx.accounts.bond;
        b.status = BondStatus::Slashed;
        b.resolved_at = now;
        emit!(BondResolved { bond: b.key(), quant: b.quant, to: b.charity, amount, slashed: true });
        Ok(())
    }
}

/// Pays a bond vault's whole balance to `to` and closes the vault (rent back to the quant).
fn empty_bond_vault<'info>(
    token_program: &Program<'info, Token>,
    vault: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    bond: &Account<'info, Bond>,
    to: AccountInfo<'info>,
    rent_to: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let bump = [bond.bump];
    let seeds: &[&[u8]] = &[BOND_SEED, bond.quant.as_ref(), bond.strategy_id.as_ref(), &bump];
    let signer = &[seeds];
    if amount > 0 {
        token::transfer_checked(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                TransferChecked { from: vault.to_account_info(), mint: mint.to_account_info(), to, authority: bond.to_account_info() },
                signer,
            ),
            amount,
            USDC_DECIMALS,
        )?;
    }
    token::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount { account: vault.to_account_info(), destination: rent_to, authority: bond.to_account_info() },
        signer,
    ))
}

/// Transfers `value` USDC out of an offer's escrow vault, signed by the offer PDA.
fn pay_from_vault<'info>(
    token_program: &Program<'info, Token>,
    vault: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    offer: &Account<'info, Offer>,
    to: AccountInfo<'info>,
    value: u64,
    signer: &[&[&[u8]]],
) -> Result<()> {
    if value == 0 {
        return Ok(());
    }
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked { from: vault.to_account_info(), mint: mint.to_account_info(), to, authority: offer.to_account_info() },
            signer,
        ),
        value,
        USDC_DECIMALS,
    )
}

fn to_error(e: ParamError) -> Error {
    match e {
        ParamError::AmountOutOfRange => AuctionError::AmountOutOfRange.into(),
        ParamError::MinOfferAboveAsk => AuctionError::MinOfferAboveAsk.into(),
        ParamError::ListingWindowOutOfRange => AuctionError::ListingWindowOutOfRange.into(),
        ParamError::AccessTermOutOfRange => AuctionError::AccessTermOutOfRange.into(),
        ParamError::OfferBelowMinimum => AuctionError::OfferBelowMinimum.into(),
        ParamError::InvalidOfferExpiry => AuctionError::InvalidOfferExpiry.into(),
        ParamError::BondTermOutOfRange => AuctionError::BondTermOutOfRange.into(),
    }
}

/* ------------------------------------------------------------------ accounts */

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// Wallet that owns the fee token account (its USDC ATA receives the 3%).
    pub fee_recipient: SystemAccount<'info>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ AuctionError::Unauthorized)]
    pub program: Program<'info, crate::program::StratxAuction>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ AuctionError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFeeRecipient<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ AuctionError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    pub new_fee_recipient: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ AuctionError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct CreateListing<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [LISTING_SEED, seller.key().as_ref(), &listing_id.to_le_bytes()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub seller: Signer<'info>,
    /// Config must exist so listings cannot be created before fees are configured.
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceOffer<'info> {
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.seller.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump
    )]
    pub listing: Account<'info, Listing>,
    /// One live offer per bidder per listing.
    #[account(
        init,
        payer = bidder,
        space = 8 + Offer::INIT_SPACE,
        seeds = [OFFER_SEED, listing.key().as_ref(), bidder.key().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,
    /// Escrow: USDC token account owned by the offer PDA.
    #[account(init, payer = bidder, associated_token::mint = usdc_mint, associated_token::authority = offer)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint @ AuctionError::InvalidMint)]
    pub config: Account<'info, Config>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = bidder)]
    pub bidder_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawOffer<'info> {
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.seller.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        seeds = [OFFER_SEED, listing.key().as_ref(), offer.bidder.as_ref()],
        bump = offer.bump,
        has_one = listing @ AuctionError::InvalidBidder,
        close = bidder
    )]
    pub offer: Account<'info, Offer>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = offer)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint @ AuctionError::InvalidMint)]
    pub config: Account<'info, Config>,
    pub usdc_mint: Account<'info, Mint>,
    /// Refunds and rent always go to the bidder recorded in the offer.
    #[account(mut, address = offer.bidder @ AuctionError::InvalidBidder)]
    pub bidder: SystemAccount<'info>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = bidder)]
    pub bidder_token: Account<'info, TokenAccount>,
    /// Whoever submits the transaction (the bidder, or anyone once refunds are open).
    pub actor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AcceptOffer<'info> {
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.seller.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
        has_one = seller @ AuctionError::Unauthorized
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        seeds = [OFFER_SEED, listing.key().as_ref(), offer.bidder.as_ref()],
        bump = offer.bump,
        has_one = listing @ AuctionError::InvalidBidder,
        close = bidder
    )]
    pub offer: Account<'info, Offer>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = offer)]
    pub vault: Account<'info, TokenAccount>,
    /// One entitlement per listing: `init` fails if it already exists.
    #[account(
        init,
        payer = seller,
        space = 8 + Entitlement::INIT_SPACE,
        seeds = [ENTITLEMENT_SEED, listing.key().as_ref()],
        bump
    )]
    pub entitlement: Account<'info, Entitlement>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint @ AuctionError::InvalidMint)]
    pub config: Account<'info, Config>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = seller)]
    pub seller_token: Account<'info, TokenAccount>,
    /// Must be the configured recipient — nobody can redirect the fee.
    #[account(address = config.fee_recipient @ AuctionError::InvalidFeeRecipient)]
    pub fee_recipient: SystemAccount<'info>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = fee_recipient)]
    pub fee_recipient_token: Account<'info, TokenAccount>,
    #[account(mut, address = offer.bidder @ AuctionError::InvalidBidder)]
    pub bidder: SystemAccount<'info>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = bidder)]
    pub bidder_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.seller.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
        has_one = seller @ AuctionError::Unauthorized
    )]
    pub listing: Account<'info, Listing>,
    pub seller: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseExpired<'info> {
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.seller.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump
    )]
    pub listing: Account<'info, Listing>,
}

#[derive(Accounts)]
pub struct SetCharities<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ AuctionError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(init_if_needed, payer = admin, space = 8 + CharityList::INIT_SPACE, seeds = [CHARITIES_SEED], bump)]
    pub charities: Account<'info, CharityList>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(strategy_id: [u8; 32])]
pub struct PostBond<'info> {
    /// One bond per quant per strategy.
    #[account(init, payer = quant, space = 8 + Bond::INIT_SPACE, seeds = [BOND_SEED, quant.key().as_ref(), strategy_id.as_ref()], bump)]
    pub bond: Account<'info, Bond>,
    /// Bond escrow: USDC token account owned by the bond PDA.
    #[account(init, payer = quant, associated_token::mint = usdc_mint, associated_token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint @ AuctionError::InvalidMint)]
    pub config: Account<'info, Config>,
    #[account(seeds = [CHARITIES_SEED], bump = charities.bump)]
    pub charities: Account<'info, CharityList>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = quant)]
    pub quant_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub quant: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseBond<'info> {
    #[account(mut, seeds = [BOND_SEED, bond.quant.as_ref(), bond.strategy_id.as_ref()], bump = bond.bump, has_one = quant @ AuctionError::Unauthorized)]
    pub bond: Account<'info, Bond>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint @ AuctionError::InvalidMint)]
    pub config: Account<'info, Config>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub quant: Signer<'info>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = quant)]
    pub quant_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SlashBond<'info> {
    #[account(mut, seeds = [BOND_SEED, bond.quant.as_ref(), bond.strategy_id.as_ref()], bump = bond.bump)]
    pub bond: Account<'info, Bond>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = bond)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ AuctionError::Unauthorized, has_one = usdc_mint @ AuctionError::InvalidMint)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    /// Must be the charity the quant chose when posting the bond.
    #[account(address = bond.charity @ AuctionError::InvalidCharity)]
    pub charity: SystemAccount<'info>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = charity)]
    pub charity_token: Account<'info, TokenAccount>,
    /// Receives the vault's rent when it is closed.
    #[account(mut, address = bond.quant @ AuctionError::Unauthorized)]
    pub quant: SystemAccount<'info>,
    pub token_program: Program<'info, Token>,
}

/* ------------------------------------------------------------------ state */

/// Field order is part of the client ABI (src/solana/program/codec.ts).
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub fee_recipient: Pubkey,
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ListingStatus {
    Open,
    Sold,
    Cancelled,
    Expired,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub listing_id: u64,
    /// Public strategy id, UTF-8, zero-padded. Never secrets.
    pub strategy_id: [u8; 32],
    /// Public display title, UTF-8, zero-padded.
    pub title: [u8; 64],
    pub ask_price: u64,
    pub min_offer: u64,
    pub created_at: i64,
    pub end_ts: i64,
    pub access_term_days: u16,
    pub status: ListingStatus,
    pub buyer: Pubkey,
    pub sale_price: u64,
    pub sold_at: i64,
    pub offer_count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Offer {
    pub listing: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub created_at: i64,
    /// 0 = valid until the listing ends.
    pub expires_at: i64,
    pub bump: u8,
}

/// Strategy access licence held by the buyer.
#[account]
#[derive(InitSpace)]
pub struct Entitlement {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub strategy_id: [u8; 32],
    pub price_paid: u64,
    pub protocol_fee: u64,
    pub seller_proceeds: u64,
    pub purchased_at: i64,
    pub access_expires_at: i64,
    pub terms_version: u8,
    pub bump: u8,
}

/// Approved charities for truth bonds, set by the admin.
#[account]
#[derive(InitSpace)]
pub struct CharityList {
    pub count: u8,
    pub wallets: [Pubkey; MAX_CHARITIES],
    /// Display names, UTF-8, zero-padded.
    pub names: [[u8; 32]; MAX_CHARITIES],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum BondStatus {
    Active,
    Released,
    Slashed,
}

/// USDC a quant locked behind the claim that a strategy's published results are genuine.
#[account]
#[derive(InitSpace)]
pub struct Bond {
    pub quant: Pubkey,
    pub strategy_id: [u8; 32],
    pub amount: u64,
    pub charity: Pubkey,
    pub created_at: i64,
    pub unlock_at: i64,
    pub status: BondStatus,
    pub resolved_at: i64,
    pub bump: u8,
}

/* ------------------------------------------------------------------ events */

#[event]
pub struct BondPosted {
    pub bond: Pubkey,
    pub quant: Pubkey,
    pub strategy_id: [u8; 32],
    pub amount: u64,
    pub charity: Pubkey,
    pub unlock_at: i64,
}

#[event]
pub struct BondResolved {
    pub bond: Pubkey,
    pub quant: Pubkey,
    /// Quant (released) or charity (slashed).
    pub to: Pubkey,
    pub amount: u64,
    pub slashed: bool,
}

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub fee_recipient: Pubkey,
}

#[event]
pub struct ListingCreated {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub strategy_id: [u8; 32],
    pub ask_price: u64,
    pub min_offer: u64,
    pub end_ts: i64,
    pub access_term_days: u16,
}

#[event]
pub struct OfferPlaced {
    pub listing: Pubkey,
    pub offer: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct OfferWithdrawn {
    pub listing: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OfferAccepted {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub fee_recipient: Pubkey,
    pub amount: u64,
    pub protocol_fee: u64,
    pub seller_proceeds: u64,
}

#[event]
pub struct ListingClosed {
    pub listing: Pubkey,
    /// 2 = cancelled, 3 = expired
    pub status: u8,
}

/* ------------------------------------------------------------------ errors */

/// Error codes start at 6000 (Anchor convention). Order is part of the client ABI.
#[error_code]
pub enum AuctionError {
    #[msg("Amount outside the allowed range")]
    AmountOutOfRange, // 6000
    #[msg("Minimum offer cannot exceed the asking price")]
    MinOfferAboveAsk, // 6001
    #[msg("Listing window must be between 5 minutes and 90 days")]
    ListingWindowOutOfRange, // 6002
    #[msg("Access term outside the allowed range")]
    AccessTermOutOfRange, // 6003
    #[msg("Offer is below the listing's minimum")]
    OfferBelowMinimum, // 6004
    #[msg("Offer expiry is invalid")]
    InvalidOfferExpiry, // 6005
    #[msg("Strategy id is empty")]
    InvalidStrategyId, // 6006
    #[msg("Title is empty")]
    InvalidTitle, // 6007
    #[msg("Listing is not open")]
    ListingNotOpen, // 6008
    #[msg("Listing has ended")]
    ListingEnded, // 6009
    #[msg("Listing has not ended yet")]
    ListingNotEnded, // 6010
    #[msg("Offer has expired")]
    OfferExpired, // 6011
    #[msg("Offer amount changed")]
    OfferAmountMismatch, // 6012
    #[msg("Sellers cannot bid on their own listing")]
    SellerCannotBid, // 6013
    #[msg("Only the bidder can withdraw a live offer")]
    NotAllowedToWithdraw, // 6014
    #[msg("Bidder account does not match the offer")]
    InvalidBidder, // 6015
    #[msg("Fee recipient does not match the configured recipient")]
    InvalidFeeRecipient, // 6016
    #[msg("Token mint does not match the configured USDC mint")]
    InvalidMint, // 6017
    #[msg("Unauthorized")]
    Unauthorized, // 6018
    #[msg("Arithmetic overflow")]
    MathOverflow, // 6019
    #[msg("Escrow holds less than the offer amount")]
    InsufficientEscrow, // 6020
    #[msg("Charity is not on the approved list")]
    InvalidCharity, // 6021
    #[msg("Charity list must have 1-5 named wallets")]
    InvalidCharityList, // 6022
    #[msg("Bond lock period must be 1-365 days")]
    BondTermOutOfRange, // 6023
    #[msg("Bond is still locked")]
    BondLocked, // 6024
    #[msg("Bond is not active")]
    BondNotActive, // 6025
}
