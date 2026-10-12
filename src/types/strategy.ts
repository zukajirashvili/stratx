/**
 * StratX domain model.
 *
 * These types describe what the UI renders. They are intentionally independent
 * of where the data comes from: today a demo repository fills them, later an
 * on-chain account reader + verified performance indexer will.
 */

import type { ReputationInputs, ReputationResult, TierKey } from '@/reputation/types'

/** Where a record came from. Anything other than `onchain` must never be presented as verified. */
export type DataSource = 'demo' | 'onchain' | 'self-reported'

export type ReputationTier = TierKey

export type RiskLevel = 'low' | 'moderate' | 'high'

export type AssetCategory =
  | 'sol-ecosystem'
  | 'majors'
  | 'perps'
  | 'defi-yield'
  | 'memecoins'
  | 'stablecoins'

export type StrategyStyle =
  | 'trend'
  | 'mean-reversion'
  | 'market-making'
  | 'basis'
  | 'stat-arb'
  | 'momentum'
  | 'delta-neutral'

export interface Creator {
  displayName: string
  /** Public wallet address, when the creator has chosen to disclose it. */
  wallet?: string
  /** Whether the creator has linked an identity attestation (e.g. Solana Attestation Service). */
  identityLinked: boolean
  joinedAt: string
  strategiesPublished: number
}

export interface PerformancePoint {
  /** ISO date (YYYY-MM-DD). */
  date: string
  /** Net asset value, normalised to 100 at inception. */
  equity: number
  /** Drawdown from running peak, as a negative fraction (-0.12 = -12%). */
  drawdown: number
  /** Benchmark (SOL buy-and-hold) normalised to 100 at inception. */
  benchmark: number
}

export type PeriodKey = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ITD'

export interface PeriodReturn {
  key: PeriodKey
  label: string
  /** Fractional return; null when history is too short for the period. */
  value: number | null
  benchmark: number | null
}

export interface MonthlyReturn {
  year: number
  /** 0-11 */
  month: number
  value: number
}

export interface StrategyMetrics {
  totalReturn: number
  cagr: number
  annualizedVolatility: number
  sharpe: number
  sortino: number
  calmar: number
  /** Negative fraction. */
  maxDrawdown: number
  maxDrawdownDurationDays: number
  positiveDaysRatio: number
  bestMonth: number
  worstMonth: number
  trackRecordDays: number
  inceptionDate: string
  periodReturns: PeriodReturn[]
  monthlyReturns: MonthlyReturn[]
  series: PerformancePoint[]
}

export type VerificationState = 'attested' | 'exchange-linked' | 'self-reported' | 'pending'

export interface VerificationStatus {
  state: VerificationState
  /** Human-readable description of how records are (or would be) verified. */
  method: string
  lastVerifiedAt: string
  /** When the performance record was last updated. */
  lastUpdatedAt: string
  reportingCadence: 'hourly' | 'daily' | 'weekly'
  /** Reference to an attestation account, when one exists. */
  attestationRef?: string
  source: DataSource
}

export type AuctionStatus = 'upcoming' | 'active' | 'ended'

/** A simulated investor offer on a DEMO auction (never real money). */
export interface DemoOffer {
  /** Display label for the (fictional) investor. */
  bidder: string
  /** USD / USDC. */
  amount: number
  /** ISO time the offer appears. */
  placedAt: string
}

/**
 * Offer auction: the quant sets an asking price and a minimum offer;
 * investors make offers; the quant accepts the one they like.
 * Demo auctions are simulations — real ones are on-chain listings.
 */
export interface Auction {
  id: string
  strategyId: string
  kind: 'offer'
  currency: 'USDC'
  askPrice: number
  minOffer: number
  /** ISO timestamps. */
  startTime: string
  endTime: string
  /** Length of the access licence granted to the accepted investor. */
  accessTermDays: number
  offers: DemoOffer[]
  /** When the quant accepted an offer in the simulation. */
  accepted: { offerIndex: number; at: string } | null
  source: DataSource
}

/** Auction state resolved against a specific moment in time. */
export interface AuctionSnapshot {
  status: AuctionStatus
  /** True when an offer was accepted (status is then 'ended'). */
  sold: boolean
  /** Highest visible offer (or the accepted amount when sold). */
  bestOffer: number | null
  /** Offers placed so far. */
  visibleOffers: DemoOffer[]
  /** ms until start (upcoming) or end (active); 0 when ended. */
  msRemaining: number
}

export interface Disclosure {
  /** Items the creator has authorised StratX to display. */
  disclosed: string[]
  /** Items that stay private (source code, signals, live positions…). */
  withheld: string[]
}

export interface EvidenceItem {
  kind: 'record' | 'attestation' | 'audit' | 'note'
  title: string
  detail: string
}

export interface Strategy {
  /** Stable identifier used in URLs and (later) as the on-chain account seed. */
  id: string
  name: string
  tagline: string
  description: string
  creator: Creator
  style: StrategyStyle
  assetCategories: AssetCategory[]
  primaryAssets: string[]
  riskLevel: RiskLevel
  metrics: StrategyMetrics
  /** Inputs fed to the reputation engine (kept so results can be audited/re-computed). */
  reputationInputs: ReputationInputs
  /** Output of the StratX Reputation Engine (src/reputation). */
  reputation: ReputationResult
  verification: VerificationStatus
  auction: Auction | null
  disclosure: Disclosure
  evidence: EvidenceItem[]
  limitations: string[]
  risks: string[]
  /** Creator-estimated capacity before performance degrades, in USD. */
  capacityUsd: number
  tags: string[]
  source: DataSource
}
