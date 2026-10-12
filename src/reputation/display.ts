import { TIER_GATES } from '@/reputation/config'
import type { RatingStatus, ReputationResult, TierKey } from '@/reputation/types'

/** UI-facing classification: a tier, or why there is none. */
export type TierClass = TierKey | 'not-tiered' | 'below-bronze' | 'unrated'

export const TIER_ORDER: TierKey[] = TIER_GATES.map((g) => g.tier)

export const TIER_LABEL: Record<TierKey, string> = Object.fromEntries(TIER_GATES.map((g) => [g.tier, g.label])) as Record<
  TierKey,
  string
>

export const TIER_CLASS_LABEL: Record<TierClass, string> = {
  ...TIER_LABEL,
  'not-tiered': 'Not tiered',
  'below-bronze': 'Below Bronze',
  unrated: 'Unrated',
}

/** Filter options for Explore, highest first. */
export const TIER_CLASS_ORDER: TierClass[] = [...[...TIER_ORDER].reverse(), 'not-tiered', 'below-bronze', 'unrated']

export const STATUS_LABEL: Record<RatingStatus, string> = {
  rated: 'Rated',
  provisional: 'Provisional',
  unrated: 'Unrated',
}

export function tierClass(r: ReputationResult): TierClass {
  if (r.status === 'unrated' || r.score === null) return 'unrated'
  if (r.tier) return r.tier
  return r.scoreBandTier ? 'not-tiered' : 'below-bronze'
}

/** Sort key: higher is better; unrated strategies sort last. */
export function reputationRank(r: ReputationResult): number {
  return r.score ?? -1
}

/** True when the awarded tier is at least `min`. Unrated / untiered never qualify. */
export function tierAtLeast(r: ReputationResult, min: TierKey): boolean {
  return r.tier !== null && TIER_ORDER.indexOf(r.tier) >= TIER_ORDER.indexOf(min)
}
