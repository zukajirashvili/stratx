import type {
  CostCompleteness,
  IndependentVerification,
  ReputationInputs,
  SourceAuthenticity,
} from '@/reputation/types'
import type { PerformancePoint, StrategyMetrics } from '@/types/strategy'

/**
 * DEMO reputation inputs.
 *
 * Performance-derived inputs (Sharpe, drawdown, volatility, monthly and
 * quarterly returns, history) are computed from each demo strategy's synthetic
 * NAV series, so they are internally consistent with the charts. Trade-level
 * statistics, exposure, verification metadata and capital claims are specified
 * explicitly below. Everything here is fabricated for demonstration.
 */

const DAY = 86_400_000

/** Demo stand-in for a cash benchmark (USDC lending yield). Not a live rate. */
export const DEMO_CASH_BENCHMARK_APY = 0.05

interface DemoClaimSpec {
  description: string
  depositSol: number
  commitmentDays: number
  /** How long ago the commitment started. */
  startedDaysAgo: number
  /** Predefined test: peak-to-trough drawdown inside the commitment window must stay at or below this. */
  maxDrawdownLimitPct: number
}

export interface DemoReputationSpec {
  benchmark: 'sol' | 'cash'
  /** Days with no recorded observation (reporting gaps). */
  missingDays?: number
  /** Reporting cadence; weekly reporters have fewer expected observations. */
  cadence?: 'daily' | 'weekly'
  trades: { largestWinSharePct: number; largestLossPct: number; maxLosingStreak: number }
  exposure: { gross: number; largestPositionSharePct: number }
  costCompleteness: CostCompleteness
  verification: {
    source: SourceAuthenticity
    /** null = integrity checks not yet run. */
    integrity: { passed: number; total: number } | null
    independent: IndependentVerification
    verifiedDaysAgo: number
    evidenceSource: string
  }
  claim: DemoClaimSpec | null
}

function quarterlyReturns(series: PerformancePoint[]) {
  const out: number[] = []
  for (let end = series.length - 1; end - 91 >= 0; end -= 91) {
    out.unshift(series[end].equity / series[end - 91].equity - 1)
  }
  return out
}

function annualised(start: number, end: number, days: number) {
  return (end / start) ** (365 / Math.max(days, 1)) - 1
}

/** Deterministic demo evaluation of a drawdown-limit claim against the strategy's own series. */
export function evaluateDemoClaim(claim: DemoClaimSpec, series: PerformancePoint[], asOf: number) {
  if (claim.startedDaysAgo < claim.commitmentDays) {
    return {
      status: 'pending' as const,
      detail: `Commitment window ends in ${claim.commitmentDays - claim.startedDaysAgo} days (demo).`,
    }
  }
  const startIdx = Math.max(0, series.length - 1 - claim.startedDaysAgo)
  const window = series.slice(startIdx, Math.min(series.length, startIdx + claim.commitmentDays + 1))
  let peak = -Infinity
  let worst = 0
  for (const p of window) {
    peak = Math.max(peak, p.equity)
    worst = Math.min(worst, p.equity / peak - 1)
  }
  const ddPct = Math.abs(worst) * 100
  const passed = ddPct <= claim.maxDrawdownLimitPct
  return {
    status: passed ? ('passed' as const) : ('failed' as const),
    detail: `Demo test over ${window.length - 1} days ending ${new Date(asOf - (claim.startedDaysAgo - claim.commitmentDays) * DAY).toISOString().slice(0, 10)}: max drawdown ${ddPct.toFixed(1)}% vs limit ${claim.maxDrawdownLimitPct}% → ${passed ? 'passed' : 'failed'}.`,
  }
}

export function buildReputationInputs(spec: DemoReputationSpec, metrics: StrategyMetrics, now: number): ReputationInputs {
  const s = metrics.series
  const days = metrics.trackRecordDays
  const cadenceDays = spec.cadence === 'weekly' ? 7 : 1
  const expected = Math.floor(days / cadenceDays)
  const recorded = expected - Math.floor((spec.missingDays ?? 0) / cadenceDays)

  const benchCagr =
    spec.benchmark === 'sol' ? annualised(s[0].benchmark, s[s.length - 1].benchmark, days) : DEMO_CASH_BENCHMARK_APY
  const excessPp = (metrics.cagr - benchCagr) * 100

  return {
    asOf: new Date(now).toISOString(),
    dataSource: 'demo',
    performance: {
      sharpe: metrics.sharpe,
      excessReturnPp: excessPp,
      benchmarkName: spec.benchmark === 'sol' ? 'SOL buy-and-hold (demo series)' : `cash at ${DEMO_CASH_BENCHMARK_APY * 100}% APY (demo)`,
      observations: recorded,
      periodReturns: quarterlyReturns(s),
      largestWinningTrade: spec.trades.largestWinSharePct,
      totalPositiveTradeProfit: 100,
      costCompleteness: spec.costCompleteness,
    },
    risk: {
      maxDrawdownPct: Math.abs(metrics.maxDrawdown) * 100,
      annualizedVolatilityPct: metrics.annualizedVolatility * 100,
      largestTradeLossPct: spec.trades.largestLossPct,
      maxConsecutiveLosses: spec.trades.maxLosingStreak,
      grossExposureRatio: spec.exposure.gross,
      largestPositionSharePct: spec.exposure.largestPositionSharePct,
    },
    capital: {
      claim: spec.claim
        ? {
            description: spec.claim.description,
            depositAmount: spec.claim.depositSol,
            denomination: 'SOL',
            commitmentDays: spec.claim.commitmentDays,
            outcome: {
              ...evaluateDemoClaim(spec.claim, s, now),
              source: 'demo-deterministic',
              evaluatedAt: new Date(now).toISOString(),
            },
          }
        : null,
    },
    track: { historyDays: days, observationsRecorded: recorded, observationsExpected: expected },
    consistency: { monthlyReturns: metrics.monthlyReturns.map((m) => m.value) },
    verification: {
      sourceAuthenticity: spec.verification.source,
      integrityChecksPassed: spec.verification.integrity?.passed ?? null,
      integrityChecksTotal: spec.verification.integrity?.total ?? null,
      independentVerification: spec.verification.independent,
      lastVerifiedAt: new Date(now - spec.verification.verifiedDaysAgo * DAY).toISOString(),
      evidenceSource: spec.verification.evidenceSource,
    },
    // No eligible participant feedback or dispute data exists in the MVP.
    trust: null,
  }
}

/** Per-strategy demo specs, keyed by strategy id. */
export const DEMO_REPUTATION_SPECS: Record<string, DemoReputationSpec> = {
  'meridian-sol-perp-trend': {
    benchmark: 'sol',
    missingDays: 6,
    trades: { largestWinSharePct: 8, largestLossPct: 1.8, maxLosingStreak: 6 },
    exposure: { gross: 1.8, largestPositionSharePct: 100 },
    costCompleteness: 'major-included',
    verification: { source: 'authenticated-source', integrity: { passed: 962, total: 980 }, independent: 'checked-against-source', verifiedDaysAgo: 2, evidenceSource: 'Drift SOL-PERP fills read from on-chain accounts (demo)' },
    claim: { description: 'Max drawdown stays at or below 25% for 180 days', depositSol: 15, commitmentDays: 180, startedDaysAgo: 200, maxDrawdownLimitPct: 25 },
  },
  'basalt-basis-carry': {
    benchmark: 'cash',
    trades: { largestWinSharePct: 4, largestLossPct: 0.4, maxLosingStreak: 3 },
    exposure: { gross: 2, largestPositionSharePct: 40 },
    costCompleteness: 'fully-documented',
    verification: { source: 'independently-checked', integrity: { passed: 1150, total: 1150 }, independent: 'independently-reviewed', verifiedDaysAgo: 1, evidenceSource: 'Spot and perp legs reconciled by the StratX indexer and an independent reviewer (demo)' },
    claim: { description: 'Max drawdown stays at or below 5% for 365 days', depositSol: 60, commitmentDays: 365, startedDaysAgo: 400, maxDrawdownLimitPct: 5 },
  },
  'halcyon-delta-neutral-lp': {
    benchmark: 'cash',
    missingDays: 14,
    trades: { largestWinSharePct: 6, largestLossPct: 0.8, maxLosingStreak: 4 },
    exposure: { gross: 2.5, largestPositionSharePct: 50 },
    costCompleteness: 'major-included',
    verification: { source: 'authenticated-source', integrity: { passed: 700, total: 720 }, independent: 'checked-against-source', verifiedDaysAgo: 3, evidenceSource: 'Orca LP and hedge accounts (demo)' },
    claim: { description: 'Max drawdown stays at or below 8% for 90 days', depositSol: 30, commitmentDays: 90, startedDaysAgo: 120, maxDrawdownLimitPct: 8 },
  },
  'kestrel-mean-reversion': {
    benchmark: 'sol',
    missingDays: 30,
    trades: { largestWinSharePct: 12, largestLossPct: 1.5, maxLosingStreak: 7 },
    exposure: { gross: 1.5, largestPositionSharePct: 45 },
    costCompleteness: 'important-gaps',
    verification: { source: 'authenticated-source', integrity: { passed: 600, total: 640 }, independent: 'checked-against-source', verifiedDaysAgo: 12, evidenceSource: 'Read-only exchange API reconciliation (demo)' },
    claim: { description: 'Max drawdown stays at or below 12% for 90 days', depositSol: 15, commitmentDays: 90, startedDaysAgo: 20, maxDrawdownLimitPct: 12 },
  },
  'jitoflow-market-making': {
    benchmark: 'cash',
    trades: { largestWinSharePct: 3, largestLossPct: 0.5, maxLosingStreak: 2 },
    exposure: { gross: 1, largestPositionSharePct: 20 },
    costCompleteness: 'fully-documented',
    verification: { source: 'independently-checked', integrity: { passed: 410, total: 410 }, independent: 'independently-reviewed', verifiedDaysAgo: 1, evidenceSource: 'Phoenix/OpenBook fills read on-chain and independently reviewed (demo)' },
    claim: { description: 'Max drawdown stays at or below 10% for 180 days', depositSol: 40, commitmentDays: 180, startedDaysAgo: 190, maxDrawdownLimitPct: 10 },
  },
  'northwind-cross-asset-momentum': {
    benchmark: 'sol',
    cadence: 'weekly',
    missingDays: 70,
    trades: { largestWinSharePct: 18, largestLossPct: 6, maxLosingStreak: 9 },
    exposure: { gross: 1, largestPositionSharePct: 30 },
    costCompleteness: 'major-missing',
    verification: { source: 'unauthenticated-file', integrity: { passed: 150, total: 177 }, independent: 'format-checks', verifiedDaysAgo: 75, evidenceSource: 'Creator-uploaded CSV of weekly NAV (demo)' },
    claim: { description: 'Max drawdown stays at or below 15% for 90 days', depositSol: 20, commitmentDays: 90, startedDaysAgo: 300, maxDrawdownLimitPct: 15 },
  },
  'pulse-memecoin-momentum': {
    benchmark: 'sol',
    trades: { largestWinSharePct: 55, largestLossPct: 12, maxLosingStreak: 11 },
    exposure: { gross: 3, largestPositionSharePct: 60 },
    costCompleteness: 'none',
    verification: { source: 'manual-entry', integrity: { passed: 120, total: 210 }, independent: 'none', verifiedDaysAgo: 30, evidenceSource: 'Manually entered wallet P&L figures (demo)' },
    claim: null,
  },
  'atlas-stat-arb-pairs': {
    benchmark: 'cash',
    missingDays: 10,
    trades: { largestWinSharePct: 5, largestLossPct: 0.7, maxLosingStreak: 5 },
    exposure: { gross: 3, largestPositionSharePct: 25 },
    costCompleteness: 'major-included',
    verification: { source: 'authenticated-source', integrity: { passed: 850, total: 860 }, independent: 'independently-reviewed', verifiedDaysAgo: 4, evidenceSource: 'Read-only exchange API reconciliation, independently reviewed (demo)' },
    claim: { description: 'Max drawdown stays at or below 10% for 365 days', depositSol: 50, commitmentDays: 365, startedDaysAgo: 420, maxDrawdownLimitPct: 10 },
  },
  'corsair-funding-harvester': {
    benchmark: 'cash',
    trades: { largestWinSharePct: 7, largestLossPct: 0.5, maxLosingStreak: 3 },
    exposure: { gross: 2, largestPositionSharePct: 50 },
    costCompleteness: 'major-included',
    // Reconciliation has not run yet — integrity is missing, so the engine returns UNRATED.
    verification: { source: 'authenticated-source', integrity: null, independent: 'format-checks', verifiedDaysAgo: 1, evidenceSource: 'Wallet linked; first reconciliation in progress (demo)' },
    claim: { description: 'Max drawdown stays at or below 5% for 90 days', depositSol: 10, commitmentDays: 90, startedDaysAgo: 45, maxDrawdownLimitPct: 5 },
  },
  'ember-trend-majors': {
    benchmark: 'sol',
    missingDays: 8,
    trades: { largestWinSharePct: 15, largestLossPct: 2.5, maxLosingStreak: 8 },
    exposure: { gross: 2, largestPositionSharePct: 55 },
    costCompleteness: 'major-included',
    verification: { source: 'authenticated-source', integrity: { passed: 525, total: 540 }, independent: 'checked-against-source', verifiedDaysAgo: 11, evidenceSource: 'Read-only exchange API reconciliation (demo)' },
    claim: null,
  },
}
