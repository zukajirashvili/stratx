import { describe, expect, it } from 'vitest'
import { analyzeNavCsv, exampleNavCsv, MIN_POINTS } from '@/creator/analyze'
import { creatorRecordToStrategy, newStrategyId } from '@/creator/toStrategy'
import type { CreatorStrategyRecord } from '@/creator/types'
import { tierClass } from '@/reputation/display'

const rows = (n: number, start = Date.UTC(2025, 0, 1)) =>
  ['date,nav', ...Array.from({ length: n }, (_, i) => `${new Date(start + i * 86_400_000).toISOString().slice(0, 10)},${(10_000 * (1 + 0.001 * i)).toFixed(2)}`)].join('\n')

function record(navCsv: string): CreatorStrategyRecord {
  return {
    id: 'q-test-abc12',
    name: 'Test Strategy',
    tagline: 'A test',
    description: '',
    style: 'trend',
    assetCategories: ['sol-ecosystem'],
    primaryAssets: ['SOL'],
    disclosed: ['Daily NAV series'],
    costCompleteness: 'major-included',
    capacityUsd: null,
    navCsv,
    isExampleData: false,
    creatorName: 'Quant',
    ownerWallet: null,
    createdAt: '2026-10-11T00:00:00.000Z',
  }
}

describe('NAV file analysis', () => {
  it('parses a clean file and computes metrics from it', () => {
    const a = analyzeNavCsv(rows(120))
    expect(a.rows).toBe(120)
    expect(a.passed).toBe(120)
    expect(a.issues).toHaveLength(0)
    expect(a.metrics?.trackRecordDays).toBe(119)
    expect(a.metrics!.totalReturn).toBeCloseTo(0.119, 6)
  })
  it('flags bad dates, non-positive values, duplicates, ordering and gaps', () => {
    const text = ['date,nav', '2025-01-01,100', '2025-01-02,101', 'oops,102', '2025-01-03,-5', '2025-01-02,103', '2025-01-20,104'].join('\n')
    const a = analyzeNavCsv(text)
    expect(a.rows).toBe(6)
    expect(a.issues.map((i) => i.message)).toEqual([
      'Date must be YYYY-MM-DD',
      'NAV must be a positive number',
      'Duplicate date 2025-01-02',
      'Gap of more than 7 days before 2025-01-20',
    ])
    expect(a.metrics).toBeNull()
    expect(a.blocker).toMatch(String(MIN_POINTS))
  })
  it('needs at least the minimum number of rows', () => {
    expect(analyzeNavCsv(rows(MIN_POINTS - 1)).metrics).toBeNull()
    expect(analyzeNavCsv(rows(MIN_POINTS)).metrics).not.toBeNull()
  })
})

describe('quant strategy → app strategy', () => {
  it('is analysed by the reputation engine as SELF-REPORTED, never verified', () => {
    const s = creatorRecordToStrategy(record(exampleNavCsv()))!
    expect(s.source).toBe('self-reported')
    expect(s.reputation.dataSource).toBe('self-reported')
    expect(s.reputation.warnings.some((w) => w.code === 'data.selfReported')).toBe(true)
    // Unauthenticated source fails the Gold+ source gate.
    expect(['gold', 'platinum', 'diamond', 'obsidian']).not.toContain(tierClass(s.reputation))
    // Unknown trade-level data stays unknown (scored 0, not invented).
    const P3 = s.reputation.factors.find((f) => f.key === 'P')!.subfactors.find((x) => x.key === 'P3')!
    expect(P3.components!.find((c) => c.key === 'P3.G')!.status).toBe('unavailable')
  })
  it('returns null when there is not enough data', () => {
    expect(creatorRecordToStrategy(record(rows(5)))).toBeNull()
  })
  it('generates ids that fit the 32-byte on-chain field', () => {
    for (const n of ['A', 'A very very long strategy name that keeps going', '***']) {
      expect(new TextEncoder().encode(newStrategyId(n)).length).toBeLessThanOrEqual(32)
    }
  })
})
