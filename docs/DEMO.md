# StratX — Demo Guide

**Status:** everything except on-chain auctions works today. Auctions need the program deployed first (see [AUCTION.md](AUCTION.md)). Google/Apple/email sign-in needs `VITE_PRIVY_APP_ID`. Steps marked 🔗 need the deployment.

## Run

```bash
npm install
```
```bash
npm run dev
```

Open http://localhost:5173.

## Script

1. **Sign in (onboarding):** Google, Apple or email (Privy creates a Solana wallet automatically), or connect Phantom, Solflare, Backpack, MetaMask or Ledger. You can also choose "Continue without signing in".
2. **Explore:** search in plain English. Try "Find Gold-tier or higher strategies with active Dutch auctions". The chips show how the search was read, and every card says why it matched.
3. **Strategy page** (`basalt-basis-carry`):
   - the tier badge and the "In plain words" summary
   - Performance and Reputation tabs (click a factor to see its thresholds)
   - the **Details** tab, which lists every field
4. **Create a strategy:** Create strategy → name → upload a NAV CSV (or "Use example data") → see the analysis → Create. A pop-up asks "Start an auction now?". The example data scores Silver (≈57), capped because it's self-reported.
5. 🔗 **Auction:** as the quant, start an auction at an asking price of $15,000 with a $10,000 minimum.
   - Investor A (another wallet with Devnet USDC) offers $12,000; 15 minutes later investor B offers $14,000.
   - The quant clicks **Accept** on $14,000. The quant receives $13,580 and StratX $420.
   - Investor A clicks **Withdraw** to get the $12,000 back.
6. 🔗 **Verify on Solana Explorer:**
   - the accept transaction contains the USDC transfers (3 % and 97 %)
   - the listing shows Sold
   - the Entitlement account exists

## Backup plan

- **Devnet or RPC is down, or the program isn't deployed:** demo steps 1–4, plus the **demo auctions** (Auctions page). They simulate the same offer flow, and are clearly labelled.
- **Social sign-in isn't configured:** use a wallet, or continue without signing in.
- **Evidence:** `npm test` (212 frontend tests). On a machine with the toolchain, also `cd onchain && anchor test`.
