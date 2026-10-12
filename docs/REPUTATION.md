# StratX Reputation Engine

Code: `src/reputation/` — `types.ts` (inputs/outputs), `config.ts` (every weight, threshold, gate and policy constant), `engine.ts` (pure, deterministic scoring), `display.ts` (UI helpers), `engine.test.ts` (unit tests). Demo inputs: `src/data/demo/reputationInputs.ts`.

```
S = 0.25P + 0.20R + 0.15C + 0.15T + 0.10K + 0.10V + 0.05U
```

## Boundary convention

Numeric tables are evaluated in order: a value lands in the first band where `value < upTo` (exclusive bands, e.g. "below 0.5") or `value <= upTo` (inclusive bands, e.g. "above 2–5%"). The last band is always `Infinity`. Values outside a table's domain (negative drawdown, >100 %, non-integer losing streak, NaN, ±Infinity) are **invalid**, never clamped. `null`/`undefined` are **unavailable**. Neither is ever scored as 100.

## Missing data

| Situation | Result |
|---|---|
| Essential input missing/invalid (P1, P2, R1, R2, T1, T2, V1, V2, V3, V4) | **UNRATED** — no score, no tier |
| Non-essential input missing/invalid | Counts as **0**, warning, rating is **provisional** |
| Participant Trust (U) has no eligible data | U = 0, its 5 % is **not** redistributed, max attainable 95, rating **provisional** |
| No capital claim | C = 0 (a real zero, not missing) |
| Claim pending | C excluded (0), rating provisional |
| Claim failed | C = 0 regardless of deposit or duration |
| Claim outcome from a client flag (or a demo outcome on on-chain data) | Not authoritative → C excluded |

Weights are never renormalised.

## Integrity guards

- Profit concentration: ÷0 when there are no positive trade profits → unavailable; largest win > total → invalid.
- Observation coverage > 101 % → invalid (possible duplicated records).
- Integrity checks: total = 0 → unavailable; passed outside 0…total → invalid.
- Verification date in the future or unparseable → invalid.
- K2 (coefficient of variation) is unavailable when the mean monthly return is < 0.1 % or fewer than 3 months exist.
- P3·G and K3 read the **same** trade record so they cannot disagree. P3·F uses quarters and K1 uses months, to avoid scoring the identical statistic twice.

## Tiers

A tier needs its score range **and** its eligibility gates. Ranges are `[min, next min)`: Bronze 40–<55, Silver 55–<65, Gold 65–<75, Platinum 75–<85, Diamond 85–<93, Obsidian 93+. If the score's tier fails a gate, lower tiers are checked against their own gates. If none pass, the strategy is shown as "Not tiered". Scores under 40 are shown as "Below Bronze". The tier is decided on the displayed score, rounded to one decimal.

## Provisional policy decisions (prototype — revise before production)

1. **Provisional ratings without Participant Trust.** `POLICY.allowProvisionalWithoutTrust = true`. Setting it to `false` makes every strategy without trust data UNRATED.
2. **The essential-input list** (above) is a prototype choice.
3. **Non-essential gaps count as 0** rather than blocking the rating.
4. **Tier gates beyond score and history** (coverage, integrity, freshness, source, independent verification, max drawdown, claim, trust) are a prototype policy. Values are in `TIER_GATES`. Notable effects:
   - A failed claim caps a strategy at Bronze.
   - Diamond and Obsidian need a passed claim.
   - Obsidian needs Participant Trust, so it is unreachable in the MVP.
5. **P3·O sufficiency** uses 365 daily observations as "required". **T2** measures coverage of expected observations at the reporting cadence.
6. **SOL → USD for C1** uses a fixed demo rate of $150. Production needs an oracle or USD-denominated vaults.
7. **Benchmarks:**
   - Directional strategies are compared against SOL buy-and-hold (demo series).
   - Market-neutral strategies are compared against a 5 % cash/USDC rate (demo).
8. **Demo claim outcomes** are computed deterministically from each demo series (a drawdown limit over the commitment window). In production, only the vault program's result is authoritative, and the program must enforce forfeiture.
