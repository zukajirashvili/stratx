import { describe, expect, it } from 'vitest'
import { buildDemoStrategies } from '@/data/demo/strategies'
import { EMPTY_FILTERS, queryStrategies, type QueryContext } from '@/lib/strategyQuery'
import { tierClass } from '@/reputation/display'
import { interpretQuery, QUALITATIVE, removeFromQuery } from '@/search/interpret'

const NOW = Date.parse('2026-10-11T12:00:00.000Z')
const strategies = buildDemoStrategies(NOW)
const ctx: QueryContext = { now: NOW, onchainLive: new Set(), watchlist: [], profile: null }

function search(q: string, extra: Partial<QueryContext> = {}) {
  const intent = interpretQuery(q)
  const hits = queryStrategies(strategies, { intent, filters: EMPTY_FILTERS, sort: intent.sort?.key ?? 'reputation', forYou: false }, { ...ctx, ...extra })
  return { intent, hits, ids: hits.map((h) => h.strategy.id) }
}
const labels = (q: string) => interpretQuery(q).criteria.map((c) => c.label)

describe('spec example queries', () => {
  it('"strong risk-adjusted returns and low drawdown"', () => {
    const { intent, hits } = search('Find strategies with strong risk-adjusted returns and low drawdown.')
    expect(labels(intent.raw)).toEqual([`Sharpe ≥ ${QUALITATIVE.strongSharpe}`, `Max drawdown ≤ ${QUALITATIVE.lowDrawdownPct}%`])
    expect(intent.sort?.key).toBe('risk-adjusted')
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) {
      expect(h.strategy.metrics.sharpe).toBeGreaterThanOrEqual(1.5)
      expect(Math.abs(h.strategy.metrics.maxDrawdown)).toBeLessThanOrEqual(0.1)
      expect(h.reasons).toHaveLength(2)
    }
    // Ranked by Sharpe, highest first
    const sharpes = hits.map((h) => h.strategy.metrics.sharpe)
    expect([...sharpes].sort((a, b) => b - a)).toEqual(sharpes)
  })

  it('"verified strategies with a track record longer than one year"', () => {
    const { intent, hits } = search('Show verified strategies with a track record longer than one year.')
    expect(labels(intent.raw)).toEqual(expect.arrayContaining(['Track record ≥ 1 year', 'Verified status (demo labels)']))
    expect(intent.sort?.key).toBe('track-record')
    for (const h of hits) {
      expect(h.strategy.metrics.trackRecordDays).toBeGreaterThanOrEqual(365)
      expect(['attested', 'exchange-linked']).toContain(h.strategy.verification.state)
      expect(h.reasons.join(' ')).toMatch(/demo status/)
    }
  })

  it('"Gold-tier or higher strategies with active Dutch auctions"', () => {
    const { intent, hits } = search('Find Gold-tier or higher strategies with active Dutch auctions.')
    expect(labels(intent.raw)).toEqual(['Gold tier or higher', 'Active auction'])
    for (const h of hits) expect(['gold', 'platinum', 'diamond', 'obsidian']).toContain(tierClass(h.strategy.reputation))
  })

  it('"lower volatility and a long track record"', () => {
    const { intent, hits } = search('Show strategies with lower volatility and a long track record.')
    expect(labels(intent.raw)).toEqual([`Volatility ≤ ${QUALITATIVE.lowVolatilityPct}%`, 'Track record ≥ 2 years'])
    expect(intent.sort?.key).toBe('volatility')
    for (const h of hits) {
      expect(h.strategy.metrics.annualizedVolatility).toBeLessThanOrEqual(0.2)
      expect(h.strategy.metrics.trackRecordDays).toBeGreaterThanOrEqual(730)
    }
  })

  it('"strong Sharpe ratio but warn me about high drawdown" flags rather than filters drawdown', () => {
    const { intent, hits } = search('Find strategies with a strong Sharpe ratio but warn me about high drawdown.')
    expect(intent.criteria.map((c) => [c.kind, c.label])).toEqual([
      ['warn', `Flag max drawdown > ${QUALITATIVE.highDrawdownWarnPct}%`],
      ['filter', `Sharpe ≥ ${QUALITATIVE.strongSharpe}`],
    ])
    for (const h of hits) {
      const dd = Math.abs(h.strategy.metrics.maxDrawdown) * 100
      expect(h.warnings.length > 0).toBe(dd > 20)
    }
  })
})

describe('synonyms and parsing', () => {
  it('treats risk-adjusted synonyms the same', () => {
    for (const q of ['great sharpe', 'excellent risk-adjusted performance', 'high sharpe ratio']) {
      expect(labels(q)).toContain(`Sharpe ≥ ${QUALITATIVE.strongSharpe}`)
    }
  })
  it('parses number words and units for track records', () => {
    expect(labels('more than two years of history')).toEqual(['Track record ≥ 2 years'])
    expect(labels('at least 18 months')).toEqual(['Track record ≥ 18 months'])
    expect(labels('over a year')).toEqual(['Track record ≥ 1 year'])
  })
  it('parses explicit numeric thresholds', () => {
    expect(labels('drawdown under 7.5%')).toEqual(['Max drawdown ≤ 7.5%'])
    expect(labels('sharpe above 2')).toEqual(['Sharpe ≥ 2'])
    expect(labels('volatility below 15%')).toEqual(['Volatility ≤ 15%'])
  })
  it('handles tier lists and "or higher"', () => {
    expect(labels('gold or platinum')).toEqual(['Gold or Platinum tier'])
    expect(labels('at least platinum')).toEqual(['Platinum tier or higher'])
    expect(labels('diamond+')).toEqual(['Diamond tier or higher'])
  })
  it('distinguishes on-chain auctions from any active auction', () => {
    expect(labels('live on-chain auctions')).toEqual(['Live on-chain auction (Devnet)'])
  })
  it('only matches on-chain auctions from the indexed set', () => {
    expect(search('devnet auctions').hits).toHaveLength(0)
    const { ids } = search('devnet auctions', { onchainLive: new Set(['ember-trend-majors']) })
    expect(ids).toEqual(['ember-trend-majors'])
  })
  it('falls back to keyword matching for unrecognised words', () => {
    const { intent, ids } = search('drift')
    expect(intent.terms).toEqual(['drift'])
    expect(ids).toContain('meridian-sol-perp-trend')
  })
  it('removing a chip removes its source text from the query', () => {
    expect(removeFromQuery('strong sharpe and low drawdown', 'low drawdown')).toBe('strong sharpe and')
  })
})

describe('missing fields are reported, never invented', () => {
  it.each([
    ['strategies with high alpha', 'alpha'],
    ['low beta strategies', 'beta'],
    ['lowest management fees', 'fees'],
    ['win rate above 60%', 'win rate'],
    ['AUM over 10m', 'AUM'],
  ])('%s → unsupported %s', (q, term) => {
    const intent = interpretQuery(q)
    expect(intent.unsupported.map((u) => u.term)).toContain(term)
  })
  it('does not turn an unsupported metric into a filter', () => {
    const { intent, hits } = search('high alpha')
    expect(intent.criteria).toHaveLength(0)
    expect(hits).toHaveLength(strategies.length)
  })
  it('a strategy without gross exposure data fails the leverage filter instead of passing', () => {
    const s = structuredClone(strategies[0])
    s.reputationInputs.risk.grossExposureRatio = null
    const crit = interpretQuery('low leverage').criteria[0]
    expect(crit.test(s, ctx)).toEqual({ pass: false, detail: 'Gross exposure not reported' })
  })
})
