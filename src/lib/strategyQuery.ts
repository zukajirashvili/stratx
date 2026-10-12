import { getAuctionSnapshot } from '@/lib/auction'
import { reputationRank, tierAtLeast, tierClass, type TierClass } from '@/reputation/display'
import { searchableText } from '@/search/interpret'
import type { SearchContext, SearchHit, SearchIntent, SearchSortKey } from '@/search/types'
import type { AssetCategory, AuctionStatus, ReputationTier, RiskLevel, Strategy } from '@/types/strategy'

export type AuctionFilter = AuctionStatus | 'none'

export type SortKey = SearchSortKey

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'reputation', label: 'Reputation score' },
  { key: 'risk-adjusted', label: 'Risk-adjusted return (Sharpe)' },
  { key: 'drawdown', label: 'Smallest max drawdown' },
  { key: 'volatility', label: 'Lowest volatility' },
  { key: 'cagr', label: 'Highest CAGR' },
  { key: 'track-record', label: 'Longest track record' },
  { key: 'auction-price', label: 'Lowest asking price' },
]

export interface ExploreFilters {
  tiers: TierClass[]
  risk: RiskLevel[]
  assets: AssetCategory[]
  auction: AuctionFilter[]
  watchlistOnly: boolean
}

export const EMPTY_FILTERS: ExploreFilters = {
  tiers: [],
  risk: [],
  assets: [],
  auction: [],
  watchlistOnly: false,
}

/** Investor profile constraints applied by the "For you" toggle. */
export interface ProfileConstraints {
  maxRisk: RiskLevel
  assets: AssetCategory[]
  minTier: ReputationTier
}

export interface QueryContext extends SearchContext {
  watchlist: string[]
  profile: ProfileConstraints | null
}

/** Demo-auction status, upgraded to "active" when a live on-chain auction exists. */
export function auctionStatusOf(strategy: Strategy, now: number, onchainLive?: ReadonlySet<string>): AuctionFilter {
  if (onchainLive?.has(strategy.id)) return 'active'
  return strategy.auction ? getAuctionSnapshot(strategy.auction, now).status : 'none'
}

const RISK_RANK: Record<RiskLevel, number> = { low: 0, moderate: 1, high: 2 }

function matchesFilters(s: Strategy, f: ExploreFilters, ctx: QueryContext) {
  if (f.tiers.length && !f.tiers.includes(tierClass(s.reputation))) return false
  if (f.risk.length && !f.risk.includes(s.riskLevel)) return false
  if (f.assets.length && !f.assets.some((a) => s.assetCategories.includes(a))) return false
  if (f.auction.length && !f.auction.includes(auctionStatusOf(s, ctx.now, ctx.onchainLive))) return false
  if (f.watchlistOnly && !ctx.watchlist.includes(s.id)) return false
  return true
}

function matchesProfile(s: Strategy, p: ProfileConstraints) {
  if (RISK_RANK[s.riskLevel] > RISK_RANK[p.maxRisk]) return false
  if (!tierAtLeast(s.reputation, p.minTier)) return false
  if (p.assets.length && !p.assets.some((a) => s.assetCategories.includes(a))) return false
  return true
}

function sortValue(s: Strategy, key: SortKey, ctx: QueryContext): number {
  switch (key) {
    case 'reputation':
      return -reputationRank(s.reputation)
    case 'risk-adjusted':
      return -s.metrics.sharpe
    case 'drawdown':
      return Math.abs(s.metrics.maxDrawdown)
    case 'volatility':
      return s.metrics.annualizedVolatility
    case 'cagr':
      return -s.metrics.cagr
    case 'track-record':
      return -s.metrics.trackRecordDays
    case 'auction-price': {
      // Asking price of a live on-chain auction, else of an open demo auction; closed/none sort last.
      const onchain = ctx.onchainAskUsd?.get(s.id)
      if (onchain !== undefined) return onchain
      if (!s.auction) return Number.POSITIVE_INFINITY
      const snap = getAuctionSnapshot(s.auction, ctx.now)
      if (snap.status === 'active') return s.auction.askPrice
      if (snap.status === 'upcoming') return 1e12 + s.auction.askPrice
      return 1e13 + s.auction.askPrice
    }
  }
}

/** Applies an interpreted query plus explicit filters, returning hits with reasons. */
export function queryStrategies(
  strategies: Strategy[],
  opts: { intent: SearchIntent; filters: ExploreFilters; sort: SortKey; forYou: boolean },
  ctx: QueryContext,
): SearchHit[] {
  const hits: SearchHit[] = []
  for (const s of strategies) {
    if (!matchesFilters(s, opts.filters, ctx)) continue
    if (opts.forYou && ctx.profile && !matchesProfile(s, ctx.profile)) continue

    const reasons: string[] = []
    const warnings: string[] = []
    let ok = true
    for (const c of opts.intent.criteria) {
      const r = c.test(s, ctx)
      if (c.kind === 'filter') {
        if (!r.pass) {
          ok = false
          break
        }
        reasons.push(r.detail)
      } else if (r.pass) {
        warnings.push(r.detail)
      }
    }
    if (!ok) continue

    let matchedTerms: string[] = []
    if (opts.intent.terms.length) {
      const text = searchableText(s)
      matchedTerms = opts.intent.terms.filter((t) => text.includes(t))
      if (!matchedTerms.length) continue
    }
    hits.push({ strategy: s, reasons, warnings, matchedTerms })
  }

  return hits.sort(
    (a, b) =>
      sortValue(a.strategy, opts.sort, ctx) - sortValue(b.strategy, opts.sort, ctx) ||
      reputationRank(b.strategy.reputation) - reputationRank(a.strategy.reputation),
  )
}

export function countActiveFilters(f: ExploreFilters) {
  return f.tiers.length + f.risk.length + f.assets.length + f.auction.length + (f.watchlistOnly ? 1 : 0)
}
