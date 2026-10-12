import { describe, expect, it } from 'vitest'
import { FACTOR_ORDER, FACTOR_WEIGHTS, SUBFACTOR_WEIGHTS, TABLES, TIER_GATES } from '@/reputation/config'

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 1e9) / 1e9

describe('reputation configuration integrity', () => {
  it('seven factor weights sum to 100%', () => {
    expect(FACTOR_ORDER).toHaveLength(7)
    expect(sum(Object.values(FACTOR_WEIGHTS))).toBe(1)
    expect(FACTOR_WEIGHTS).toEqual({ P: 0.25, R: 0.2, C: 0.15, T: 0.15, K: 0.1, V: 0.1, U: 0.05 })
  })

  it('every subfactor weight group sums to 100%', () => {
    for (const [group, weights] of Object.entries(SUBFACTOR_WEIGHTS)) {
      expect(sum(Object.values(weights)), group).toBe(1)
    }
  })

  it('every numeric table ends with an unbounded band', () => {
    for (const [name, t] of Object.entries(TABLES)) {
      expect(t.bands.at(-1)!.upTo, name).toBe(Infinity)
    }
  })

  it('six tiers with contiguous, specified score ranges and minimum history', () => {
    expect(TIER_GATES.map((g) => [g.tier, g.minScore, g.maxScoreExclusive, g.minHistoryDays])).toEqual([
      ['bronze', 40, 55, 30],
      ['silver', 55, 65, 90],
      ['gold', 65, 75, 180],
      ['platinum', 75, 85, 365],
      ['diamond', 85, 93, 730],
      ['obsidian', 93, Infinity, 1095],
    ])
    for (let i = 1; i < TIER_GATES.length; i++) expect(TIER_GATES[i].minScore).toBe(TIER_GATES[i - 1].maxScoreExclusive)
  })
})
