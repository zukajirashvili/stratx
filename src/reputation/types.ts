/**
 * StratX Reputation Engine — typed input and output models.
 *
 * The engine is a pure function of `ReputationInputs`. It has no React,
 * network or clock dependencies (the evaluation time is an input), so the same
 * inputs always produce the same result.
 *
 * Unit conventions (documented once, used everywhere):
 * - Percentages are expressed in percent units: 12.5 means 12.5%.
 * - Returns in arrays (monthly / quarterly) are fractions: 0.012 means +1.2%.
 * - Durations are in days. Timestamps are ISO-8601 strings.
 */

export type Maybe<T> = T | null | undefined

export type FactorKey = 'P' | 'R' | 'C' | 'T' | 'K' | 'V' | 'U'

export type TierKey = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'obsidian'

export type CostCompleteness =
  | 'none'
  | 'major-missing'
  | 'important-gaps'
  | 'major-included'
  | 'fully-documented'

export type SourceAuthenticity =
  | 'unsupported-self-reported'
  | 'manual-entry'
  | 'unauthenticated-file'
  | 'authenticated-source'
  | 'independently-checked'

export type IndependentVerification =
  | 'none'
  | 'format-checks'
  | 'checked-against-source'
  | 'independently-reviewed'
  | 'documented-independent'

export type Denomination = 'USD' | 'USDC' | 'SOL'

/** Who decided a capital claim's test outcome. Only `vault-program` is authoritative in production. */
export type ClaimOutcomeSource = 'vault-program' | 'demo-deterministic' | 'client-flag'

export interface CapitalClaim {
  /** The testable statement the capital backs, e.g. "Max drawdown stays under 10% for 90 days". */
  description: string
  depositAmount: number
  denomination: Denomination
  commitmentDays: number
  outcome: {
    status: 'passed' | 'failed' | 'pending'
    source: ClaimOutcomeSource
    evaluatedAt?: string
    detail: string
  }
}

export interface TrustInputs {
  /** Average of eligible ratings on a 1–5 scale. */
  averageRating: Maybe<number>
  eligibleRatings: Maybe<number>
  /** Share of feedback records passing integrity checks, percent. */
  integrityPct: Maybe<number>
  /** Share of disputes resolved within the published target, percent. */
  disputesResolvedWithinTargetPct: Maybe<number>
}

export interface ReputationInputs {
  /** Evaluation time (ISO). Passed in so scoring stays deterministic. */
  asOf: string
  dataSource: 'demo' | 'onchain' | 'self-reported'
  performance: {
    sharpe: Maybe<number>
    /** Annualised net return minus benchmark return, in percentage points. */
    excessReturnPp: Maybe<number>
    benchmarkName: string
    /** Daily net-return observations available for statistics. */
    observations: Maybe<number>
    /** Net returns for comparable periods (quarters), as fractions. */
    periodReturns: Maybe<number[]>
    /** Largest single winning trade profit (any currency, same unit as the total). */
    largestWinningTrade: Maybe<number>
    /** Sum of all positive trade profits (same unit). */
    totalPositiveTradeProfit: Maybe<number>
    costCompleteness: Maybe<CostCompleteness>
  }
  risk: {
    maxDrawdownPct: Maybe<number>
    annualizedVolatilityPct: Maybe<number>
    /** Largest single trade loss as % of pre-trade equity. */
    largestTradeLossPct: Maybe<number>
    maxConsecutiveLosses: Maybe<number>
    /** Gross exposure / equity, e.g. 2 = 2x. */
    grossExposureRatio: Maybe<number>
    /** Largest asset/position share of total exposure, percent. */
    largestPositionSharePct: Maybe<number>
  }
  capital: {
    /** null = no capital has been committed (scores 0, not "missing"). */
    claim: CapitalClaim | null
  }
  track: {
    historyDays: Maybe<number>
    /** Observations actually recorded across the history. */
    observationsRecorded: Maybe<number>
    /** Observations expected for the history at the reporting cadence. */
    observationsExpected: Maybe<number>
  }
  consistency: {
    /** Monthly net returns as fractions. */
    monthlyReturns: Maybe<number[]>
  }
  verification: {
    sourceAuthenticity: Maybe<SourceAuthenticity>
    integrityChecksPassed: Maybe<number>
    integrityChecksTotal: Maybe<number>
    independentVerification: Maybe<IndependentVerification>
    lastVerifiedAt: Maybe<string>
    /** Human-readable description of the evidence source. */
    evidenceSource: string
  }
  /** null = no eligible feedback/dispute data exists. */
  trust: TrustInputs | null
}

/* ---------------------------------------------------------------- outputs */

export type Availability = 'available' | 'unavailable' | 'invalid'

export interface ThresholdRow {
  label: string
  score: number
}

export interface SubfactorResult {
  key: string
  label: string
  /** Weight within the parent (factor or composite subfactor). */
  weight: number
  /** Raw input value, if numeric or categorical. */
  input: number | string | null
  inputDisplay: string
  /** 0–100, or null when unavailable/invalid. Never defaulted to 100. */
  score: number | null
  status: Availability
  /** Why the subfactor is unavailable/invalid. */
  reason?: string
  /** Threshold row the input landed in. */
  matchedBand?: string
  /** Full threshold table, for display. */
  table: ThresholdRow[]
  /** Missing essential subfactors make the whole rating UNRATED. */
  essential: boolean
  /** Nested parts for composite subfactors (P3, R3, R4). */
  components?: SubfactorResult[]
}

export interface FactorResult {
  key: FactorKey
  label: string
  weight: number
  formula: string
  /** Factor score 0–100 with unavailable parts contributing 0; null if nothing is available. */
  score: number | null
  /** weight × score, with unavailable factors contributing 0 (never renormalised). */
  contribution: number
  status: 'complete' | 'partial' | 'unavailable'
  subfactors: SubfactorResult[]
  note?: string
}

export interface EligibilityCheck {
  key: string
  label: string
  passed: boolean
  detail: string
}

export interface TierEvaluation {
  tier: TierKey
  minScore: number
  /** Exclusive upper bound (Infinity for the top tier). */
  maxScoreExclusive: number
  scoreQualifies: boolean
  checks: EligibilityCheck[]
  eligible: boolean
}

export type WarningSeverity = 'info' | 'warning' | 'critical'

export interface ReputationWarning {
  code: string
  severity: WarningSeverity
  message: string
}

export type RatingStatus = 'rated' | 'provisional' | 'unrated'

export interface ReputationResult {
  status: RatingStatus
  /** Composite score (1 decimal), null when UNRATED. */
  score: number | null
  /** Highest score attainable given unavailable factors (100 − their weight). */
  maxAttainable: number
  /** Awarded tier after eligibility gates; null when unrated, below Bronze, or no tier's gates pass. */
  tier: TierKey | null
  /** Tier implied by the score alone, before gates. */
  scoreBandTier: TierKey | null
  tierEvaluations: TierEvaluation[]
  factors: FactorResult[]
  warnings: ReputationWarning[]
  /** Labels of essential inputs that are missing or invalid. */
  missingEssential: string[]
  evidenceSource: string
  lastVerifiedAt: string | null
  computedAt: string
  methodologyVersion: string
  dataSource: 'demo' | 'onchain' | 'self-reported'
}
