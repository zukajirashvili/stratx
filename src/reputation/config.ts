/**
 * StratX Reputation Engine — centralised configuration.
 *
 * Every weight, threshold table, tier gate and policy constant lives here.
 * Components and scoring code never hard-code a threshold.
 *
 * BOUNDARY CONVENTION for numeric tables
 * ---------------------------------------
 * Bands are evaluated in order. A value lands in the first band where
 *   value <  upTo                (inclusive: false)   — "below X" / "X to below Y"
 *   value <= upTo                (inclusive: true)    — "X% or less" / "above X–Y%"
 * The last band always has upTo = Infinity. Values below `domain.min` or above
 * `domain.max` are INVALID (never clamped into a band).
 */
import type {
  CostCompleteness,
  FactorKey,
  IndependentVerification,
  SourceAuthenticity,
  TierKey,
} from '@/reputation/types'

export const METHODOLOGY_VERSION = '1.0.0-prototype'

export interface Band {
  upTo: number
  inclusive: boolean
  score: number
  label: string
}

export interface NumericTable {
  unit: string
  domain: { min: number; max?: number; integer?: boolean }
  bands: Band[]
}

const lt = (upTo: number, score: number, label: string): Band => ({ upTo, inclusive: false, score, label })
const le = (upTo: number, score: number, label: string): Band => ({ upTo, inclusive: true, score, label })
const rest = (score: number, label: string): Band => ({ upTo: Infinity, inclusive: false, score, label })

/* ------------------------------------------------------------ factor weights */

export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  P: 0.25,
  R: 0.2,
  C: 0.15,
  T: 0.15,
  K: 0.1,
  V: 0.1,
  U: 0.05,
}

export const FACTOR_LABELS: Record<FactorKey, string> = {
  P: 'Risk-Adjusted Performance',
  R: 'Risk Management',
  C: 'Capital Commitment',
  T: 'Track Record',
  K: 'Consistency',
  V: 'Verification Quality',
  U: 'Participant Trust',
}

export const FACTOR_ORDER: FactorKey[] = ['P', 'R', 'C', 'T', 'K', 'V', 'U']

export const SUBFACTOR_WEIGHTS = {
  P: { P1: 0.5, P2: 0.3, P3: 0.2 },
  /** P3 = (O + F + G + Kc) / 4 */
  P3: { O: 0.25, F: 0.25, G: 0.25, Kc: 0.25 },
  R: { R1: 0.4, R2: 0.2, R3: 0.2, R4: 0.2 },
  R3: { loss: 0.5, streak: 0.5 },
  R4: { leverage: 0.5, concentration: 0.5 },
  C: { C1: 0.6, C2: 0.4 },
  T: { T1: 0.6, T2: 0.4 },
  K: { K1: 0.4, K2: 0.3, K3: 0.3 },
  V: { V1: 0.35, V2: 0.3, V3: 0.25, V4: 0.1 },
  U: { U1: 0.5, U2: 0.3, U3: 0.2 },
} as const

/* ------------------------------------------------------------ threshold tables */

const percentDomain = { min: 0, max: 100 }

/** Integrity / pass-rate percentages — shared by V2 and U2. */
const INTEGRITY_TABLE: NumericTable = {
  unit: '%',
  domain: percentDomain,
  bands: [lt(50, 0, 'Below 50%'), lt(70, 25, '50–69.99%'), lt(85, 50, '70–84.99%'), lt(95, 75, '85–94.99%'), rest(100, '95–100%')],
}

/** Largest winning trade ÷ total positive trade profit — shared by P3·G and K3. */
const PROFIT_CONCENTRATION_TABLE: NumericTable = {
  unit: '%',
  domain: percentDomain,
  bands: [
    le(10, 100, '10% or less'),
    le(20, 80, 'Above 10–20%'),
    le(35, 60, 'Above 20–35%'),
    le(50, 40, 'Above 35–50%'),
    le(75, 20, 'Above 50–75%'),
    rest(0, 'Above 75%'),
  ],
}

export const TABLES = {
  P1_sharpe: {
    unit: '',
    domain: { min: -Infinity },
    bands: [lt(0, 10, 'Below 0'), lt(0.5, 30, '0 to below 0.5'), lt(1, 50, '0.5 to below 1'), lt(1.5, 70, '1 to below 1.5'), lt(2, 85, '1.5 to below 2'), rest(100, '2 or higher')],
  },
  P2_excessReturn: {
    unit: 'pp',
    domain: { min: -Infinity },
    bands: [lt(-10, 0, 'Below −10 pp'), lt(-5, 20, '−10 to below −5 pp'), lt(0, 40, '−5 to below 0 pp'), lt(3, 60, '0 to below +3 pp'), lt(7, 80, '+3 to below +7 pp'), rest(100, '+7 pp or higher')],
  },
  P3_observationSufficiency: {
    unit: '%',
    domain: { min: 0 },
    bands: [lt(25, 0, 'Below 25%'), lt(50, 25, '25–49.99%'), lt(75, 50, '50–74.99%'), lt(100, 75, '75–99.99%'), rest(100, '100% or more')],
  },
  P3_positivePeriods: {
    unit: '%',
    domain: percentDomain,
    bands: [lt(20, 0, 'Below 20%'), lt(40, 25, '20–39.99%'), lt(60, 50, '40–59.99%'), lt(80, 75, '60–79.99%'), rest(100, '80–100%')],
  },
  profitConcentration: PROFIT_CONCENTRATION_TABLE,
  R1_maxDrawdown: {
    unit: '%',
    domain: percentDomain,
    bands: [le(2, 100, '0–2%'), le(5, 85, 'Above 2–5%'), le(10, 70, 'Above 5–10%'), le(20, 50, 'Above 10–20%'), le(30, 25, 'Above 20–30%'), rest(0, 'Above 30%')],
  },
  R2_volatility: {
    unit: '%',
    domain: { min: 0 },
    bands: [le(5, 100, '0–5%'), le(10, 85, 'Above 5–10%'), le(20, 70, 'Above 10–20%'), le(35, 50, 'Above 20–35%'), le(50, 25, 'Above 35–50%'), rest(0, 'Above 50%')],
  },
  R3_largestLoss: {
    unit: '%',
    domain: percentDomain,
    bands: [le(0.5, 100, '0–0.5%'), le(1, 85, 'Above 0.5–1%'), le(2, 70, 'Above 1–2%'), le(4, 50, 'Above 2–4%'), le(8, 25, 'Above 4–8%'), rest(0, 'Above 8%')],
  },
  R3_losingStreak: {
    unit: 'trades',
    domain: { min: 0, integer: true },
    bands: [le(2, 100, '0–2'), le(4, 80, '3–4'), le(6, 60, '5–6'), le(9, 30, '7–9'), rest(0, '10 or more')],
  },
  R4_grossExposure: {
    unit: 'x',
    domain: { min: 0 },
    bands: [le(1, 100, '1x or less'), le(2, 85, 'Above 1–2x'), le(3, 65, 'Above 2–3x'), le(5, 40, 'Above 3–5x'), le(10, 15, 'Above 5–10x'), rest(0, 'Above 10x')],
  },
  R4_positionShare: {
    unit: '%',
    domain: percentDomain,
    bands: [le(10, 100, '10% or less'), le(20, 85, 'Above 10–20%'), le(35, 70, 'Above 20–35%'), le(50, 50, 'Above 35–50%'), le(75, 25, 'Above 50–75%'), rest(0, 'Above 75%')],
  },
  C1_depositUsd: {
    unit: 'USD',
    domain: { min: 0 },
    bands: [lt(100, 10, 'Less than $100'), lt(500, 25, '$100–499.99'), lt(1000, 40, '$500–999.99'), lt(2500, 60, '$1,000–2,499.99'), lt(5000, 80, '$2,500–4,999.99'), rest(100, '$5,000 or more')],
  },
  C2_commitmentDays: {
    unit: 'days',
    domain: { min: 0 },
    bands: [lt(7, 10, 'Less than 7 days'), lt(30, 30, '7–29 days'), lt(90, 50, '30–89 days'), lt(180, 70, '90–179 days'), lt(365, 85, '180–364 days'), rest(100, '365 days or more')],
  },
  T1_history: {
    unit: 'days',
    domain: { min: 0 },
    bands: [lt(30, 10, 'Below 30 days'), lt(90, 30, '30–89 days'), lt(180, 50, '90–179 days'), lt(365, 70, '180–364 days'), lt(730, 85, '365–729 days'), rest(100, '730 days or more')],
  },
  T2_coverage: {
    unit: '%',
    domain: { min: 0 },
    bands: [lt(40, 0, 'Below 40%'), lt(60, 25, '40–59.99%'), lt(75, 50, '60–74.99%'), lt(90, 75, '75–89.99%'), rest(100, '90–100% or more')],
  },
  K1_profitablePeriods: {
    unit: '%',
    domain: percentDomain,
    bands: [lt(20, 0, 'Below 20%'), lt(35, 25, '20–34.99%'), lt(50, 40, '35–49.99%'), lt(60, 60, '50–59.99%'), lt(75, 80, '60–74.99%'), rest(100, '75–100%')],
  },
  K2_coefficientOfVariation: {
    unit: '',
    domain: { min: 0 },
    bands: [le(0.5, 100, '0–0.5'), le(1, 80, 'Above 0.5–1'), le(1.5, 60, 'Above 1–1.5'), le(2, 40, 'Above 1.5–2'), le(3, 20, 'Above 2–3'), rest(0, 'Above 3')],
  },
  V2_integrity: INTEGRITY_TABLE,
  V4_evidenceAgeDays: {
    unit: 'days',
    domain: { min: 0 },
    bands: [le(7, 100, '7 days or less'), le(30, 80, 'Above 7–30 days'), le(60, 60, 'Above 30–60 days'), le(90, 30, 'Above 60–90 days'), rest(0, 'Above 90 days')],
  },
  U1_rating: {
    unit: '',
    domain: { min: 0, max: 100 },
    // U1 is a continuous normalisation, (avg − 1) / 4 × 100; this table only documents it.
    bands: [rest(0, '(average − 1) ÷ 4 × 100')],
  },
  U2_integrity: INTEGRITY_TABLE,
  U3_disputes: {
    unit: '%',
    domain: percentDomain,
    bands: [lt(20, 0, 'Below 20%'), lt(40, 25, '20–39.99%'), lt(60, 50, '40–59.99%'), lt(80, 75, '60–79.99%'), rest(100, '80–100%')],
  },
} satisfies Record<string, NumericTable>

export const CATEGORICAL = {
  costCompleteness: {
    none: { score: 0, label: 'No cost information' },
    'major-missing': { score: 25, label: 'Major costs missing' },
    'important-gaps': { score: 50, label: 'Important gaps remain' },
    'major-included': { score: 75, label: 'All major known costs included' },
    'fully-documented': { score: 100, label: 'All relevant costs documented and reflected in net returns' },
  } satisfies Record<CostCompleteness, { score: number; label: string }>,
  sourceAuthenticity: {
    'unsupported-self-reported': { score: 0, label: 'Unsupported self-reported claim' },
    'manual-entry': { score: 10, label: 'Manually entered figures' },
    'unauthenticated-file': { score: 30, label: 'Unauthenticated CSV/screenshot' },
    'authenticated-source': { score: 70, label: 'Authenticated source records' },
    'independently-checked': { score: 100, label: 'Independently checked source records' },
  } satisfies Record<SourceAuthenticity, { score: number; label: string }>,
  independentVerification: {
    none: { score: 0, label: 'None' },
    'format-checks': { score: 20, label: 'Automated format checks only' },
    'checked-against-source': { score: 50, label: 'Checked against identifiable source' },
    'independently-reviewed': { score: 80, label: 'Authenticated source independently reviewed' },
    'documented-independent': { score: 100, label: 'Documented independent verification' },
  } satisfies Record<IndependentVerification, { score: number; label: string }>,
}

/** Ordinal ranks used by tier gates ("at least X"). */
export const SOURCE_RANK: SourceAuthenticity[] = [
  'unsupported-self-reported',
  'manual-entry',
  'unauthenticated-file',
  'authenticated-source',
  'independently-checked',
]
export const INDEPENDENT_RANK: IndependentVerification[] = [
  'none',
  'format-checks',
  'checked-against-source',
  'independently-reviewed',
  'documented-independent',
]

/* ------------------------------------------------------------ prototype policy */

export const POLICY = {
  /** Observations needed for full statistical sufficiency in P3·O (one year of daily data). */
  requiredObservations: 365,
  /** Minimum comparable periods (quarters) before P3·F is scored. */
  minComparablePeriods: 2,
  /** Minimum monthly periods before K1/K2 are scored. */
  minConsistencyPeriods: 3,
  /** K2 is unavailable unless the mean periodic return is at least this (fraction per period). */
  minMeaningfulMeanReturn: 0.001,
  /** Evidence older than this triggers a staleness warning (V4 already scores 0 beyond it). */
  staleEvidenceDays: 90,
  /**
   * Coverage above 100% means more observations than expected days — a sign of
   * duplicated records. Above this tolerance T2 is marked INVALID.
   */
  maxCoverageBeforeDuplicateFlag: 101,
  /**
   * Participant Trust (U) policy. When U has no eligible data, the engine
   * issues a PROVISIONAL rating: U contributes 0 (its 5% is NOT redistributed),
   * so the maximum attainable score is 95. Set to false to make every strategy
   * without trust data UNRATED instead.
   */
  allowProvisionalWithoutTrust: true,
  /** Any other unavailable non-essential subfactor also contributes 0 and makes the rating provisional. */
  unavailableSubfactorContributes: 0,
} as const

/**
 * Denomination conversion for C1. Devnet SOL has no monetary value; this is a
 * FIXED DEMO RATE, not a market price, and must be replaced by an oracle or a
 * USD-denominated vault before production.
 */
export const DENOMINATION_TO_USD = {
  USD: { rate: 1, label: 'USD' },
  USDC: { rate: 1, label: 'USDC (1:1)' },
  SOL: { rate: 150, label: 'SOL at fixed demo rate $150 — not a live market price' },
} as const

/* ------------------------------------------------------------ tiers & gates */

export type ClaimGate = 'any' | 'not-failed' | 'passed'

export interface TierGate {
  tier: TierKey
  label: string
  minScore: number
  /** Exclusive upper bound. Bronze is [40, 55), …, Obsidian is [93, ∞). */
  maxScoreExclusive: number
  minHistoryDays: number
  minCoveragePct: number
  minIntegrityPct: number
  maxEvidenceAgeDays: number
  minSourceAuthenticity: SourceAuthenticity
  minIndependentVerification: IndependentVerification
  /** null = no drawdown gate. */
  maxDrawdownPct: number | null
  claim: ClaimGate
  requireParticipantTrust: boolean
}

/**
 * Tier gates. Score ranges and minimum history come from the methodology; the
 * remaining gates are a PROTOTYPE POLICY chosen for this MVP and documented in
 * the UI — they are expected to be revised.
 */
export const TIER_GATES: TierGate[] = [
  { tier: 'bronze', label: 'Bronze', minScore: 40, maxScoreExclusive: 55, minHistoryDays: 30, minCoveragePct: 60, minIntegrityPct: 70, maxEvidenceAgeDays: 90, minSourceAuthenticity: 'unauthenticated-file', minIndependentVerification: 'none', maxDrawdownPct: null, claim: 'any', requireParticipantTrust: false },
  { tier: 'silver', label: 'Silver', minScore: 55, maxScoreExclusive: 65, minHistoryDays: 90, minCoveragePct: 75, minIntegrityPct: 85, maxEvidenceAgeDays: 60, minSourceAuthenticity: 'unauthenticated-file', minIndependentVerification: 'format-checks', maxDrawdownPct: 40, claim: 'not-failed', requireParticipantTrust: false },
  { tier: 'gold', label: 'Gold', minScore: 65, maxScoreExclusive: 75, minHistoryDays: 180, minCoveragePct: 90, minIntegrityPct: 85, maxEvidenceAgeDays: 30, minSourceAuthenticity: 'authenticated-source', minIndependentVerification: 'checked-against-source', maxDrawdownPct: 30, claim: 'not-failed', requireParticipantTrust: false },
  { tier: 'platinum', label: 'Platinum', minScore: 75, maxScoreExclusive: 85, minHistoryDays: 365, minCoveragePct: 90, minIntegrityPct: 95, maxEvidenceAgeDays: 30, minSourceAuthenticity: 'authenticated-source', minIndependentVerification: 'checked-against-source', maxDrawdownPct: 25, claim: 'not-failed', requireParticipantTrust: false },
  { tier: 'diamond', label: 'Diamond', minScore: 85, maxScoreExclusive: 93, minHistoryDays: 730, minCoveragePct: 95, minIntegrityPct: 95, maxEvidenceAgeDays: 7, minSourceAuthenticity: 'independently-checked', minIndependentVerification: 'independently-reviewed', maxDrawdownPct: 20, claim: 'passed', requireParticipantTrust: false },
  { tier: 'obsidian', label: 'Obsidian', minScore: 93, maxScoreExclusive: Infinity, minHistoryDays: 1095, minCoveragePct: 95, minIntegrityPct: 95, maxEvidenceAgeDays: 7, minSourceAuthenticity: 'independently-checked', minIndependentVerification: 'documented-independent', maxDrawdownPct: 15, claim: 'passed', requireParticipantTrust: true },
]

/** Lowest score that earns any tier. */
export const MIN_TIER_SCORE = TIER_GATES[0].minScore
