import type {
  AssetCategory,
  AuctionStatus,
  RiskLevel,
  StrategyStyle,
  VerificationState,
} from '@/types/strategy'

export { TIER_CLASS_LABEL, TIER_LABEL } from '@/reputation/display'

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
}

export const RISK_ORDER: RiskLevel[] = ['low', 'moderate', 'high']

export const ASSET_LABEL: Record<AssetCategory, string> = {
  'sol-ecosystem': 'SOL ecosystem',
  majors: 'BTC / ETH majors',
  perps: 'Perpetuals',
  'defi-yield': 'DeFi yield',
  memecoins: 'Memecoins',
  stablecoins: 'Stablecoins',
}

export const ASSET_ORDER: AssetCategory[] = [
  'sol-ecosystem',
  'majors',
  'perps',
  'defi-yield',
  'stablecoins',
  'memecoins',
]

export const STYLE_LABEL: Record<StrategyStyle, string> = {
  trend: 'Trend following',
  'mean-reversion': 'Mean reversion',
  'market-making': 'Market making',
  basis: 'Basis / funding',
  'stat-arb': 'Statistical arbitrage',
  momentum: 'Momentum',
  'delta-neutral': 'Delta neutral',
}

export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  attested: 'On-chain attested',
  'exchange-linked': 'Exchange-linked',
  'self-reported': 'Self-reported',
  pending: 'Verification pending',
}

export const AUCTION_STATUS_LABEL: Record<AuctionStatus | 'none', string> = {
  active: 'Live auction',
  upcoming: 'Upcoming',
  ended: 'Ended',
  none: 'No auction',
}
