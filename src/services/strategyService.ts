import { loadCreatorRecords } from '@/creator/store'
import { creatorRecordToStrategy } from '@/creator/toStrategy'
import { getAuctionSnapshot } from '@/lib/auction'
import { reputationRank } from '@/reputation/display'
import { DemoStrategyRepository, type StrategyRepository } from '@/services/strategyRepository'
import type { Strategy } from '@/types/strategy'

let repository: StrategyRepository = new DemoStrategyRepository()

/** Swap the backing repository (e.g. for on-chain data or tests). */
export function setStrategyRepository(repo: StrategyRepository) {
  repository = repo
}

/** Strategies created by quants in this browser, analysed from their uploaded NAV file. */
function creatorStrategies(): Strategy[] {
  return loadCreatorRecords()
    .map((r) => creatorRecordToStrategy(r))
    .filter((s): s is Strategy => s !== null)
}

export const strategyService = {
  get dataSource() {
    return repository.source
  },

  async listStrategies(): Promise<Strategy[]> {
    const base = await repository.list()
    return [...creatorStrategies(), ...base]
  },

  async getStrategy(id: string): Promise<Strategy | null> {
    const own = creatorStrategies().find((s) => s.id === id)
    if (own) return own
    return repository.getById(id)
  },

  /** Highest-reputation strategy with a live auction, falling back to highest overall. */
  pickFeatured(strategies: Strategy[], now: number): Strategy | null {
    if (!strategies.length) return null
    const ranked = [...strategies].sort((a, b) => reputationRank(b.reputation) - reputationRank(a.reputation))
    return ranked.find((s) => s.auction && getAuctionSnapshot(s.auction, now).status === 'active') ?? ranked[0]
  },
}
