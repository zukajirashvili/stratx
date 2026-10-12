import { computeMetrics, withDrawdowns } from '@/lib/metrics'
import { gaussian, seededRandom } from '@/lib/utils'
import type { PerformancePoint, StrategyMetrics } from '@/types/strategy'

/**
 * Synthetic performance generator for DEMO DATA ONLY.
 *
 * Produces a deterministic daily NAV path from a handful of parameters, so
 * every derived metric (Sharpe, drawdown, period returns…) is internally
 * consistent. None of these paths represent real trading results.
 */

const BENCHMARK_DAYS = 1400
const DAY_MS = 86_400_000

function todayUtc() {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Synthetic SOL-like benchmark returns shared by all demo strategies. */
const benchmarkReturns: number[] = (() => {
  const rand = seededRandom(424242)
  const mu = 0.3 / 365
  const sigma = 0.7 / Math.sqrt(365)
  return Array.from({ length: BENCHMARK_DAYS }, () => mu + sigma * gaussian(rand))
})()

export interface SeriesParams {
  seed: number
  days: number
  /** Target arithmetic annual return. */
  annualReturn: number
  annualVol: number
  /** Sensitivity to the benchmark. */
  beta: number
  /** Daily probability of a loss shock, and its typical size. */
  shockProb?: number
  shockSize?: number
}

export function generateMetrics(p: SeriesParams): StrategyMetrics {
  const rand = seededRandom(p.seed)
  const end = todayUtc()
  const benchSlice = benchmarkReturns.slice(BENCHMARK_DAYS - p.days)
  const benchMean = benchSlice.reduce((a, b) => a + b, 0) / benchSlice.length
  const idioSigma = Math.sqrt(Math.max(1e-8, (p.annualVol / Math.sqrt(365)) ** 2 - (p.beta * 0.7) ** 2 / 365))
  const mu = p.annualReturn / 365

  let equity = 100
  let bench = 100
  const raw: Omit<PerformancePoint, 'drawdown'>[] = [
    { date: new Date(end - p.days * DAY_MS).toISOString().slice(0, 10), equity, benchmark: bench },
  ]
  for (let i = 0; i < p.days; i++) {
    const b = benchSlice[i]
    let r = mu + p.beta * (b - benchMean) + idioSigma * gaussian(rand)
    if (p.shockProb && rand() < p.shockProb) r -= (p.shockSize ?? 0.05) * (0.5 + rand())
    equity *= 1 + Math.max(r, -0.6)
    bench *= 1 + b
    raw.push({
      date: new Date(end - (p.days - i - 1) * DAY_MS).toISOString().slice(0, 10),
      equity: Number(equity.toFixed(4)),
      benchmark: Number(bench.toFixed(4)),
    })
  }
  return computeMetrics(withDrawdowns(raw))
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Deterministic, clearly fictional base58 string shaped like a Solana address. */
export function demoAddress(seed: number) {
  const rand = seededRandom(seed)
  return Array.from({ length: 44 }, () => BASE58[Math.floor(rand() * BASE58.length)]).join('')
}
