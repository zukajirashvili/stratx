import { describe, expect, it } from 'vitest'
import { buildDemoStrategies } from '@/data/demo/strategies'
import { tierClass } from '@/reputation/display'

const NOW = Date.parse('2026-10-11T12:00:00.000Z')
const strategies = buildDemoStrategies(NOW)
const byId = Object.fromEntries(strategies.map((s) => [s.id, s]))

describe('demo strategies exercise the reputation engine', () => {
  it('builds all ten demo strategies', () => {
    expect(strategies).toHaveLength(10)
  })

  it('labels every result as demo data', () => {
    for (const s of strategies) {
      expect(s.reputation.dataSource).toBe('demo')
      expect(s.reputation.warnings.some((w) => w.code === 'data.demo')).toBe(true)
    }
  })

  it('never shows Participant Trust as available in the MVP', () => {
    for (const s of strategies) expect(s.reputation.factors.find((f) => f.key === 'U')!.status).toBe('unavailable')
  })

  it('includes an UNRATED strategy (missing integrity checks)', () => {
    expect(byId['corsair-funding-harvester'].reputation.status).toBe('unrated')
  })

  it('includes a failed capital claim with C = 0', () => {
    const r = byId['northwind-cross-asset-momentum'].reputation
    expect(r.factors.find((f) => f.key === 'C')!.score).toBe(0)
    expect(r.warnings.some((w) => w.code === 'capital.failed')).toBe(true)
  })

  it('includes a pending capital claim', () => {
    expect(byId['kestrel-mean-reversion'].reputation.warnings.some((w) => w.code === 'capital.pending')).toBe(true)
  })

  it('includes a strategy below Bronze', () => {
    expect(tierClass(byId['pulse-memecoin-momentum'].reputation)).toBe('below-bronze')
  })

  it('includes a tier downgraded by eligibility gates', () => {
    const r = byId['jitoflow-market-making'].reputation
    expect(r.scoreBandTier).toBe('diamond') // score qualifies for Diamond…
    expect(r.tier).toBe('platinum') // …but 410 days of history fails Diamond's 730-day gate
    expect(r.warnings.some((w) => w.code === 'tier.downgraded')).toBe(true)
  })

  it('spans several tiers', () => {
    const tiers = new Set(strategies.map((s) => tierClass(s.reputation)))
    expect(tiers.size).toBeGreaterThanOrEqual(5)
  })
})
