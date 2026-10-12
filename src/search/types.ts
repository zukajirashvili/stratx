import type { Strategy } from '@/types/strategy'

/**
 * Natural-language investor search — structured intent model.
 *
 * A query is interpreted into explicit, inspectable pieces:
 *   - criteria: filters ("Sharpe ≥ 1.5") or warnings ("flag max drawdown > 20%")
 *   - sort: the ranking the query asked for ("lowest drawdown first")
 *   - unsupported: metrics the user asked about that the data model doesn't have
 *   - terms: leftover keywords matched against names/descriptions/tags
 * Every result carries the criteria it satisfied (with the actual values), so
 * users can see exactly why it appeared. Nothing is inferred or fabricated.
 */

export type SearchSortKey =
  | 'reputation'
  | 'risk-adjusted'
  | 'drawdown'
  | 'volatility'
  | 'cagr'
  | 'track-record'
  | 'auction-price'

export interface SearchContext {
  now: number
  /** Strategy ids with a LIVE on-chain (Devnet) auction, from indexed program accounts. */
  onchainLive: ReadonlySet<string>
  /** Asking price (USD) of each live on-chain auction, by strategy id. */
  onchainAskUsd?: ReadonlyMap<string, number>
}

export interface CriterionCheck {
  pass: boolean
  /** Human-readable evidence using the record's actual value, e.g. "Sharpe 2.42 ≥ 1.50". */
  detail: string
}

export interface Criterion {
  id: string
  label: string
  /** Exact substring of the query this came from (lets the UI remove it). */
  source: string
  /** `filter` excludes non-matching strategies; `warn` keeps them but flags them. */
  kind: 'filter' | 'warn'
  test: (s: Strategy, ctx: SearchContext) => CriterionCheck
}

export interface SortIntent {
  key: SearchSortKey
  label: string
  source: string
}

export interface UnsupportedRequest {
  term: string
  message: string
}

export interface SearchIntent {
  raw: string
  criteria: Criterion[]
  sort: SortIntent | null
  unsupported: UnsupportedRequest[]
  terms: string[]
}

export interface SearchHit {
  strategy: Strategy
  /** Details of every filter criterion the strategy satisfied. */
  reasons: string[]
  /** Warning criteria that fired for this strategy. */
  warnings: string[]
  /** Keywords from the query found in the record. */
  matchedTerms: string[]
}
