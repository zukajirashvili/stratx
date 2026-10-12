import { demoAddress, generateMetrics, type SeriesParams } from '@/data/demo/generator'
import { classifyRisk } from '@/lib/metrics'
import { buildReputationInputs, DEMO_REPUTATION_SPECS } from '@/data/demo/reputationInputs'
import { computeReputation } from '@/reputation/engine'
import type {
  AssetCategory,
  Auction,
  Creator,
  EvidenceItem,
  Strategy,
  StrategyStyle,
  VerificationState,
} from '@/types/strategy'

/**
 * DEMO DATA. Every strategy, creator, performance record and auction below is
 * fabricated for product demonstration. Nothing here is a real track record,
 * a real verification, or a real offer.
 */

const HOUR = 3_600_000

interface DemoSeed {
  id: string
  name: string
  tagline: string
  description: string
  creator: Omit<Creator, 'wallet'> & { walletSeed?: number }
  style: StrategyStyle
  assetCategories: AssetCategory[]
  primaryAssets: string[]
  series: SeriesParams
  verification: {
    state: VerificationState
    method: string
    cadence: 'hourly' | 'daily' | 'weekly'
    updatedHoursAgo: number
  }
  /** Auction timing relative to page load, in hours. */
  auction?: {
    startOffsetH: number
    durationH: number
    askUsd: number
    minOfferUsd: number
    accessTermDays: number
    /** [hours after start, offer USD] */
    offers: [number, number][]
    accepted?: { offerIndex: number; afterH: number }
  }
  disclosed: string[]
  withheld?: string[]
  evidence: EvidenceItem[]
  limitations: string[]
  risks: string[]
  capacityUsd: number
  tags: string[]
}

const DEFAULT_WITHHELD = ['Source code', 'Signal logic & parameters', 'Live positions', 'Order-level fills']

const COMMON_RISKS = [
  'Past performance, simulated or real, does not predict future results.',
  'Strategy access is a licence to signals or execution, not custody of funds. You can lose capital you deploy.',
]

const DEMO_RECORD: EvidenceItem = {
  kind: 'note',
  title: 'Demo record',
  detail:
    'This performance record is synthetic and was generated for demonstration. It is not a real or verified track record.',
}

const SEEDS: DemoSeed[] = [
  {
    id: 'meridian-sol-perp-trend',
    name: 'Meridian Trend',
    tagline: 'Multi-horizon trend following on SOL perpetuals',
    description:
      'Combines three trend horizons (5, 20 and 60 days) on SOL-PERP with volatility-targeted sizing. Flat or short in downtrends; leverage capped at 2x.',
    creator: { displayName: 'Meridian Labs', walletSeed: 11, identityLinked: true, joinedAt: '2023-06-12', strategiesPublished: 3 },
    style: 'trend',
    assetCategories: ['perps', 'sol-ecosystem'],
    primaryAssets: ['SOL-PERP'],
    series: { seed: 318, days: 980, annualReturn: 0.46, annualVol: 0.3, beta: 0.22 },
    verification: { state: 'attested', method: 'Trades settled on-chain; NAV attested daily by the StratX indexer (simulated in demo).', cadence: 'daily', updatedHoursAgo: 3 },
    auction: { startOffsetH: -19, durationH: 48, askUsd: 18000, minOfferUsd: 12000, accessTermDays: 90, offers: [[1, 12500], [5, 14000], [15, 15500]] },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics', 'Venue list', 'Leverage range (0–2x)'],
    evidence: [
      DEMO_RECORD,
      { kind: 'attestation', title: 'Attestation account (simulated)', detail: 'In production, each daily NAV is written to an attestation account signed by the indexer.' },
      { kind: 'record', title: 'Venue', detail: 'Drift Protocol SOL-PERP (demo attribution).' },
    ],
    limitations: ['Single-asset exposure: performance is tied to SOL market regimes.', 'Trend strategies typically underperform in range-bound markets.'],
    risks: ['Perpetual funding costs can erode returns during prolonged trends.', 'Liquidation risk if leverage limits are exceeded during gaps.', ...COMMON_RISKS],
    capacityUsd: 4_000_000,
    tags: ['vol-targeted', 'drift', 'leverage-capped'],
  },
  {
    id: 'basalt-basis-carry',
    name: 'Basalt Basis Carry',
    tagline: 'Cash-and-carry funding capture across SOL, BTC and ETH',
    description:
      'Holds spot long against perp short when annualised funding exceeds a threshold, rotating between SOL, BTC and ETH. Net delta kept within ±3%.',
    creator: { displayName: 'Basalt Capital', walletSeed: 22, identityLinked: true, joinedAt: '2022-11-03', strategiesPublished: 2 },
    style: 'basis',
    assetCategories: ['perps', 'majors', 'stablecoins'],
    primaryAssets: ['SOL', 'BTC', 'ETH', 'USDC'],
    series: { seed: 202, days: 1150, annualReturn: 0.15, annualVol: 0.05, beta: 0.01, shockProb: 0.003, shockSize: 0.012 },
    verification: { state: 'attested', method: 'Spot and perp legs settled on-chain; positions reconciled by the StratX indexer (simulated in demo).', cadence: 'hourly', updatedHoursAgo: 1 },
    auction: { startOffsetH: -50, durationH: 72, askUsd: 15000, minOfferUsd: 10000, accessTermDays: 180, offers: [[2, 12000], [2.25, 14000], [30, 14200]] },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics', 'Venue list', 'Net delta band'],
    evidence: [DEMO_RECORD, { kind: 'record', title: 'Venues', detail: 'Drift, Jupiter Perps and spot via Jupiter aggregator (demo attribution).' }],
    limitations: ['Returns compress when funding rates normalise.', 'Capacity is shared across licence holders.'],
    risks: ['Funding can turn negative for extended periods.', 'Venue or oracle failure can break the hedge.', ...COMMON_RISKS],
    capacityUsd: 12_000_000,
    tags: ['funding', 'carry', 'market-neutral'],
  },
  {
    id: 'halcyon-delta-neutral-lp',
    name: 'Halcyon Neutral LP',
    tagline: 'Hedged concentrated liquidity on SOL/USDC',
    description:
      'Provides concentrated liquidity on SOL/USDC pools and hedges the resulting delta with perps. Rebalances range and hedge on volatility triggers.',
    creator: { displayName: 'Halcyon Quant', walletSeed: 33, identityLinked: true, joinedAt: '2023-09-21', strategiesPublished: 1 },
    style: 'delta-neutral',
    assetCategories: ['defi-yield', 'sol-ecosystem', 'stablecoins'],
    primaryAssets: ['SOL', 'USDC'],
    series: { seed: 38, days: 720, annualReturn: 0.23, annualVol: 0.085, beta: 0.03, shockProb: 0.004, shockSize: 0.018 },
    verification: { state: 'attested', method: 'LP positions and hedges are on-chain accounts; NAV computed by the StratX indexer (simulated in demo).', cadence: 'daily', updatedHoursAgo: 6 },
    auction: { startOffsetH: 6, durationH: 36, askUsd: 9000, minOfferUsd: 6000, accessTermDays: 90, offers: [] },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics', 'Pool list', 'Hedge ratio band'],
    evidence: [DEMO_RECORD, { kind: 'audit', title: 'Range logic review (demo)', detail: 'Illustrative example of a third-party review entry. No review has taken place.' }],
    limitations: ['Hedge rebalancing incurs costs that rise with volatility.', 'Pool incentives may change without notice.'],
    risks: ['Impermanent loss is only partially hedged in fast moves.', 'Smart-contract risk in the underlying pools.', ...COMMON_RISKS],
    capacityUsd: 2_500_000,
    tags: ['clmm', 'orca', 'hedged'],
  },
  {
    id: 'kestrel-mean-reversion',
    name: 'Kestrel Mean Reversion',
    tagline: 'Intraday mean reversion on SOL, BTC and ETH',
    description:
      'Fades short-term dislocations from a volume-weighted fair value with tight stops. Typical holding period is under 8 hours.',
    creator: { displayName: 'Kestrel', walletSeed: 44, identityLinked: false, joinedAt: '2024-01-15', strategiesPublished: 1 },
    style: 'mean-reversion',
    assetCategories: ['majors', 'sol-ecosystem'],
    primaryAssets: ['SOL', 'BTC', 'ETH'],
    series: { seed: 367, days: 640, annualReturn: 0.29, annualVol: 0.2, beta: 0.05, shockProb: 0.006, shockSize: 0.03 },
    verification: { state: 'exchange-linked', method: 'Read-only exchange API keys reconciled daily (simulated in demo).', cadence: 'daily', updatedHoursAgo: 14 },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics', 'Holding-period distribution'],
    evidence: [DEMO_RECORD],
    limitations: ['Sensitive to execution latency and fees.', 'Has not been tested through a full bear market.'],
    risks: ['Mean-reversion strategies can suffer outsized losses during regime shifts.', ...COMMON_RISKS],
    capacityUsd: 1_500_000,
    tags: ['intraday', 'vwap', 'high-turnover'],
  },
  {
    id: 'jitoflow-market-making',
    name: 'JitoFlow MM',
    tagline: 'Passive market making on SOL-ecosystem order books',
    description:
      'Quotes two-sided markets on liquid SOL-ecosystem pairs with inventory skew and adverse-selection filters. Inventory flattened daily.',
    creator: { displayName: 'Tidepool Systems', walletSeed: 55, identityLinked: true, joinedAt: '2024-03-02', strategiesPublished: 2 },
    style: 'market-making',
    assetCategories: ['sol-ecosystem'],
    primaryAssets: ['SOL', 'JUP', 'JTO', 'PYTH'],
    series: { seed: 505, days: 410, annualReturn: 0.36, annualVol: 0.13, beta: 0.04, shockProb: 0.004, shockSize: 0.02 },
    verification: { state: 'attested', method: 'Fills read from on-chain order-book accounts (simulated in demo).', cadence: 'hourly', updatedHoursAgo: 1 },
    auction: { startOffsetH: -3, durationH: 24, askUsd: 6000, minOfferUsd: 4000, accessTermDays: 60, offers: [[0.5, 4200], [2, 5100]] },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics', 'Pair list'],
    evidence: [DEMO_RECORD, { kind: 'record', title: 'Venues', detail: 'Phoenix and OpenBook v2 (demo attribution).' }],
    limitations: ['Short track record (~14 months).', 'Performance depends on maintaining queue priority.'],
    risks: ['Inventory losses during sharp one-directional moves.', 'Venue outages can leave stale quotes.', ...COMMON_RISKS],
    capacityUsd: 800_000,
    tags: ['phoenix', 'openbook', 'inventory-skew'],
  },
  {
    id: 'northwind-cross-asset-momentum',
    name: 'Northwind Momentum',
    tagline: 'Cross-sectional momentum across large-cap crypto',
    description:
      'Ranks the top 20 liquid assets by risk-adjusted 30-day momentum and holds the top quintile, rebalanced weekly. Long-only with a cash filter.',
    creator: { displayName: 'Northwind Research', identityLinked: false, joinedAt: '2022-08-30', strategiesPublished: 4 },
    style: 'momentum',
    assetCategories: ['majors', 'sol-ecosystem'],
    primaryAssets: ['BTC', 'ETH', 'SOL', '+17'],
    series: { seed: 45, days: 1240, annualReturn: 0.44, annualVol: 0.48, beta: 0.55, shockProb: 0.004, shockSize: 0.06 },
    verification: { state: 'self-reported', method: 'Creator-submitted CSV of daily NAV; not independently reconciled.', cadence: 'weekly', updatedHoursAgo: 70 },
    auction: { startOffsetH: -96, durationH: 48, askUsd: 10000, minOfferUsd: 5000, accessTermDays: 90, offers: [[3, 6000], [10, 7500]], accepted: { offerIndex: 1, afterH: 12 } },
    disclosed: ['Weekly NAV series', 'Aggregate risk metrics', 'Universe definition'],
    evidence: [DEMO_RECORD, { kind: 'note', title: 'Self-reported', detail: 'Records are supplied by the creator and have not been reconciled against any venue.' }],
    limitations: ['Self-reported data has not been independently verified.', 'Weekly reporting hides intra-week drawdowns.'],
    risks: ['High correlation to the overall crypto market.', 'Momentum crashes can be sudden and severe.', ...COMMON_RISKS],
    capacityUsd: 20_000_000,
    tags: ['long-only', 'weekly-rebalance', 'cross-sectional'],
  },
  {
    id: 'pulse-memecoin-momentum',
    name: 'Pulse Meme Momentum',
    tagline: 'Short-horizon momentum on newly liquid memecoins',
    description:
      'Enters memecoins that cross liquidity and holder-distribution thresholds after launch, with hard time stops. Extremely volatile by design.',
    creator: { displayName: 'pulse.sol', walletSeed: 77, identityLinked: false, joinedAt: '2025-02-10', strategiesPublished: 1 },
    style: 'momentum',
    assetCategories: ['memecoins', 'sol-ecosystem'],
    primaryAssets: ['Various SPL tokens'],
    series: { seed: 157, days: 210, annualReturn: 1.4, annualVol: 0.9, beta: 0.6, shockProb: 0.012, shockSize: 0.09 },
    verification: { state: 'self-reported', method: 'Creator-submitted wallet history; wallet ownership not yet attested.', cadence: 'daily', updatedHoursAgo: 30 },
    auction: { startOffsetH: -8, durationH: 24, askUsd: 1800, minOfferUsd: 500, accessTermDays: 30, offers: [[1, 600], [4, 750], [6, 900]] },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics'],
    evidence: [DEMO_RECORD],
    limitations: ['Under 7 months of history.', 'Results are highly path-dependent and may not repeat.'],
    risks: ['Rug pulls and liquidity disappearance.', 'Losses of 50%+ are plausible.', ...COMMON_RISKS],
    capacityUsd: 150_000,
    tags: ['memecoins', 'launch', 'time-stops'],
  },
  {
    id: 'atlas-stat-arb-pairs',
    name: 'Atlas Pairs',
    tagline: 'Cointegration-based pairs trading on liquid SPL tokens',
    description:
      'Trades spreads between cointegrated SOL-ecosystem token pairs, re-estimating hedge ratios weekly. Market neutral with gross exposure ≤ 3x.',
    creator: { displayName: 'Atlas Quant Collective', walletSeed: 88, identityLinked: true, joinedAt: '2023-02-18', strategiesPublished: 2 },
    style: 'stat-arb',
    assetCategories: ['sol-ecosystem', 'majors'],
    primaryAssets: ['SOL', 'JUP', 'RAY', 'ETH'],
    series: { seed: 808, days: 860, annualReturn: 0.18, annualVol: 0.075, beta: 0.0, shockProb: 0.003, shockSize: 0.015 },
    verification: { state: 'exchange-linked', method: 'Read-only exchange API keys reconciled daily (simulated in demo).', cadence: 'daily', updatedHoursAgo: 9 },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics', 'Gross exposure range'],
    evidence: [DEMO_RECORD],
    limitations: ['Cointegration relationships can break permanently.'],
    risks: ['Spread divergence can exceed historical ranges.', ...COMMON_RISKS],
    capacityUsd: 3_000_000,
    tags: ['pairs', 'cointegration', 'market-neutral'],
  },
  {
    id: 'corsair-funding-harvester',
    name: 'Corsair Funding',
    tagline: 'Opportunistic funding-rate capture on SOL perps',
    description:
      'Takes the side receiving funding on SOL perps when rates are extreme, hedged with spot. Sits in USDC lending between opportunities.',
    creator: { displayName: 'Corsair', walletSeed: 99, identityLinked: false, joinedAt: '2025-05-04', strategiesPublished: 1 },
    style: 'basis',
    assetCategories: ['perps', 'stablecoins', 'sol-ecosystem'],
    primaryAssets: ['SOL-PERP', 'USDC'],
    series: { seed: 909, days: 300, annualReturn: 0.13, annualVol: 0.04, beta: 0.0, shockProb: 0.002, shockSize: 0.01 },
    verification: { state: 'pending', method: 'Wallet linked; first reconciliation in progress (simulated in demo).', cadence: 'daily', updatedHoursAgo: 20 },
    auction: { startOffsetH: 30, durationH: 48, askUsd: 5000, minOfferUsd: 3000, accessTermDays: 90, offers: [] },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics'],
    evidence: [DEMO_RECORD, { kind: 'note', title: 'Verification pending', detail: 'Reconciliation has not completed; treat metrics as unverified.' }],
    limitations: ['Under 1 year of history.', 'Verification not yet complete.'],
    risks: ['Single-venue dependency.', ...COMMON_RISKS],
    capacityUsd: 1_000_000,
    tags: ['funding', 'usdc-lending'],
  },
  {
    id: 'ember-trend-majors',
    name: 'Ember Trend',
    tagline: 'Breakout trend following on BTC and ETH perps',
    description:
      'Donchian-style breakouts on BTC and ETH perps with ATR-based stops and a portfolio volatility cap.',
    creator: { displayName: 'Meridian Labs', walletSeed: 11, identityLinked: true, joinedAt: '2023-06-12', strategiesPublished: 3 },
    style: 'trend',
    assetCategories: ['majors', 'perps'],
    primaryAssets: ['BTC-PERP', 'ETH-PERP'],
    series: { seed: 269, days: 540, annualReturn: 0.27, annualVol: 0.26, beta: 0.15, shockProb: 0.003, shockSize: 0.03 },
    verification: { state: 'exchange-linked', method: 'Read-only exchange API keys reconciled daily (simulated in demo).', cadence: 'daily', updatedHoursAgo: 11 },
    auction: { startOffsetH: -60, durationH: 36, askUsd: 8000, minOfferUsd: 5000, accessTermDays: 90, offers: [[4, 5200]] },
    disclosed: ['Daily NAV series', 'Aggregate risk metrics', 'Venue list'],
    evidence: [DEMO_RECORD],
    limitations: ['Breakout systems have long flat periods.'],
    risks: ['Whipsaw losses in choppy markets.', ...COMMON_RISKS],
    capacityUsd: 15_000_000,
    tags: ['breakout', 'atr-stops'],
  },
]

export function buildDemoStrategies(now: number): Strategy[] {
  return SEEDS.map((seed) => {
    const metrics = generateMetrics(seed.series)
    const reputationInputs = buildReputationInputs(DEMO_REPUTATION_SPECS[seed.id], metrics, now)
    const reputation = computeReputation(reputationInputs)
    const verification = {
      state: seed.verification.state,
      method: seed.verification.method,
      reportingCadence: seed.verification.cadence,
      lastUpdatedAt: new Date(now - seed.verification.updatedHoursAgo * HOUR).toISOString(),
      // Single source of truth with the reputation engine's evidence date.
      lastVerifiedAt: reputationInputs.verification.lastVerifiedAt!,
      attestationRef: seed.verification.state === 'attested' ? demoAddress(seed.series.seed + 5000) : undefined,
      source: 'demo' as const,
    }

    let auction: Auction | null = null
    if (seed.auction) {
      const a = seed.auction
      const start = now + a.startOffsetH * HOUR
      auction = {
        id: `auc-${seed.id}`,
        strategyId: seed.id,
        kind: 'offer',
        currency: 'USDC',
        askPrice: a.askUsd,
        minOffer: a.minOfferUsd,
        startTime: new Date(start).toISOString(),
        endTime: new Date(start + a.durationH * HOUR).toISOString(),
        accessTermDays: a.accessTermDays,
        offers: a.offers.map(([h, usd], i) => ({
          bidder: `Investor ${String.fromCharCode(65 + ((seed.series.seed + i * 7) % 26))}${(seed.series.seed * 31 + i * 13) % 90 + 10}`,
          amount: usd,
          placedAt: new Date(start + h * HOUR).toISOString(),
        })),
        accepted: a.accepted ? { offerIndex: a.accepted.offerIndex, at: new Date(start + a.accepted.afterH * HOUR).toISOString() } : null,
        source: 'demo',
      }
    }

    const { walletSeed, ...creator } = seed.creator
    return {
      id: seed.id,
      name: seed.name,
      tagline: seed.tagline,
      description: seed.description,
      creator: { ...creator, wallet: walletSeed ? demoAddress(walletSeed) : undefined },
      style: seed.style,
      assetCategories: seed.assetCategories,
      primaryAssets: seed.primaryAssets,
      riskLevel: classifyRisk(metrics),
      metrics,
      reputationInputs,
      reputation,
      verification,
      auction,
      disclosure: { disclosed: seed.disclosed, withheld: seed.withheld ?? DEFAULT_WITHHELD },
      evidence: seed.evidence,
      limitations: seed.limitations,
      risks: seed.risks,
      capacityUsd: seed.capacityUsd,
      tags: seed.tags,
      source: 'demo',
    }
  })
}
