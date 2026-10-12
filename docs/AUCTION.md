# StratX Offer Auction — Solana Devnet (USDC)

A real Anchor program (`onchain/programs/stratx_auction`) sells a **Strategy Access Licence** like this:

1. **The quant creates a listing:** an asking price (e.g. $15,000), the lowest offer they'll consider, how long offers are taken, and the licence length.
2. **Investors make offers** (e.g. $12,000, then $14,000 fifteen minutes later). Each offer's USDC is **locked in an escrow vault** owned by the program, one vault per offer.
3. **The quant accepts the offer they like.** It doesn't have to be the highest. In one transaction the program:
   - pays **exactly 3 %** to the configured fee recipient and **97 %** to the quant
   - records an `Entitlement`
   - closes the listing (only one offer can ever be accepted)
4. **Every other offer is refundable.** The bidder can withdraw at any time while the listing is open. Once the listing is sold, cancelled or ended, or the offer has expired, anyone can trigger the refund. Funds only ever go back to the bidder.

> **Status: DEPLOYED to Solana Devnet and initialised (2026-10-12).** Built in WSL Ubuntu with Agave 2.1.21 and Anchor 0.31.1; `cargo test` (6 pricing tests) and the bankrun suite (17 integration tests) pass. Not audited.

## Deployment record

| Item | Value |
|---|---|
| Cluster | Devnet |
| Program ID | `HhYcWNq54GpyoJ2VaWexsgNF356PQMkKMsW5ZShaLjK` |
| ProgramData | `8ykYeBYQTpscdnVnceQHSZnaAFcQHqd4EJxnoMpVaVwk` |
| Config | `36L1EVTAhxoyko2SM43AxBM2TP5Pjc8coAunQWny7quz` |
| USDC mint | Circle Devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Upgrade authority / admin | `Cg8a1kdGEcmeXgpG3QkLkqoQ3UFGNSc3jcWHLEGDCR3o` (deploy wallet, key kept in WSL `~/.config/solana/id.json`, not in this repo) |
| Fee recipient (+ its USDC account) | `Cg8a1kdGEcmeXgpG3QkLkqoQ3UFGNSc3jcWHLEGDCR3o` (`CqefhFFDGbXNc5XUKxyavtLmvQYrYhSFiCc1DCoKQw5F`) |
| Deploy signature | `ANHhGmcNox33RBpdSJUYsJrJM3zqHeBzobn7oZ7JkTpRCR9599jdShmFWxCQKXJbjTFxBuQAXm4KZ9XKHyfK7TU` |
| Init signatures | `5GJonF1E48UhEviUGMccE5SftrXpGJ7i6iCmYoDXdaGjtCJ362MLxSaUFtwTmTmqjr3ptqExWrhqyYfAM4KYGvrn` (config), `5qJCqfcjpDJz2hMq4EAMfLsEtoupMtQE5XPJNXJ4u4zkFrRymSGMwA8vascwQvEj1EheYev5F8NBjBavbX87qnJX` (fee USDC account) |

**Build notes:** Anchor 0.31.1 needs the Agave 2.1 line (its platform tools ship Rust 1.79). The program pins `rust-version = "1.79"` and `Cargo.lock` pins `blake3 = 1.5.5`; newer blake3 pulls an edition-2024 crate that Rust 1.79 can't build. `onchain/` installs with `npm install --legacy-peer-deps` (anchor-bankrun declares a peer of Anchor 0.30). On Node 22.6+ run the tests with `NODE_OPTIONS=--no-experimental-strip-types`, or Node loads the `.ts` tests natively and bypasses ts-node.

## What is sold

A non-transferable licence to the information or service the quant chooses to disclose, for `access_term_days`. It does **not** include:
- source code, parameters, execution logic or positions
- any guarantee of profit
- any right to manage investor funds

On-chain data is limited to the public strategy id and title, prices, timestamps, parties and amounts.

## Instructions

| Instruction | Who | Rules |
|---|---|---|
| `initialize_config` | program **upgrade authority** only | Stores admin, fee-recipient wallet and USDC mint (must have 6 decimals) |
| `update_fee_recipient` / `transfer_admin` | admin | — |
| `create_listing(id, strategy_id, title, ask, min_offer, end_ts, days)` | any wallet (becomes the seller) | 1 ≤ min ≤ ask ≤ 100M USDC; window 5 min–90 days; 1–365 days |
| `place_offer(amount, expires_at)` | anyone except the seller | Listing open and not ended; amount ≥ min offer; one live offer per bidder; USDC moves to the escrow vault |
| `withdraw_offer` | the bidder any time; anyone once refunds open | Refund + rent always go to the bidder |
| `accept_offer(expected_amount)` | seller only | Listing open; offer not expired; amount equals `expected_amount` (blocks a swapped-in lower offer); 3 % / 97 % paid from escrow; entitlement created |
| `cancel_listing` | seller | Open listings only; offers then refundable |
| `close_expired` | anyone, after `end_ts` | Records Expired |

**Fee:** `fee = floor(amount × 300 / 10 000)`, `seller = amount − fee`. The two always sum to the amount. For example, $14,000 → $420 fee and $13,580 to the quant.

**Account protection:**
- The fee recipient's token account must belong to `config.fee_recipient`, and the seller's to `listing.seller`.
- The vault must be the offer PDA's own USDC account, and the mint must match the configured mint.
- Every transfer happens inside one instruction, so payment is atomic.

**Limitations (unaudited):**
- Anyone can list any strategy id; there's no creator registry yet.
- Listings, offers and entitlements are never closed to reclaim rent, except offers when they are withdrawn or accepted.
- The admin is a single key, and the program is upgradeable by a single key.

## Tests

- `onchain/programs/stratx_auction/src/pricing.rs`: fee split, validation, expiry. Run with `cargo test`.
- `onchain/tests/stratx_auction.ts` (anchor-bankrun with an injected 6-decimal USDC mint):
  - escrow on offer
  - the seller picks a non-highest offer
  - exact 3 %/97 % balances, odd-amount rounding
  - only one acceptance
  - below-minimum, seller-bids, post-end and duplicate offers
  - expired and changed-amount acceptance
  - a failed accept leaves escrow and the listing untouched
  - redirected fee recipient, non-seller accept
  - withdraw rules, refund-by-anyone after close, cancel, expiry
- Frontend (`npm test`, runs here): pricing, codec/ABI (discriminators, byte layout, instruction account order), actions (re-read before send, refresh after confirm), view gates, transaction states.

**Results (2026-10-12, WSL Ubuntu):** `cargo test` 6/6 passed, and the bankrun suite 17/17 passed.

## Setup (Windows: use WSL2)

```bash
wsl --install -d Ubuntu
```

Run that in an administrator PowerShell, reboot, then inside Ubuntu:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
```
```bash
cd /mnt/c/Users/<you>/OneDrive/Desktop/stratx/onchain && npm install
```
```bash
cargo test -p stratx_auction --lib && anchor keys sync && anchor build && anchor test
```

## Deploy

```bash
solana config set --url devnet && solana airdrop 5
```
```bash
anchor deploy --provider.cluster devnet
```
```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/init-config.ts <FEE_RECIPIENT_WALLET>
```

Then add to `.env.local` in the repo root:

```
VITE_AUCTION_PROGRAM_ID=<program id from anchor deploy>
```

Optionally create a listing from the CLI:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/create-listing.ts basalt-basis-carry "Basalt Basis Carry" 15000 10000 120 90
```

Test USDC for investors: https://faucet.circle.com (choose Solana Devnet).
