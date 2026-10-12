import type { AssetCategory, ReputationTier, RiskLevel, StrategyStyle } from '@/types/strategy'

export type UserRole = 'investor' | 'creator' | 'both'

export interface InvestorProfile {
  riskTolerance: RiskLevel
  assetInterests: AssetCategory[]
  minTier: ReputationTier
  /** Max price the user is comfortable paying for access, in SOL. */
  budgetSol: number | null
}

export interface CreatorProfile {
  displayName: string
  styles: StrategyStyle[]
  /** Items the creator intends to disclose publicly. */
  disclosures: string[]
  verificationPlan: 'attested' | 'exchange-linked' | 'self-reported'
}

export interface UserProfile {
  status: 'new' | 'skipped' | 'complete'
  role: UserRole | null
  investor: InvestorProfile | null
  creator: CreatorProfile | null
  acknowledgedDemo: boolean
  acknowledgedRisk: boolean
  /** Wallet that was connected when onboarding finished, if any. */
  walletAtOnboarding: string | null
  completedAt: string | null
}

export const NEW_PROFILE: UserProfile = {
  status: 'new',
  role: null,
  investor: null,
  creator: null,
  acknowledgedDemo: false,
  acknowledgedRisk: false,
  walletAtOnboarding: null,
  completedAt: null,
}
