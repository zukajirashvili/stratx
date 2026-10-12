import type {
  MonthlyReturn,
  PerformancePoint,
  PeriodKey,
  PeriodReturn,
  RiskLevel,
  StrategyMetrics,
} from '@/types/strategy'

/**
 * Performance analytics. Pure functions over a daily NAV series, so the same
 * code computes metrics for demo data today and indexed on-chain records later.
 */

const DAYS_PER_YEAR = 365 // crypto trades every day

function dailyReturns(values: number[]) {
  const out: number[] = []
  for (let i = 1; i < values.length; i++) out.push(values[i] / values[i - 1] - 1)
  return out
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
}

function stdev(xs: number[]) {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

function returnBetween(series: PerformancePoint[], fromIdx: number, key: 'equity' | 'benchmark') {
  const start = series[fromIdx][key]
  const end = series[series.length - 1][key]
  return end / start - 1
}

const PERIODS: { key: PeriodKey; label: string; days?: number }[] = [
  { key: '1M', label: '1 month', days: 30 },
  { key: '3M', label: '3 months', days: 91 },
  { key: '6M', label: '6 months', days: 182 },
  { key: 'YTD', label: 'Year to date' },
  { key: '1Y', label: '1 year', days: 365 },
  { key: 'ITD', label: 'Since inception' },
]

export function computePeriodReturns(series: PerformancePoint[]): PeriodReturn[] {
  const last = series.length - 1
  const lastDate = new Date(series[last].date)
  return PERIODS.map(({ key, label, days }) => {
    let fromIdx: number | null
    if (key === 'ITD') fromIdx = 0
    else if (key === 'YTD') {
      const ytdStart = `${lastDate.getUTCFullYear()}-01-01`
      const idx = series.findIndex((p) => p.date >= ytdStart)
      fromIdx = idx <= 0 ? (series[0].date <= ytdStart ? 0 : null) : idx - 1
    } else fromIdx = days! <= last ? last - days! : null
    if (fromIdx === null) return { key, label, value: null, benchmark: null }
    return {
      key,
      label,
      value: returnBetween(series, fromIdx, 'equity'),
      benchmark: returnBetween(series, fromIdx, 'benchmark'),
    }
  })
}

export function computeMonthlyReturns(series: PerformancePoint[]): MonthlyReturn[] {
  const out: MonthlyReturn[] = []
  let monthStartEquity = series[0].equity
  for (let i = 1; i < series.length; i++) {
    const cur = series[i].date.slice(0, 7)
    const next = series[i + 1]?.date.slice(0, 7)
    if (next !== cur) {
      const [y, m] = cur.split('-').map(Number)
      out.push({ year: y, month: m - 1, value: series[i].equity / monthStartEquity - 1 })
      monthStartEquity = series[i].equity
    }
  }
  return out
}

export function computeMetrics(series: PerformancePoint[]): StrategyMetrics {
  const equity = series.map((p) => p.equity)
  const rets = dailyReturns(equity)
  const days = series.length - 1
  const totalReturn = equity[equity.length - 1] / equity[0] - 1
  const years = days / DAYS_PER_YEAR
  const cagr = (1 + totalReturn) ** (1 / Math.max(years, 1 / 12)) - 1
  const vol = stdev(rets) * Math.sqrt(DAYS_PER_YEAR)
  const downside = Math.sqrt(mean(rets.map((r) => Math.min(0, r) ** 2))) * Math.sqrt(DAYS_PER_YEAR)
  const annMean = mean(rets) * DAYS_PER_YEAR

  let maxDrawdown = 0
  let ddStart = 0
  let maxDdDuration = 0
  for (let i = 0; i < series.length; i++) {
    const dd = series[i].drawdown
    if (dd < maxDrawdown) maxDrawdown = dd
    if (dd === 0) ddStart = i
    else maxDdDuration = Math.max(maxDdDuration, i - ddStart)
  }

  const monthly = computeMonthlyReturns(series)
  const monthlyValues = monthly.map((m) => m.value)

  return {
    totalReturn,
    cagr,
    annualizedVolatility: vol,
    sharpe: vol > 0 ? annMean / vol : 0,
    sortino: downside > 0 ? annMean / downside : 0,
    calmar: maxDrawdown < 0 ? cagr / Math.abs(maxDrawdown) : 0,
    maxDrawdown,
    maxDrawdownDurationDays: maxDdDuration,
    positiveDaysRatio: rets.filter((r) => r > 0).length / Math.max(1, rets.length),
    bestMonth: Math.max(...monthlyValues),
    worstMonth: Math.min(...monthlyValues),
    trackRecordDays: days,
    inceptionDate: series[0].date,
    periodReturns: computePeriodReturns(series),
    monthlyReturns: monthly,
    series,
  }
}

/** Builds drawdown values for a raw NAV series. */
export function withDrawdowns(points: Omit<PerformancePoint, 'drawdown'>[]): PerformancePoint[] {
  let peak = -Infinity
  return points.map((p) => {
    peak = Math.max(peak, p.equity)
    return { ...p, drawdown: p.equity / peak - 1 }
  })
}

/** Risk classification derived from realised volatility and drawdown — never hand-assigned. */
export function classifyRisk(m: Pick<StrategyMetrics, 'annualizedVolatility' | 'maxDrawdown'>): RiskLevel {
  if (m.annualizedVolatility < 0.16 && m.maxDrawdown > -0.12) return 'low'
  if (m.annualizedVolatility < 0.4 && m.maxDrawdown > -0.3) return 'moderate'
  return 'high'
}
