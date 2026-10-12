/**
 * How a quant's strategy is analysed.
 *
 * 1. The quant uploads a daily NAV file (CSV: `date,nav`). NAV = net asset
 *    value after fees, any starting value (e.g. 100 or 10000).
 * 2. Every row is checked: valid ISO date, positive finite number, dates in
 *    increasing order, no duplicate dates, no gap longer than 7 days. The
 *    pass rate feeds the reputation engine's record-integrity factor (V2).
 * 3. Valid rows become a NAV series → returns, volatility, Sharpe, Sortino,
 *    drawdown, monthly/quarterly returns (src/lib/metrics.ts).
 * 4. The reputation engine scores the result with the uploaded file treated
 *    as an UNAUTHENTICATED source (self-reported), so scores are capped by
 *    the verification gates until on-chain/exchange verification exists.
 */
import { computeMetrics, withDrawdowns } from '@/lib/metrics'
import type { PerformancePoint, StrategyMetrics } from '@/types/strategy'

export interface NavRowIssue {
  line: number
  message: string
}

export interface NavAnalysis {
  rows: number
  passed: number
  issues: NavRowIssue[]
  /** Valid points used for metrics (sorted, de-duplicated). */
  points: { date: string; nav: number }[]
  metrics: StrategyMetrics | null
  /** Why metrics could not be computed, if they couldn't. */
  blocker: string | null
}

export const MIN_POINTS = 30
const MAX_GAP_DAYS = 7
const DAY = 86_400_000

function parseDate(s: string): string | null {
  const t = s.trim().replace(/^"|"$/g, '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null
  const ms = Date.parse(t.slice(0, 10) + 'T00:00:00Z')
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null
}

export function analyzeNavCsv(text: string): NavAnalysis {
  const lines = text.split(/\r?\n/)
  const issues: NavRowIssue[] = []
  const seen = new Set<string>()
  const valid: { date: string; nav: number }[] = []
  let rows = 0
  let prevDate: string | null = null

  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) return
    const cells = line.split(/[,;\t]/)
    // Skip a header row.
    if (idx === 0 && !/^\d/.test(cells[0].trim().replace(/^"/, ''))) return
    rows++
    const lineNo = idx + 1
    const date = parseDate(cells[0] ?? '')
    const nav = Number((cells[1] ?? '').trim().replace(/^"|"$/g, ''))
    if (!date) return void issues.push({ line: lineNo, message: 'Date must be YYYY-MM-DD' })
    if (!Number.isFinite(nav) || nav <= 0) return void issues.push({ line: lineNo, message: 'NAV must be a positive number' })
    if (seen.has(date)) return void issues.push({ line: lineNo, message: `Duplicate date ${date}` })
    if (prevDate && date < prevDate) return void issues.push({ line: lineNo, message: 'Dates must be in increasing order' })
    if (prevDate && (Date.parse(date) - Date.parse(prevDate)) / DAY > MAX_GAP_DAYS)
      issues.push({ line: lineNo, message: `Gap of more than ${MAX_GAP_DAYS} days before ${date}` })
    seen.add(date)
    prevDate = date
    valid.push({ date, nav })
  })

  const passed = rows - issues.length
  if (valid.length < MIN_POINTS) {
    return { rows, passed: Math.max(0, passed), issues, points: valid, metrics: null, blocker: `Need at least ${MIN_POINTS} valid daily rows (found ${valid.length}).` }
  }
  const base = valid[0].nav
  const series: PerformancePoint[] = withDrawdowns(
    // Benchmark: cash at 0% (flat) — the quant hasn't declared a benchmark.
    valid.map((p) => ({ date: p.date, equity: (p.nav / base) * 100, benchmark: 100 })),
  )
  return { rows, passed: Math.max(0, passed), issues, points: valid, metrics: computeMetrics(series), blocker: null }
}

/** Deterministic example file so quants can try the flow (clearly labelled as an example). */
export function exampleNavCsv(days = 420): string {
  let nav = 10_000
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const start = Date.UTC(2025, 6, 1)
  const out = ['date,nav']
  for (let i = 0; i < days; i++) {
    const shock = (rand() + rand() + rand() - 1.5) * 0.012
    nav *= 1 + 0.0006 + shock
    out.push(`${new Date(start + i * DAY).toISOString().slice(0, 10)},${nav.toFixed(2)}`)
  }
  return out.join('\n')
}
