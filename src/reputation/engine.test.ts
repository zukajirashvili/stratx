import { describe, expect, it } from 'vitest'
import { POLICY, TABLES } from '@/reputation/config'
import {
  coefficientOfVariation,
  computeReputation,
  profitConcentration,
  scoreBand,
  scoreBandTier,
} from '@/reputation/engine'
import type { FactorKey, ReputationInputs, ReputationResult } from '@/reputation/types'

const AS_OF = '2026-10-11T12:00:00.000Z'
const DAY = 86_400_000
const daysAgo = (d: number) => new Date(Date.parse(AS_OF) - d * DAY).toISOString()

/** Inputs that score 100 on every factor. Tests mutate copies of this. */
function perfect(): ReputationInputs {
  return {
    asOf: AS_OF,
    dataSource: 'onchain',
    performance: {
      sharpe: 2.5,
      excessReturnPp: 10,
      benchmarkName: 'SOL',
      observations: 400,
      periodReturns: [0.02, 0.03, 0.01, 0.02, 0.025, 0.015, 0.02, 0.03],
      largestWinningTrade: 5,
      totalPositiveTradeProfit: 100,
      costCompleteness: 'fully-documented',
    },
    risk: {
      maxDrawdownPct: 1.5,
      annualizedVolatilityPct: 4,
      largestTradeLossPct: 0.3,
      maxConsecutiveLosses: 2,
      grossExposureRatio: 1,
      largestPositionSharePct: 10,
    },
    capital: {
      claim: {
        description: 'Max drawdown stays under 5% for 365 days',
        depositAmount: 5000,
        denomination: 'USD',
        commitmentDays: 365,
        outcome: { status: 'passed', source: 'vault-program', detail: 'Vault test passed' },
      },
    },
    track: { historyDays: 1200, observationsRecorded: 1200, observationsExpected: 1200 },
    consistency: { monthlyReturns: [0.01, 0.012, 0.011, 0.013, 0.01, 0.012, 0.011, 0.012, 0.013, 0.01, 0.011, 0.012] },
    verification: {
      sourceAuthenticity: 'independently-checked',
      integrityChecksPassed: 100,
      integrityChecksTotal: 100,
      independentVerification: 'documented-independent',
      lastVerifiedAt: daysAgo(1),
      evidenceSource: 'Test fixture',
    },
    trust: { averageRating: 5, eligibleRatings: 20, integrityPct: 100, disputesResolvedWithinTargetPct: 100 },
  }
}

const factorOf = (r: ReputationResult, k: FactorKey) => r.factors.find((f) => f.key === k)!
const hasWarning = (r: ReputationResult, code: string) => r.warnings.some((w) => w.code === code)

/* ------------------------------------------------------------------ bands */

describe('threshold boundaries', () => {
  const cases: [keyof typeof TABLES, number, number][] = [
    // P1 Sharpe: "below 0" / "0 to below 0.5" …
    ['P1_sharpe', -0.0001, 10],
    ['P1_sharpe', 0, 30],
    ['P1_sharpe', 0.4999, 30],
    ['P1_sharpe', 0.5, 50],
    ['P1_sharpe', 1.5, 85],
    ['P1_sharpe', 1.9999, 85],
    ['P1_sharpe', 2, 100],
    // P2 excess return (pp)
    ['P2_excessReturn', -10.0001, 0],
    ['P2_excessReturn', -10, 20],
    ['P2_excessReturn', -5, 40],
    ['P2_excessReturn', 0, 60],
    ['P2_excessReturn', 3, 80],
    ['P2_excessReturn', 7, 100],
    // P3 observation sufficiency (%)
    ['P3_observationSufficiency', 24.99, 0],
    ['P3_observationSufficiency', 25, 25],
    ['P3_observationSufficiency', 99.99, 75],
    ['P3_observationSufficiency', 100, 100],
    // Profit concentration: "10% or less" / "above 10–20%" …
    ['profitConcentration', 10, 100],
    ['profitConcentration', 10.0001, 80],
    ['profitConcentration', 75, 20],
    ['profitConcentration', 75.0001, 0],
    // R1 max drawdown
    ['R1_maxDrawdown', 0, 100],
    ['R1_maxDrawdown', 2, 100],
    ['R1_maxDrawdown', 2.0001, 85],
    ['R1_maxDrawdown', 20, 50],
    ['R1_maxDrawdown', 30, 25],
    ['R1_maxDrawdown', 30.0001, 0],
    // R2 volatility
    ['R2_volatility', 5, 100],
    ['R2_volatility', 5.0001, 85],
    ['R2_volatility', 50, 25],
    ['R2_volatility', 50.0001, 0],
    // R3 largest trade loss / streak
    ['R3_largestLoss', 0.5, 100],
    ['R3_largestLoss', 0.5001, 85],
    ['R3_largestLoss', 8, 25],
    ['R3_largestLoss', 8.0001, 0],
    ['R3_losingStreak', 2, 100],
    ['R3_losingStreak', 3, 80],
    ['R3_losingStreak', 4, 80],
    ['R3_losingStreak', 6, 60],
    ['R3_losingStreak', 9, 30],
    ['R3_losingStreak', 10, 0],
    // R4 exposure / position share
    ['R4_grossExposure', 1, 100],
    ['R4_grossExposure', 1.0001, 85],
    ['R4_grossExposure', 10, 15],
    ['R4_grossExposure', 10.0001, 0],
    ['R4_positionShare', 75, 25],
    ['R4_positionShare', 75.0001, 0],
    // C1 deposit (USD) / C2 duration
    ['C1_depositUsd', 99.99, 10],
    ['C1_depositUsd', 100, 25],
    ['C1_depositUsd', 4999.99, 80],
    ['C1_depositUsd', 5000, 100],
    ['C2_commitmentDays', 6, 10],
    ['C2_commitmentDays', 7, 30],
    ['C2_commitmentDays', 29, 30],
    ['C2_commitmentDays', 30, 50],
    ['C2_commitmentDays', 364, 85],
    ['C2_commitmentDays', 365, 100],
    // T1 history / T2 coverage
    ['T1_history', 29, 10],
    ['T1_history', 30, 30],
    ['T1_history', 729, 85],
    ['T1_history', 730, 100],
    ['T2_coverage', 39.99, 0],
    ['T2_coverage', 40, 25],
    ['T2_coverage', 89.99, 75],
    ['T2_coverage', 90, 100],
    // K1 / K2
    ['K1_profitablePeriods', 19.99, 0],
    ['K1_profitablePeriods', 20, 25],
    ['K1_profitablePeriods', 74.99, 80],
    ['K1_profitablePeriods', 75, 100],
    ['K2_coefficientOfVariation', 0.5, 100],
    ['K2_coefficientOfVariation', 0.5001, 80],
    ['K2_coefficientOfVariation', 3, 20],
    ['K2_coefficientOfVariation', 3.0001, 0],
    // V2 integrity / V4 freshness
    ['V2_integrity', 49.99, 0],
    ['V2_integrity', 50, 25],
    ['V2_integrity', 94.99, 75],
    ['V2_integrity', 95, 100],
    ['V4_evidenceAgeDays', 7, 100],
    ['V4_evidenceAgeDays', 7.0001, 80],
    ['V4_evidenceAgeDays', 90, 30],
    ['V4_evidenceAgeDays', 90.0001, 0],
    // U3 disputes
    ['U3_disputes', 79.99, 75],
    ['U3_disputes', 80, 100],
  ]
  it.each(cases)('%s(%d) = %d', (table, value, expected) => {
    const r = scoreBand(TABLES[table], value)
    expect(r.status).toBe('available')
    expect(r.score).toBe(expected)
  })

  it('treats null/undefined as unavailable — never 100', () => {
    expect(scoreBand(TABLES.R1_maxDrawdown, null)).toMatchObject({ status: 'unavailable', score: null })
    expect(scoreBand(TABLES.R1_maxDrawdown, undefined)).toMatchObject({ status: 'unavailable', score: null })
  })

  it('treats NaN, Infinity, out-of-domain and non-integers as invalid', () => {
    expect(scoreBand(TABLES.P1_sharpe, NaN).status).toBe('invalid')
    expect(scoreBand(TABLES.P1_sharpe, Infinity).status).toBe('invalid')
    expect(scoreBand(TABLES.R1_maxDrawdown, -1).status).toBe('invalid')
    expect(scoreBand(TABLES.R1_maxDrawdown, 101).status).toBe('invalid')
    expect(scoreBand(TABLES.R3_losingStreak, 2.5).status).toBe('invalid')
  })
})

describe('derived inputs', () => {
  it('profit concentration guards division by zero and inconsistent records', () => {
    expect(profitConcentration(5, 0).status).toBe('unavailable')
    expect(profitConcentration(120, 100).status).toBe('invalid')
    expect(profitConcentration(-1, 100).status).toBe('invalid')
    expect(profitConcentration(25, 100)).toEqual({ status: 'available', value: 25 })
  })

  it('coefficient of variation is unavailable for non-positive mean, short or empty histories', () => {
    expect(coefficientOfVariation([]).status).toBe('unavailable')
    expect(coefficientOfVariation([0.01, 0.02]).status).toBe('unavailable')
    expect(coefficientOfVariation([-0.01, 0.005, -0.002]).status).toBe('unavailable')
    expect(coefficientOfVariation([0.01, NaN, 0.02]).status).toBe('invalid')
    const cv = coefficientOfVariation([0.01, 0.02, 0.03])
    expect(cv.status).toBe('available')
    if (cv.status === 'available') expect(cv.value).toBeCloseTo(0.5, 6)
  })
})

/* ------------------------------------------------------------------ weights */

describe('weighted calculation', () => {
  it('scores 100 and Obsidian when every input is perfect and verified', () => {
    const r = computeReputation(perfect())
    expect(r.status).toBe('rated')
    expect(r.score).toBe(100)
    expect(r.tier).toBe('obsidian')
    for (const f of r.factors) expect(f.score).toBe(100)
  })

  it('applies S = 0.25P + 0.20R + 0.15C + 0.15T + 0.10K + 0.10V + 0.05U exactly', () => {
    const i = perfect()
    i.performance.sharpe = 1.7 // P1 85
    i.performance.excessReturnPp = -6 // P2 20
    i.risk.maxDrawdownPct = 12 // R1 50
    i.trust = null // U unavailable → contributes 0
    const r = computeReputation(i)
    expect(factorOf(r, 'P').score).toBeCloseTo(0.5 * 85 + 0.3 * 20 + 0.2 * 100, 9) // 68.5
    expect(factorOf(r, 'R').score).toBeCloseTo(0.4 * 50 + 0.2 * 100 + 0.2 * 100 + 0.2 * 100, 9) // 80
    // 0.25·68.5 + 0.20·80 + 0.15·100 + 0.15·100 + 0.10·100 + 0.10·100 + 0.05·0 = 83.125
    expect(r.score).toBe(83.1)
    expect(r.status).toBe('provisional')
    expect(r.tier).toBe('platinum')
  })

  it('computes P3 as the mean of O, F, G, Kc', () => {
    const i = perfect()
    i.performance.observations = 200 // 54.8% → 50
    i.performance.costCompleteness = 'important-gaps' // 50
    const p3 = factorOf(computeReputation(i), 'P').subfactors.find((s) => s.key === 'P3')!
    expect(p3.score).toBeCloseTo((50 + 100 + 100 + 50) / 4, 9)
  })

  it('computes R3 and R4 as 50/50 composites', () => {
    const i = perfect()
    i.risk.largestTradeLossPct = 3 // 50
    i.risk.maxConsecutiveLosses = 8 // 30
    i.risk.grossExposureRatio = 4 // 40
    i.risk.largestPositionSharePct = 60 // 25
    const R = factorOf(computeReputation(i), 'R')
    expect(R.subfactors.find((s) => s.key === 'R3')!.score).toBe(40)
    expect(R.subfactors.find((s) => s.key === 'R4')!.score).toBe(32.5)
  })

  it('normalises U1 from a 1–5 rating', () => {
    const i = perfect()
    i.trust = { averageRating: 4, eligibleRatings: 10, integrityPct: 100, disputesResolvedWithinTargetPct: 100 }
    const u1 = factorOf(computeReputation(i), 'U').subfactors.find((s) => s.key === 'U1')!
    expect(u1.score).toBe(75)
  })

  it('is deterministic', () => {
    expect(computeReputation(perfect())).toEqual(computeReputation(perfect()))
  })
})

/* ------------------------------------------------------------------ capital */

describe('capital commitment', () => {
  it('forces C = 0 when the claim fails, regardless of deposit and duration', () => {
    const i = perfect()
    i.capital.claim!.depositAmount = 1_000_000
    i.capital.claim!.outcome = { status: 'failed', source: 'vault-program', detail: 'Drawdown breached' }
    const r = computeReputation(i)
    const C = factorOf(r, 'C')
    expect(C.score).toBe(0)
    expect(C.contribution).toBe(0)
    expect(hasWarning(r, 'capital.failed')).toBe(true)
    expect(r.score).toBe(85) // 100 − 15
    // Silver and above require "no failed claim"; only Bronze has no claim gate.
    expect(r.scoreBandTier).toBe('diamond')
    expect(r.tier).toBe('bronze')
    expect(hasWarning(r, 'tier.downgraded')).toBe(true)
  })

  it('excludes C (provisional) while the claim test is pending', () => {
    const i = perfect()
    i.capital.claim!.outcome = { status: 'pending', source: 'vault-program', detail: '' }
    const r = computeReputation(i)
    expect(factorOf(r, 'C').status).toBe('unavailable')
    expect(r.status).toBe('provisional')
    expect(r.score).toBe(85)
    expect(r.maxAttainable).toBe(85)
  })

  it('does not trust a client-side outcome flag', () => {
    const i = perfect()
    i.capital.claim!.outcome = { status: 'passed', source: 'client-flag', detail: '' }
    const r = computeReputation(i)
    expect(factorOf(r, 'C').status).toBe('unavailable')
    expect(hasWarning(r, 'capital.untrustedOutcome')).toBe(true)
  })

  it('does not accept a demo outcome for on-chain data', () => {
    const i = perfect()
    i.capital.claim!.outcome = { status: 'passed', source: 'demo-deterministic', detail: '' }
    expect(factorOf(computeReputation(i), 'C').status).toBe('unavailable')
    i.dataSource = 'demo'
    expect(factorOf(computeReputation(i), 'C').score).toBe(100)
  })

  it('converts SOL with the configured demo rate, never 1:1 as dollars', () => {
    const i = perfect()
    i.capital.claim!.denomination = 'SOL'
    i.capital.claim!.depositAmount = 10 // × $150 demo = $1,500 → 60
    const c1 = factorOf(computeReputation(i), 'C').subfactors.find((s) => s.key === 'C1')!
    expect(c1.input).toBe(1500)
    expect(c1.score).toBe(60)
  })

  it('scores C = 0 without making the rating provisional when no claim exists', () => {
    const i = perfect()
    i.capital.claim = null
    const r = computeReputation(i)
    expect(factorOf(r, 'C').score).toBe(0)
    expect(r.status).toBe('rated')
    expect(r.score).toBe(85)
  })
})

/* ------------------------------------------------------------------ missing data */

describe('missing and invalid inputs', () => {
  it('is UNRATED when an essential input is missing', () => {
    const i = perfect()
    i.performance.sharpe = null
    const r = computeReputation(i)
    expect(r.status).toBe('unrated')
    expect(r.score).toBeNull()
    expect(r.tier).toBeNull()
    expect(r.missingEssential.some((m) => m.includes('P1'))).toBe(true)
  })

  it('is UNRATED when an essential input is NaN', () => {
    const i = perfect()
    i.risk.maxDrawdownPct = NaN
    expect(computeReputation(i).status).toBe('unrated')
  })

  it('is UNRATED when integrity checks have not run (division by zero)', () => {
    const i = perfect()
    i.verification.integrityChecksPassed = 0
    i.verification.integrityChecksTotal = 0
    expect(computeReputation(i).status).toBe('unrated')
  })

  it('flags duplicated observation records as invalid', () => {
    const i = perfect()
    i.track.observationsRecorded = 1300
    const r = computeReputation(i)
    expect(r.status).toBe('unrated')
    expect(factorOf(r, 'T').subfactors.find((s) => s.key === 'T2')!.status).toBe('invalid')
  })

  it('rejects verification dates in the future', () => {
    const i = perfect()
    i.verification.lastVerifiedAt = new Date(Date.parse(AS_OF) + 5 * DAY).toISOString()
    expect(computeReputation(i).status).toBe('unrated')
  })

  it('scores stale evidence 0 on V4 and warns', () => {
    const i = perfect()
    i.verification.lastVerifiedAt = daysAgo(120)
    const r = computeReputation(i)
    expect(factorOf(r, 'V').subfactors.find((s) => s.key === 'V4')!.score).toBe(0)
    expect(hasWarning(r, 'verification.stale')).toBe(true)
  })

  it('counts unavailable non-essential subfactors as 0 without renormalising', () => {
    const i = perfect()
    i.consistency.monthlyReturns = [-0.01, 0.002, -0.004, 0.001] // mean ≤ 0 → K2 unavailable
    const r = computeReputation(i)
    const K = factorOf(r, 'K')
    expect(K.subfactors.find((s) => s.key === 'K2')!.status).toBe('unavailable')
    expect(K.status).toBe('partial')
    // K1: 2 of 4 positive = 50% → 60. K = 0.4·60 + 0.3·0 + 0.3·100 = 54
    expect(K.score).toBeCloseTo(54, 9)
    expect(r.status).toBe('provisional')
  })

  it('treats inconsistent trade records as invalid, not as 100', () => {
    const i = perfect()
    i.performance.largestWinningTrade = 150 // > total positive profit
    const r = computeReputation(i)
    const g = factorOf(r, 'P').subfactors.find((s) => s.key === 'P3')!.components!.find((c) => c.key === 'P3.G')!
    expect(g.status).toBe('invalid')
    expect(g.score).toBeNull()
    expect(r.warnings.some((w) => w.severity === 'critical')).toBe(true)
  })

  it('keeps Participant Trust unavailable and caps the provisional score at 95', () => {
    const i = perfect()
    i.trust = null
    const r = computeReputation(i)
    expect(factorOf(r, 'U').status).toBe('unavailable')
    expect(r.status).toBe(POLICY.allowProvisionalWithoutTrust ? 'provisional' : 'unrated')
    expect(r.score).toBe(95)
    expect(r.maxAttainable).toBe(95)
    expect(r.tier).toBe('diamond') // Obsidian requires Participant Trust
  })
})

/* ------------------------------------------------------------------ tiers */

describe('tier eligibility', () => {
  it('maps score ranges with inclusive lower and exclusive upper bounds', () => {
    expect(scoreBandTier(39.9)).toBeNull()
    expect(scoreBandTier(40)).toBe('bronze')
    expect(scoreBandTier(54.9)).toBe('bronze')
    expect(scoreBandTier(55)).toBe('silver')
    expect(scoreBandTier(64.9)).toBe('silver')
    expect(scoreBandTier(65)).toBe('gold')
    expect(scoreBandTier(75)).toBe('platinum')
    expect(scoreBandTier(85)).toBe('diamond')
    expect(scoreBandTier(92.9)).toBe('diamond')
    expect(scoreBandTier(93)).toBe('obsidian')
    expect(scoreBandTier(100)).toBe('obsidian')
  })

  it('falls back to a lower tier when history is too short for the score tier', () => {
    const i = perfect()
    i.track = { historyDays: 400, observationsRecorded: 400, observationsExpected: 400 } // T1 85
    const r = computeReputation(i)
    expect(r.scoreBandTier).toBe('obsidian')
    expect(r.tier).toBe('platinum') // Obsidian needs 1095d, Diamond 730d, Platinum 365d
    expect(hasWarning(r, 'tier.downgraded')).toBe(true)
  })

  it('awards no tier below Bronze', () => {
    const i = perfect()
    i.performance.sharpe = -1
    i.performance.excessReturnPp = -20
    i.risk.maxDrawdownPct = 60
    i.risk.annualizedVolatilityPct = 90
    i.capital.claim = null
    i.verification.sourceAuthenticity = 'manual-entry'
    i.verification.independentVerification = 'none'
    i.trust = null
    i.track = { historyDays: 20, observationsRecorded: 20, observationsExpected: 20 }
    i.performance.observations = 20
    i.performance.costCompleteness = 'none'
    i.consistency.monthlyReturns = [-0.05, -0.02, 0.01]
    const r = computeReputation(i)
    expect(r.score).toBeLessThan(40)
    expect(r.tier).toBeNull()
    expect(hasWarning(r, 'tier.belowBronze')).toBe(true)
  })

  it('awards no tier when even Bronze gates fail', () => {
    const i = perfect()
    i.verification.lastVerifiedAt = daysAgo(120) // fails every tier's freshness gate
    const r = computeReputation(i)
    expect(r.score).not.toBeNull()
    expect(r.tier).toBeNull()
    expect(r.tierEvaluations.every((t) => !t.eligible)).toBe(true)
  })

  it('reports every gate check for every tier', () => {
    const r = computeReputation(perfect())
    expect(r.tierEvaluations).toHaveLength(6)
    const obsidian = r.tierEvaluations.find((t) => t.tier === 'obsidian')!
    expect(obsidian.checks.map((c) => c.key)).toEqual(
      expect.arrayContaining(['history', 'coverage', 'integrity', 'freshness', 'source', 'independent', 'drawdown', 'claim', 'trust']),
    )
  })

  it('does not award a tier to an UNRATED strategy', () => {
    const i = perfect()
    i.verification.sourceAuthenticity = null
    const r = computeReputation(i)
    expect(r.status).toBe('unrated')
    expect(r.tier).toBeNull()
    expect(r.tierEvaluations).toHaveLength(0)
  })
})
