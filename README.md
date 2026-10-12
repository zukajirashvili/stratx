# StratX

A Solana-native platform for discovering, evaluating, and acquiring access to quantitative trading strategies. Hackathon MVP.

> **Strategies, performance records, reputation inputs, creators and the multi-seat "demo auctions" are fabricated demo data.** Real value transfer happens only through the StratX Dutch auction **program on Solana Devnet** (test funds, no monetary value). See [docs/AUCTION.md](docs/AUCTION.md) for its deployment status.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run lint       # oxlint
npm test           # Vitest — reputation, search, auction client, pricing, tx states
npm run preview    # serve the production build
```

Copy `.env.example` to `.env.local` to set the cluster, RPC endpoint or auction program id.

On-chain program (needs Rust + Solana CLI + Anchor; on Windows use WSL2):

```bash
cd onchain && npm install && cargo test -p stratx_auction --lib && anchor build && anchor test
```

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn-style components on Radix · Lucide · Recharts · `@solana/web3.js` + `@solana/wallet-adapter` · Anchor 0.31 (program).

## Features

- **Offer auctions on Devnet (USDC):**
  - the quant sets an asking price; investors make escrowed offers; the quant accepts the one they like
  - atomic 3 % protocol fee / 97 % quant payout, refunds for every other offer, on-chain entitlement record
  - details: [docs/AUCTION.md](docs/AUCTION.md)
- **Sign in:** Google, Apple, email (Privy, set `VITE_PRIVY_APP_ID`) or Phantom, Solflare, Backpack, MetaMask, Ledger.
- **Create a strategy:** upload daily NAV → automatic analysis and reputation tier → optional "Start an auction" pop-up.
- **Natural-language search:** a deterministic interpreter (`src/search/`) turns queries into explicit filters, warnings and ranking. Each result shows why it matched, and requests for metrics the data model doesn't have are reported as unavailable.
- **Reputation engine:** seven factors and six tiers, in `src/reputation/`. See [docs/REPUTATION.md](docs/REPUTATION.md).
- **Wallet tools:**
  - connect/disconnect, address and Devnet balance
  - airdrop and faucet links
  - network check via genesis hash
  - transaction states: pending, confirmed, rejected, failed

## Structure

```
onchain/            Anchor workspace — programs/stratx_auction (Rust), tests (bankrun), scripts (init/create)
src/
  solana/           Program client (codec, PDAs, ix builders), pricing mirror, tx submission, network checks, actions
  search/           Natural-language query interpretation
  reputation/       Reputation engine (pure TS)
  data/demo/        DEMO DATA ONLY — deterministic synthetic strategies
  services/         StrategyRepository interface + demo implementation
  lib/              Metrics, demo-auction curve, filtering & sorting
  providers/        Solana connection/wallet, on-chain index, preferences
  components/       ui/, strategy/, reputation/, onchain/, charts/, layout/
  pages/            explore/, strategy/, onboarding/, creator/
docs/               AUCTION.md (setup, deploy, judge flow), REPUTATION.md
```

## Useful URLs

- `/onboarding`: first-run flow; revisit it to edit preferences.
- `/explore?q=Find Gold-tier or higher strategies with active Dutch auctions`: search state lives in the URL.
- `/explore?simulate=error`: shows the error state.
- `/strategy/<id>?tab=auction`: on-chain auctions for a strategy, and its demo auction preview.
- `/creator`: create and manage on-chain auctions.
