/**
 * StratX Reputation Engine — deterministic scoring.
 *
 * S = 0.25P + 0.20R + 0.15C + 0.15T + 0.10K + 0.10V + 0.05U
 *
 * Rules enforced here:
 * - Missing, NaN, infinite or out-of-domain inputs are never scored as 100.
 * - Missing ESSENTIAL inputs make the rating UNRATED (score = null).
 * - Missing non-essential inputs contribute 0 (weights are never renormalised)
 *   and make the rating PROVISIONAL.
 * - A failed capital claim forces C = 0 regardless of deposit or duration.
 * - A tier is awarded only when both its score range and its eligibility gates
 *   pass; otherwise lower tiers are evaluated against their own gates.
 */
import {
  CATEGORICAL,
  DENOMINATION_TO_USD,
  FACTOR_LABELS,
  FACTOR_ORDER,
  FACTOR_WEIGHTS,
  INDEPENDENT_RANK,
  METHODOLOGY_VERSION,
  MIN_TIER_SCORE,
  POLICY,
  SOURCE_RANK,
  SUBFACTOR_WEIGHTS as W,
  TABLES,
  TIER_GATES,
  type NumericTable,
  type TierGate,
} from '@/reputation/config'
import type {
  EligibilityCheck,
  FactorKey,
  FactorResult,
  Maybe,
  ReputationInputs,
  ReputationResult,
  ReputationWarning,
  SubfactorResult,
  TierEvaluation,
  TierKey,
} from '@/reputation/types'

/* ================================================================ primitives */

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

export function round1(x: number) {
  return Math.round(x * 10) / 10
}

/** Floating-point safe weighted sum (rounded to 1e-9 to avoid 84.99999…). */
function weightedSum(parts: { score: number | null; weight: number }[]) {
  const s = parts.reduce((acc, p) => acc + (p.score ?? POLICY.unavailableSubfactorContributes) * p.weight, 0)
  return Math.round(s * 1e9) / 1e9
}

export type BandResult =
  | { status: 'available'; score: number; band: string }
  | { status: 'unavailable' | 'invalid'; score: null; reason: string }

/** Looks a numeric value up in a threshold table. See config.ts for the boundary convention. */
export function scoreBand(table: NumericTable, value: Maybe<number>): BandResult {
  if (value === null || value === undefined) return { status: 'unavailable', score: null, reason: 'No data' }
  if (!isFiniteNumber(value)) return { status: 'invalid', score: null, reason: 'Not a finite number' }
  const { min, max, integer } = table.domain
  if (value < min) return { status: 'invalid', score: null, reason: `Below valid range (min ${min})` }
  if (max !== undefined && value > max) return { status: 'invalid', score: null, reason: `Above valid range (max ${max})` }
  if (integer && !Number.isInteger(value)) return { status: 'invalid', score: null, reason: 'Must be a whole number' }
  for (const b of table.bands) {
    if (value < b.upTo || (b.inclusive && value === b.upTo)) return { status: 'available', score: b.score, band: b.label }
  }
  // Unreachable: the last band is always Infinity.
  return { status: 'invalid', score: null, reason: 'No matching band' }
}

const rows = (table: NumericTable) => table.bands.map((b) => ({ label: b.label, score: b.score }))
const catRows = (map: Record<string, { score: number; label: string }>) =>
  Object.values(map).map((v) => ({ label: v.label, score: v.score }))

const fmt = (v: number, unit: string, digits = 2) => {
  const n = Number.isInteger(v) ? v.toString() : v.toFixed(digits)
  if (!unit) return n
  if (unit === 'USD') return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (unit === '%' || unit === 'x') return `${n}${unit}`
  return `${n} ${unit}`
}

interface SubOpts {
  key: string
  label: string
  weight: number
  essential: boolean
}

function numericSub(
  o: SubOpts,
  table: NumericTable,
  value: Maybe<number>,
  extra: { display?: string; reason?: string; forceStatus?: 'unavailable' | 'invalid' } = {},
): SubfactorResult {
  if (extra.forceStatus) {
    return {
      ...o,
      input: isFiniteNumber(value) ? value : null,
      inputDisplay: extra.display ?? (isFiniteNumber(value) ? fmt(value, table.unit) : '—'),
      score: null,
      status: extra.forceStatus,
      reason: extra.reason,
      table: rows(table),
    }
  }
  const r = scoreBand(table, value)
  return {
    ...o,
    input: isFiniteNumber(value) ? value : null,
    inputDisplay: extra.display ?? (isFiniteNumber(value) ? fmt(value, table.unit) : '—'),
    score: r.score,
    status: r.status,
    reason: r.status === 'available' ? undefined : (extra.reason ?? r.reason),
    matchedBand: r.status === 'available' ? r.band : undefined,
    table: rows(table),
  }
}

function categoricalSub<K extends string>(
  o: SubOpts,
  map: Record<K, { score: number; label: string }>,
  value: Maybe<K>,
): SubfactorResult {
  const entry = value ? map[value] : undefined
  if (!value) {
    return { ...o, input: null, inputDisplay: '—', score: null, status: 'unavailable', reason: 'No data', table: catRows(map) }
  }
  if (!entry) {
    return { ...o, input: value, inputDisplay: String(value), score: null, status: 'invalid', reason: 'Unknown category', table: catRows(map) }
  }
  return { ...o, input: value, inputDisplay: entry.label, score: entry.score, status: 'available', matchedBand: entry.label, table: catRows(map) }
}

/** Composite subfactor: weighted sum of components, unavailable parts contributing 0. */
function compositeSub(o: SubOpts, components: SubfactorResult[], formula: string): SubfactorResult {
  const available = components.filter((c) => c.status === 'available')
  const missing = components.filter((c) => c.status !== 'available')
  return {
    ...o,
    input: null,
    inputDisplay: formula,
    score: available.length ? weightedSum(components) : null,
    status: available.length ? 'available' : 'unavailable',
    reason: missing.length
      ? `${missing.map((m) => m.label).join(', ')} unavailable — counted as 0`
      : undefined,
    table: [],
    components,
  }
}

/** Highest score a subfactor could reach given which inputs are available. */
function maxOf(s: SubfactorResult): number {
  if (s.components) return s.components.reduce((a, c) => a + maxOf(c) * c.weight, 0)
  return s.status === 'available' ? 100 : 0
}

function factor(key: FactorKey, formula: string, subfactors: SubfactorResult[], note?: string): FactorResult {
  const available = subfactors.filter((s) => s.status === 'available')
  const partial = subfactors.some(
    (s) => s.status !== 'available' || s.components?.some((c) => c.status !== 'available'),
  )
  const score = available.length ? weightedSum(subfactors) : null
  return {
    key,
    label: FACTOR_LABELS[key],
    weight: FACTOR_WEIGHTS[key],
    formula,
    score,
    contribution: (score ?? 0) * FACTOR_WEIGHTS[key],
    status: !available.length ? 'unavailable' : partial ? 'partial' : 'complete',
    subfactors,
    note,
  }
}

/* ================================================================ derived inputs */

/** Largest winning trade ÷ total positive profit, in percent. Guards against ÷0 and inconsistent records. */
export function profitConcentration(largest: Maybe<number>, total: Maybe<number>):
  | { status: 'available'; value: number }
  | { status: 'unavailable' | 'invalid'; reason: string } {
  if (largest == null || total == null) return { status: 'unavailable', reason: 'No trade-level profit data' }
  if (!isFiniteNumber(largest) || !isFiniteNumber(total)) return { status: 'invalid', reason: 'Not a finite number' }
  if (total <= 0) return { status: 'unavailable', reason: 'No positive trade profits (division by zero)' }
  if (largest < 0) return { status: 'invalid', reason: 'Largest winning trade cannot be negative' }
  if (largest > total) return { status: 'invalid', reason: 'Inconsistent records: largest win exceeds total positive profit' }
  return { status: 'available', value: (largest / total) * 100 }
}

export function positiveShare(returns: Maybe<number[]>, minPeriods: number):
  | { status: 'available'; value: number; n: number }
  | { status: 'unavailable' | 'invalid'; reason: string } {
  if (!returns || returns.length === 0) return { status: 'unavailable', reason: 'No period returns' }
  if (returns.some((r) => !isFiniteNumber(r))) return { status: 'invalid', reason: 'Non-finite period return' }
  if (returns.length < minPeriods) return { status: 'unavailable', reason: `Needs at least ${minPeriods} periods (has ${returns.length})` }
  return { status: 'available', value: (returns.filter((r) => r > 0).length / returns.length) * 100, n: returns.length }
}

/** Sample coefficient of variation of periodic returns; unavailable when the mean is not meaningfully positive. */
export function coefficientOfVariation(returns: Maybe<number[]>):
  | { status: 'available'; value: number; mean: number }
  | { status: 'unavailable' | 'invalid'; reason: string } {
  if (!returns || returns.length === 0) return { status: 'unavailable', reason: 'No period returns' }
  if (returns.some((r) => !isFiniteNumber(r))) return { status: 'invalid', reason: 'Non-finite period return' }
  if (returns.length < POLICY.minConsistencyPeriods)
    return { status: 'unavailable', reason: `Needs at least ${POLICY.minConsistencyPeriods} periods` }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  if (mean < POLICY.minMeaningfulMeanReturn)
    return { status: 'unavailable', reason: `Mean period return ${(mean * 100).toFixed(2)}% is not meaningfully positive` }
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1)
  return { status: 'available', value: Math.sqrt(variance) / mean, mean }
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso)
  const b = Date.parse(toIso)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return (b - a) / 86_400_000
}

/* ================================================================ factors */

function scoreP(i: ReputationInputs): FactorResult {
  const p = i.performance
  const p1 = numericSub({ key: 'P1', label: 'Sharpe ratio (annualised)', weight: W.P.P1, essential: true }, TABLES.P1_sharpe, p.sharpe)
  const p2 = numericSub(
    { key: 'P2', label: `Excess return vs ${p.benchmarkName}`, weight: W.P.P2, essential: true },
    TABLES.P2_excessReturn,
    p.excessReturnPp,
    { display: isFiniteNumber(p.excessReturnPp) ? `${p.excessReturnPp >= 0 ? '+' : ''}${p.excessReturnPp.toFixed(2)} pp` : '—' },
  )

  const obsPct = isFiniteNumber(p.observations) ? (p.observations / POLICY.requiredObservations) * 100 : p.observations
  const o = numericSub(
    { key: 'P3.O', label: 'Observation sufficiency', weight: W.P3.O, essential: false },
    TABLES.P3_observationSufficiency,
    obsPct,
    { display: isFiniteNumber(p.observations) ? `${p.observations} / ${POLICY.requiredObservations} required (${(obsPct as number).toFixed(1)}%)` : '—' },
  )
  const fs = positiveShare(p.periodReturns, POLICY.minComparablePeriods)
  const f = numericSub(
    { key: 'P3.F', label: 'Positive comparable periods (quarters)', weight: W.P3.F, essential: false },
    TABLES.P3_positivePeriods,
    fs.status === 'available' ? fs.value : null,
    fs.status === 'available'
      ? { display: `${fs.value.toFixed(1)}% of ${fs.n} quarters` }
      : { forceStatus: fs.status, reason: fs.reason },
  )
  const pc = profitConcentration(p.largestWinningTrade, p.totalPositiveTradeProfit)
  const g = numericSub(
    { key: 'P3.G', label: 'Profit concentration', weight: W.P3.G, essential: false },
    TABLES.profitConcentration,
    pc.status === 'available' ? pc.value : null,
    pc.status === 'available' ? {} : { forceStatus: pc.status, reason: pc.reason },
  )
  const kc = categoricalSub({ key: 'P3.Kc', label: 'Cost completeness', weight: W.P3.Kc, essential: false }, CATEGORICAL.costCompleteness, p.costCompleteness)
  const p3 = compositeSub({ key: 'P3', label: 'Robustness & data sufficiency', weight: W.P.P3, essential: false }, [o, f, g, kc], '(O + F + G + Kc) / 4')

  return factor('P', 'P = 0.50·P1 + 0.30·P2 + 0.20·P3', [p1, p2, p3])
}

function scoreR(i: ReputationInputs): FactorResult {
  const r = i.risk
  const r1 = numericSub({ key: 'R1', label: 'Maximum drawdown', weight: W.R.R1, essential: true }, TABLES.R1_maxDrawdown, r.maxDrawdownPct)
  const r2 = numericSub({ key: 'R2', label: 'Annualised volatility', weight: W.R.R2, essential: true }, TABLES.R2_volatility, r.annualizedVolatilityPct)
  const r3 = compositeSub(
    { key: 'R3', label: 'Loss severity & losing streaks', weight: W.R.R3, essential: false },
    [
      numericSub({ key: 'R3.loss', label: 'Largest trade loss (% of equity)', weight: W.R3.loss, essential: false }, TABLES.R3_largestLoss, r.largestTradeLossPct),
      numericSub({ key: 'R3.streak', label: 'Max consecutive losing trades', weight: W.R3.streak, essential: false }, TABLES.R3_losingStreak, r.maxConsecutiveLosses),
    ],
    '0.50·loss + 0.50·streak',
  )
  const r4 = compositeSub(
    { key: 'R4', label: 'Leverage & concentration', weight: W.R.R4, essential: false },
    [
      numericSub({ key: 'R4.leverage', label: 'Gross exposure / equity', weight: W.R4.leverage, essential: false }, TABLES.R4_grossExposure, r.grossExposureRatio),
      numericSub({ key: 'R4.concentration', label: 'Largest position share of exposure', weight: W.R4.concentration, essential: false }, TABLES.R4_positionShare, r.largestPositionSharePct),
    ],
    '0.50·leverage + 0.50·concentration',
  )
  return factor('R', 'R = 0.40·R1 + 0.20·R2 + 0.20·R3 + 0.20·R4', [r1, r2, r3, r4])
}

function scoreC(i: ReputationInputs, warnings: ReputationWarning[]): FactorResult {
  const formula = 'C = 0.60·C1 + 0.40·C2, only if the claim passes its predefined test'
  const claim = i.capital.claim
  if (!claim) {
    const none = (key: string, label: string, weight: number, table: NumericTable): SubfactorResult => ({
      key, label, weight, essential: false, input: null, inputDisplay: 'No claim', score: 0, status: 'available',
      matchedBand: 'No capital committed — scores 0', table: rows(table),
    })
    warnings.push({ code: 'capital.none', severity: 'info', message: 'No capital is committed behind a testable claim, so Capital Commitment scores 0.' })
    return factor('C', formula, [none('C1', 'Capital deposited', W.C.C1, TABLES.C1_depositUsd), none('C2', 'Commitment duration', W.C.C2, TABLES.C2_commitmentDays)], 'No claim')
  }

  const conv = DENOMINATION_TO_USD[claim.denomination]
  const usd = isFiniteNumber(claim.depositAmount) && conv ? claim.depositAmount * conv.rate : null
  const c1 = numericSub(
    { key: 'C1', label: 'Capital deposited (USD-equivalent)', weight: W.C.C1, essential: false },
    TABLES.C1_depositUsd,
    usd,
    { display: usd === null ? '—' : `${claim.depositAmount} ${claim.denomination} → ${fmt(usd, 'USD')}${claim.denomination === 'SOL' ? ' (fixed demo rate)' : ''}` },
  )
  const c2 = numericSub({ key: 'C2', label: 'Commitment duration', weight: W.C.C2, essential: false }, TABLES.C2_commitmentDays, claim.commitmentDays)
  if (claim.denomination === 'SOL') {
    warnings.push({ code: 'capital.demoRate', severity: 'info', message: `${conv.label}. Devnet SOL has no monetary value.` })
  }

  const { outcome } = claim
  const authoritative =
    outcome.source === 'vault-program' || (outcome.source === 'demo-deterministic' && i.dataSource === 'demo')

  if (!authoritative) {
    warnings.push({
      code: 'capital.untrustedOutcome',
      severity: 'critical',
      message: `Claim outcome comes from "${outcome.source}", which is not authoritative. Capital Commitment is excluded until the vault program reports it.`,
    })
    return { ...factor('C', formula, [c1, c2]), score: null, contribution: 0, status: 'unavailable', note: 'Outcome not authoritative' }
  }
  if (outcome.source === 'demo-deterministic') {
    warnings.push({
      code: 'capital.demoOutcome',
      severity: 'info',
      message: `Claim outcome is a deterministic DEMO evaluation, not an on-chain vault result.${outcome.status === 'passed' ? ` ${outcome.detail}` : ''}`,
    })
  }
  if (outcome.status === 'pending') {
    warnings.push({ code: 'capital.pending', severity: 'warning', message: `Capital claim "${claim.description}" has not been resolved; Capital Commitment is excluded (counts 0) until it is.` })
    return { ...factor('C', formula, [c1, c2]), score: null, contribution: 0, status: 'unavailable', note: 'Claim test pending' }
  }
  if (outcome.status === 'failed') {
    warnings.push({ code: 'capital.failed', severity: 'critical', message: `Capital claim failed its predefined test — C = 0 regardless of deposit or duration. ${outcome.detail}` })
    return { ...factor('C', formula, [c1, c2]), score: 0, contribution: 0, status: 'complete', note: 'Claim failed — C forced to 0' }
  }
  return factor('C', formula, [c1, c2], 'Claim passed')
}

function scoreT(i: ReputationInputs): FactorResult {
  const t = i.track
  const t1 = numericSub({ key: 'T1', label: 'History length', weight: W.T.T1, essential: true }, TABLES.T1_history, t.historyDays)

  let t2: SubfactorResult
  const opts = { key: 'T2', label: 'Observation coverage', weight: W.T.T2, essential: true }
  if (!isFiniteNumber(t.observationsRecorded) || !isFiniteNumber(t.observationsExpected)) {
    t2 = numericSub(opts, TABLES.T2_coverage, null, { forceStatus: 'unavailable', reason: 'Recorded or expected observation count missing' })
  } else if (t.observationsExpected <= 0) {
    t2 = numericSub(opts, TABLES.T2_coverage, null, { forceStatus: 'unavailable', reason: 'Expected observations is zero (division by zero)' })
  } else {
    const pct = (t.observationsRecorded / t.observationsExpected) * 100
    t2 =
      pct > POLICY.maxCoverageBeforeDuplicateFlag
        ? numericSub(opts, TABLES.T2_coverage, pct, {
            forceStatus: 'invalid',
            display: `${t.observationsRecorded} / ${t.observationsExpected}`,
            reason: 'More observations than expected — possible duplicated records',
          })
        : numericSub(opts, TABLES.T2_coverage, pct, { display: `${t.observationsRecorded} / ${t.observationsExpected} (${pct.toFixed(1)}%)` })
  }
  return factor('T', 'T = 0.60·T1 + 0.40·T2', [t1, t2])
}

function scoreK(i: ReputationInputs): FactorResult {
  const m = i.consistency.monthlyReturns
  const ps = positiveShare(m, POLICY.minConsistencyPeriods)
  const k1 = numericSub(
    { key: 'K1', label: 'Profitable months', weight: W.K.K1, essential: false },
    TABLES.K1_profitablePeriods,
    ps.status === 'available' ? ps.value : null,
    ps.status === 'available' ? { display: `${ps.value.toFixed(1)}% of ${ps.n} months` } : { forceStatus: ps.status, reason: ps.reason },
  )
  const cv = coefficientOfVariation(m)
  const k2 = numericSub(
    { key: 'K2', label: 'Return stability (coefficient of variation)', weight: W.K.K2, essential: false },
    TABLES.K2_coefficientOfVariation,
    cv.status === 'available' ? cv.value : null,
    cv.status === 'available' ? {} : { forceStatus: cv.status, reason: cv.reason },
  )
  const pc = profitConcentration(i.performance.largestWinningTrade, i.performance.totalPositiveTradeProfit)
  const k3 = numericSub(
    { key: 'K3', label: 'Profit concentration (same table as P3·G)', weight: W.K.K3, essential: false },
    TABLES.profitConcentration,
    pc.status === 'available' ? pc.value : null,
    pc.status === 'available' ? {} : { forceStatus: pc.status, reason: pc.reason },
  )
  return factor('K', 'K = 0.40·K1 + 0.30·K2 + 0.30·K3', [k1, k2, k3])
}

function scoreV(i: ReputationInputs, warnings: ReputationWarning[]): FactorResult {
  const v = i.verification
  const v1 = categoricalSub({ key: 'V1', label: 'Source authenticity', weight: W.V.V1, essential: true }, CATEGORICAL.sourceAuthenticity, v.sourceAuthenticity)

  const v2opts = { key: 'V2', label: 'Required-record integrity', weight: W.V.V2, essential: true }
  let v2: SubfactorResult
  if (!isFiniteNumber(v.integrityChecksPassed) || !isFiniteNumber(v.integrityChecksTotal)) {
    v2 = numericSub(v2opts, TABLES.V2_integrity, null, { forceStatus: 'unavailable', reason: 'Integrity check results missing' })
  } else if (v.integrityChecksTotal <= 0) {
    v2 = numericSub(v2opts, TABLES.V2_integrity, null, { forceStatus: 'unavailable', reason: 'No integrity checks have run (division by zero)' })
  } else if (v.integrityChecksPassed < 0 || v.integrityChecksPassed > v.integrityChecksTotal) {
    v2 = numericSub(v2opts, TABLES.V2_integrity, null, { forceStatus: 'invalid', reason: 'Passed checks outside 0…total' })
  } else {
    const pct = (v.integrityChecksPassed / v.integrityChecksTotal) * 100
    v2 = numericSub(v2opts, TABLES.V2_integrity, pct, { display: `${v.integrityChecksPassed} / ${v.integrityChecksTotal} passed (${pct.toFixed(1)}%)` })
  }

  const v3 = categoricalSub({ key: 'V3', label: 'Independent verification', weight: W.V.V3, essential: true }, CATEGORICAL.independentVerification, v.independentVerification)

  const v4opts = { key: 'V4', label: 'Evidence freshness', weight: W.V.V4, essential: true }
  let v4: SubfactorResult
  const age = v.lastVerifiedAt ? daysBetween(v.lastVerifiedAt, i.asOf) : null
  if (!v.lastVerifiedAt) {
    v4 = numericSub(v4opts, TABLES.V4_evidenceAgeDays, null, { forceStatus: 'unavailable', reason: 'No verification date' })
  } else if (age === null) {
    v4 = numericSub(v4opts, TABLES.V4_evidenceAgeDays, null, { forceStatus: 'invalid', reason: 'Unparseable verification date' })
  } else if (age < -1 / 24) {
    v4 = numericSub(v4opts, TABLES.V4_evidenceAgeDays, null, { forceStatus: 'invalid', reason: 'Verification date is in the future' })
  } else {
    const days = Math.max(0, age)
    v4 = numericSub(v4opts, TABLES.V4_evidenceAgeDays, days, { display: `${days.toFixed(1)} days old` })
    if (days > POLICY.staleEvidenceDays) {
      warnings.push({ code: 'verification.stale', severity: 'warning', message: `Evidence is ${Math.floor(days)} days old (stale beyond ${POLICY.staleEvidenceDays} days).` })
    }
  }
  return factor('V', 'V = 0.35·V1 + 0.30·V2 + 0.25·V3 + 0.10·V4', [v1, v2, v3, v4])
}

function scoreU(i: ReputationInputs): FactorResult {
  const formula = 'U = 0.50·U1 + 0.30·U2 + 0.20·U3'
  const t = i.trust
  const ratingOpts = { key: 'U1', label: 'Eligible average rating (1–5)', weight: W.U.U1, essential: false }
  if (!t) {
    const na = (key: string, label: string, weight: number, table: NumericTable) =>
      numericSub({ key, label, weight, essential: false }, table, null, { forceStatus: 'unavailable', reason: 'No eligible feedback or dispute data' })
    return factor('U', formula, [
      na('U1', ratingOpts.label, W.U.U1, TABLES.U1_rating),
      na('U2', 'Feedback integrity', W.U.U2, TABLES.U2_integrity),
      na('U3', 'Disputes resolved within target', W.U.U3, TABLES.U3_disputes),
    ], 'Unavailable — no eligible participant data')
  }
  let u1: SubfactorResult
  if (!isFiniteNumber(t.averageRating) || !isFiniteNumber(t.eligibleRatings) || t.eligibleRatings < 1) {
    u1 = numericSub(ratingOpts, TABLES.U1_rating, null, { forceStatus: 'unavailable', reason: 'No eligible ratings' })
  } else if (t.averageRating < 1 || t.averageRating > 5) {
    u1 = numericSub(ratingOpts, TABLES.U1_rating, t.averageRating, { forceStatus: 'invalid', reason: 'Rating outside 1–5' })
  } else {
    const s = ((t.averageRating - 1) / 4) * 100
    u1 = { ...numericSub(ratingOpts, TABLES.U1_rating, s), input: t.averageRating, inputDisplay: `${t.averageRating.toFixed(2)} avg from ${t.eligibleRatings}`, score: s, matchedBand: '(average − 1) ÷ 4 × 100' }
  }
  const u2 = numericSub({ key: 'U2', label: 'Feedback integrity', weight: W.U.U2, essential: false }, TABLES.U2_integrity, t.integrityPct)
  const u3 = numericSub({ key: 'U3', label: 'Disputes resolved within target', weight: W.U.U3, essential: false }, TABLES.U3_disputes, t.disputesResolvedWithinTargetPct)
  return factor('U', formula, [u1, u2, u3])
}

/* ================================================================ tiers */

function claimGatePasses(gate: TierGate['claim'], i: ReputationInputs) {
  const c = i.capital.claim
  if (gate === 'any') return { passed: true, detail: 'No claim requirement' }
  if (gate === 'not-failed') {
    const failed = c?.outcome.status === 'failed'
    return { passed: !failed, detail: failed ? 'Capital claim failed' : c ? `Claim ${c.outcome.status}` : 'No claim (allowed)' }
  }
  const passed = c?.outcome.status === 'passed'
  return { passed, detail: passed ? 'Capital claim passed' : c ? `Claim ${c.outcome.status} — must have passed` : 'Requires a passed capital claim' }
}

export function evaluateTierGates(
  gate: TierGate,
  score: number,
  i: ReputationInputs,
  factors: FactorResult[],
): TierEvaluation {
  const sub = (fk: FactorKey, sk: string) => factors.find((f) => f.key === fk)?.subfactors.find((s) => s.key === sk)
  const history = i.track.historyDays
  const coverageSub = sub('T', 'T2')
  const coverage = coverageSub?.status === 'available' ? (coverageSub.input as number) : null
  const integritySub = sub('V', 'V2')
  const integrity = integritySub?.status === 'available' ? (integritySub.input as number) : null
  const ageSub = sub('V', 'V4')
  const age = ageSub?.status === 'available' ? (ageSub.input as number) : null
  const srcRank = i.verification.sourceAuthenticity ? SOURCE_RANK.indexOf(i.verification.sourceAuthenticity) : -1
  const indRank = i.verification.independentVerification ? INDEPENDENT_RANK.indexOf(i.verification.independentVerification) : -1
  const mdd = i.risk.maxDrawdownPct
  const claim = claimGatePasses(gate.claim, i)
  const trustAvailable = factors.find((f) => f.key === 'U')?.status !== 'unavailable'

  const checks: EligibilityCheck[] = [
    {
      key: 'history',
      label: `History ≥ ${gate.minHistoryDays} days`,
      passed: isFiniteNumber(history) && history >= gate.minHistoryDays,
      detail: isFiniteNumber(history) ? `${history} days` : 'Missing',
    },
    {
      key: 'coverage',
      label: `Observation coverage ≥ ${gate.minCoveragePct}%`,
      passed: coverage !== null && coverage >= gate.minCoveragePct,
      detail: coverage !== null ? `${coverage.toFixed(1)}%` : 'Missing or invalid',
    },
    {
      key: 'integrity',
      label: `Record integrity ≥ ${gate.minIntegrityPct}%`,
      passed: integrity !== null && integrity >= gate.minIntegrityPct,
      detail: integrity !== null ? `${integrity.toFixed(1)}%` : 'Missing or invalid',
    },
    {
      key: 'freshness',
      label: `Evidence ≤ ${gate.maxEvidenceAgeDays} days old`,
      passed: age !== null && age <= gate.maxEvidenceAgeDays,
      detail: age !== null ? `${age.toFixed(1)} days` : 'Missing or invalid',
    },
    {
      key: 'source',
      label: `Source at least "${CATEGORICAL.sourceAuthenticity[gate.minSourceAuthenticity].label}"`,
      passed: srcRank >= SOURCE_RANK.indexOf(gate.minSourceAuthenticity),
      detail: i.verification.sourceAuthenticity ? CATEGORICAL.sourceAuthenticity[i.verification.sourceAuthenticity].label : 'Missing',
    },
    {
      key: 'independent',
      label: `Independent verification at least "${CATEGORICAL.independentVerification[gate.minIndependentVerification].label}"`,
      passed: indRank >= INDEPENDENT_RANK.indexOf(gate.minIndependentVerification),
      detail: i.verification.independentVerification ? CATEGORICAL.independentVerification[i.verification.independentVerification].label : 'Missing',
    },
  ]
  if (gate.maxDrawdownPct !== null) {
    checks.push({
      key: 'drawdown',
      label: `Max drawdown ≤ ${gate.maxDrawdownPct}%`,
      passed: isFiniteNumber(mdd) && mdd <= gate.maxDrawdownPct,
      detail: isFiniteNumber(mdd) ? `${mdd.toFixed(1)}%` : 'Missing',
    })
  }
  if (gate.claim !== 'any') checks.push({ key: 'claim', label: gate.claim === 'passed' ? 'Capital claim passed' : 'No failed capital claim', ...claim })
  if (gate.requireParticipantTrust) {
    checks.push({ key: 'trust', label: 'Participant Trust data available', passed: trustAvailable, detail: trustAvailable ? 'Available' : 'Unavailable' })
  }

  const scoreQualifies = score >= gate.minScore
  return {
    tier: gate.tier,
    minScore: gate.minScore,
    maxScoreExclusive: gate.maxScoreExclusive,
    scoreQualifies,
    checks,
    eligible: scoreQualifies && checks.every((c) => c.passed),
  }
}

export function scoreBandTier(score: number): TierKey | null {
  return TIER_GATES.find((g) => score >= g.minScore && score < g.maxScoreExclusive)?.tier ?? null
}

/* ================================================================ entry point */

export function computeReputation(i: ReputationInputs): ReputationResult {
  const warnings: ReputationWarning[] = []
  if (i.dataSource === 'demo') {
    warnings.push({ code: 'data.demo', severity: 'info', message: 'All inputs are DEMO DATA. This score and tier are illustrative, not a real or verified rating.' })
  }
  if (i.dataSource === 'self-reported') {
    warnings.push({ code: 'data.selfReported', severity: 'warning', message: 'Performance was uploaded by the creator and has only passed automated format checks. It has not been independently verified.' })
  }

  const byKey: Record<FactorKey, FactorResult> = {
    P: scoreP(i),
    R: scoreR(i),
    C: scoreC(i, warnings),
    T: scoreT(i),
    K: scoreK(i),
    V: scoreV(i, warnings),
    U: scoreU(i),
  }
  const factors = FACTOR_ORDER.map((k) => byKey[k])

  // Essential inputs + subfactor warnings.
  const missingEssential: string[] = []
  for (const f of factors) {
    for (const s of f.subfactors) {
      const parts = s.components ?? [s]
      for (const p of parts) {
        if (p.status === 'available') continue
        if (p.essential || s.essential) {
          missingEssential.push(`${f.key}·${p.key} ${p.label}`)
        } else if (f.key !== 'U' && !(f.key === 'C')) {
          warnings.push({
            code: `${p.key}.${p.status}`,
            severity: p.status === 'invalid' ? 'critical' : 'warning',
            message: `${f.key}·${p.label}: ${p.reason ?? p.status} — counted as 0.`,
          })
        }
      }
    }
  }

  const uUnavailable = byKey.U.status === 'unavailable'
  if (uUnavailable) {
    warnings.push({
      code: 'trust.unavailable',
      severity: 'info',
      message: POLICY.allowProvisionalWithoutTrust
        ? 'Participant Trust is unavailable (no eligible feedback or dispute data). Its 5% weight is not redistributed, so the maximum attainable score is 95 and the rating is PROVISIONAL.'
        : 'Participant Trust is unavailable and the current policy requires it; the strategy is UNRATED.',
    })
  }

  const maxAttainable = round1(
    factors.reduce((acc, f) => {
      // No claim yet: committing capital later could still earn the full C weight.
      if (f.key === 'C' && i.capital.claim === null) return acc + f.weight * 100
      if (f.key === 'C' && i.capital.claim?.outcome.status === 'failed') return acc
      if (f.status === 'unavailable') return acc
      return acc + f.weight * f.subfactors.reduce((a, s) => a + maxOf(s) * s.weight, 0)
    }, 0),
  )

  const base = {
    factors,
    warnings,
    missingEssential,
    maxAttainable,
    evidenceSource: i.verification.evidenceSource,
    lastVerifiedAt: i.verification.lastVerifiedAt ?? null,
    computedAt: i.asOf,
    methodologyVersion: METHODOLOGY_VERSION,
    dataSource: i.dataSource,
  }

  const unratedByPolicy = uUnavailable && !POLICY.allowProvisionalWithoutTrust
  if (missingEssential.length || unratedByPolicy) {
    if (missingEssential.length) {
      warnings.unshift({
        code: 'rating.unrated',
        severity: 'critical',
        message: `UNRATED — essential data missing or invalid: ${missingEssential.join('; ')}.`,
      })
    }
    return { ...base, status: 'unrated', score: null, tier: null, scoreBandTier: null, tierEvaluations: [] }
  }

  const score = round1(factors.reduce((acc, f) => acc + f.contribution, 0))
  const bandTier = scoreBandTier(score)
  const tierEvaluations = TIER_GATES.map((g) => evaluateTierGates(g, score, i, factors))

  // Start at the score's own tier and walk down until a tier's gates pass.
  let tier: TierKey | null = null
  if (bandTier) {
    const start = TIER_GATES.findIndex((g) => g.tier === bandTier)
    for (let k = start; k >= 0; k--) {
      if (tierEvaluations[k].eligible) {
        tier = tierEvaluations[k].tier
        break
      }
    }
    if (tier !== bandTier) {
      const failed = tierEvaluations[start].checks.filter((c) => !c.passed).map((c) => c.label)
      const bandLabel = TIER_GATES[start].label
      warnings.push({
        code: 'tier.downgraded',
        severity: 'warning',
        message: tier
          ? `Score is in the ${bandLabel} range, but ${bandLabel} gates fail (${failed.join('; ')}). Awarded ${TIER_GATES.find((g) => g.tier === tier)!.label}.`
          : `Score is in the ${bandLabel} range, but no tier's eligibility gates pass (${bandLabel}: ${failed.join('; ')}).`,
      })
    }
  } else {
    warnings.push({ code: 'tier.belowBronze', severity: 'info', message: `Score ${score} is below the Bronze minimum of ${MIN_TIER_SCORE}.` })
  }

  const partial = factors.some((f) => f.status !== 'complete')
  return {
    ...base,
    status: partial ? 'provisional' : 'rated',
    score,
    tier,
    scoreBandTier: bandTier,
    tierEvaluations,
  }
}
