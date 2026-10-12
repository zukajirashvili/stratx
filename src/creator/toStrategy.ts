import { analyzeNavCsv, type NavAnalysis } from '@/creator/analyze'
import type { CreatorStrategyRecord } from '@/creator/types'
import { classifyRisk } from '@/lib/metrics'
import { computeReputation } from '@/reputation/engine'
import type { ReputationInputs } from '@/reputation/types'
import type { Strategy, StrategyMetrics } from '@/types/strategy'

const DAY = 86_400_000

function quarterly(m: StrategyMetrics) {
  const s = m.series
  const out: number[] = []
  for (let end = s.length - 1; end - 91 >= 0; end -= 91) out.unshift(s[end].equity / s[end - 91].equity - 1)
  return out
}

/** Reputation inputs for a self-reported strategy. Unknown values stay null — never guessed. */
export function creatorReputationInputs(r: CreatorStrategyRecord, a: NavAnalysis, now: number): ReputationInputs {
  const m = a.metrics
  const first = a.points[0]?.date
  const last = a.points.at(-1)?.date
  const spanDays = first && last ? Math.round((Date.parse(last) - Date.parse(first)) / DAY) : null
  return {
    asOf: new Date(now).toISOString(),
    dataSource: 'self-reported',
    performance: {
      sharpe: m?.sharpe ?? null,
      // Excess vs cash at 0% (no benchmark declared).
      excessReturnPp: m ? m.cagr * 100 : null,
      benchmarkName: 'cash at 0% (no benchmark declared)',
      observations: a.points.length,
      periodReturns: m ? quarterly(m) : null,
      largestWinningTrade: null,
      totalPositiveTradeProfit: null,
      costCompleteness: r.costCompleteness,
    },
    risk: {
      maxDrawdownPct: m ? Math.abs(m.maxDrawdown) * 100 : null,
      annualizedVolatilityPct: m ? m.annualizedVolatility * 100 : null,
      largestTradeLossPct: null,
      maxConsecutiveLosses: null,
      grossExposureRatio: null,
      largestPositionSharePct: null,
    },
    capital: { claim: null },
    track: { historyDays: spanDays, observationsRecorded: a.points.length, observationsExpected: spanDays !== null ? spanDays + 1 : null },
    consistency: { monthlyReturns: m ? m.monthlyReturns.map((x) => x.value) : null },
    verification: {
      sourceAuthenticity: 'unauthenticated-file',
      integrityChecksPassed: a.passed,
      integrityChecksTotal: a.rows,
      independentVerification: 'format-checks',
      lastVerifiedAt: r.createdAt,
      evidenceSource: r.isExampleData ? 'Built-in example file (not real performance)' : 'NAV file uploaded by the creator (format-checked in the browser)',
    },
    trust: null,
  }
}

/** Turns a quant's record into a Strategy the whole app can display. Returns null when there's not enough data. */
export function creatorRecordToStrategy(r: CreatorStrategyRecord, now = Date.now()): Strategy | null {
  const a = analyzeNavCsv(r.navCsv)
  if (!a.metrics) return null
  const m = a.metrics
  const reputationInputs = creatorReputationInputs(r, a, now)
  return {
    id: r.id,
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    creator: { displayName: r.creatorName, wallet: r.ownerWallet ?? undefined, identityLinked: false, joinedAt: r.createdAt, strategiesPublished: 1 },
    style: r.style,
    assetCategories: r.assetCategories,
    primaryAssets: r.primaryAssets,
    riskLevel: classifyRisk(m),
    metrics: m,
    reputationInputs,
    reputation: computeReputation(reputationInputs),
    verification: {
      state: 'self-reported',
      method: 'NAV file uploaded by the creator; automated format checks only.',
      lastVerifiedAt: r.createdAt,
      lastUpdatedAt: r.createdAt,
      reportingCadence: 'daily',
      source: 'self-reported',
    },
    auction: null,
    disclosure: {
      disclosed: r.disclosed,
      withheld: ['Source code', 'Signal logic & parameters', 'Live positions', 'Order-level fills'],
    },
    evidence: [
      {
        kind: 'record',
        title: r.isExampleData ? 'Example NAV file' : 'Uploaded NAV file',
        detail: `${a.rows} rows, ${a.passed} passed format checks, ${a.points.length} used for analysis (${a.points[0].date} → ${a.points.at(-1)!.date}).`,
      },
      { kind: 'note', title: 'Self-reported', detail: 'Uploaded by the creator. Not reconciled against any exchange or on-chain record.' },
    ],
    limitations: [
      'Self-reported performance — not independently verified.',
      ...(r.isExampleData ? ['Created from the built-in example file, not real trading results.'] : []),
      'No trade-level data, so profit concentration, loss severity and leverage are unscored.',
    ],
    risks: [
      'Past performance, simulated or real, does not predict future results.',
      'Strategy access is a licence to signals or reports, not custody of funds. You can lose capital you deploy.',
    ],
    capacityUsd: r.capacityUsd ?? 0,
    tags: [],
    source: 'self-reported',
  }
}

/** Short, unique, ≤ 32-byte id for a new strategy. */
export function newStrategyId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
  return `q-${slug || 'strategy'}-${Math.random().toString(36).slice(2, 7)}`
}
