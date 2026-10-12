import type { CostCompleteness } from '@/reputation/types'
import type { AssetCategory, StrategyStyle } from '@/types/strategy'

/** A strategy created by a quant in this browser. */
export interface CreatorStrategyRecord {
  id: string
  name: string
  tagline: string
  description: string
  style: StrategyStyle
  assetCategories: AssetCategory[]
  primaryAssets: string[]
  disclosed: string[]
  costCompleteness: CostCompleteness
  capacityUsd: number | null
  /** Raw daily NAV CSV the analysis is computed from. */
  navCsv: string
  /** True when the quant used the built-in example file. */
  isExampleData: boolean
  creatorName: string
  /** Wallet that created it, if signed in. */
  ownerWallet: string | null
  createdAt: string
}
