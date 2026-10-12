import { Gem } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIER_CLASS_LABEL, type TierClass } from '@/reputation/display'

const TIER_STYLE: Record<TierClass, string> = {
  obsidian: 'text-tier-obsidian border-tier-obsidian/40 bg-tier-obsidian/[0.08]',
  diamond: 'text-tier-diamond border-tier-diamond/40 bg-tier-diamond/[0.08]',
  platinum: 'text-tier-platinum border-tier-platinum/35 bg-tier-platinum/[0.08]',
  gold: 'text-tier-gold border-tier-gold/35 bg-tier-gold/[0.08]',
  silver: 'text-tier-silver border-tier-silver/35 bg-tier-silver/[0.08]',
  bronze: 'text-tier-bronze border-tier-bronze/35 bg-tier-bronze/[0.08]',
  'not-tiered': 'text-fg-2 border-line-strong bg-surface-2',
  'below-bronze': 'text-muted border-line-strong bg-surface-2',
  unrated: 'text-muted border-dashed border-line-strong bg-transparent',
}

export function tierLabelClasses(tier: TierClass, size: 'sm' | 'md') {
  return cn(
    'inline-flex items-center rounded border font-semibold whitespace-nowrap',
    size === 'sm' ? 'h-5 px-1.5 text-[11px] gap-1' : 'h-7 px-2.5 text-xs gap-1.5',
    TIER_STYLE[tier],
  )
}

export function TierGem({ tier }: { tier: TierClass }) {
  return tier === 'diamond' || tier === 'obsidian' ? <Gem className="size-3" aria-hidden /> : null
}

/** Static tier name (no interaction) — for pickers, legends and the report. */
export function TierLabel({ tier, size = 'sm', className }: { tier: TierClass; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span className={cn(tierLabelClasses(tier, size), className)}>
      <TierGem tier={tier} />
      {TIER_CLASS_LABEL[tier]}
    </span>
  )
}
