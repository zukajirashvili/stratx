import { buildDemoStrategies } from '@/data/demo/strategies'
import type { Strategy } from '@/types/strategy'

/**
 * Data-access boundary. The UI only talks to `strategyService`, which talks to
 * a `StrategyRepository`. Swapping demo data for on-chain accounts and an
 * indexed performance store means adding a new repository — no UI changes.
 */
export interface StrategyRepository {
  readonly source: 'demo' | 'onchain'
  list(): Promise<Strategy[]>
  getById(id: string): Promise<Strategy | null>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class DemoStrategyRepository implements StrategyRepository {
  readonly source = 'demo' as const
  private cache: Strategy[] | null = null
  private readonly latencyMs: number

  constructor(latencyMs = 350) {
    this.latencyMs = latencyMs
  }

  private all() {
    // Built once per page load so auction clocks stay consistent while browsing.
    this.cache ??= buildDemoStrategies(Date.now())
    return this.cache
  }

  async list() {
    await sleep(this.latencyMs)
    maybeSimulateFailure()
    return this.all()
  }

  async getById(id: string) {
    await sleep(this.latencyMs)
    maybeSimulateFailure()
    return this.all().find((s) => s.id === id) ?? null
  }
}

/**
 * Lets reviewers exercise error states: append `?simulate=error` to any URL.
 * Development aid only — it never affects real data.
 */
function maybeSimulateFailure() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('simulate') === 'error') {
    throw new Error('Simulated network failure (remove ?simulate=error from the URL to recover).')
  }
}

// Future: export class OnchainStrategyRepository implements StrategyRepository { … }
