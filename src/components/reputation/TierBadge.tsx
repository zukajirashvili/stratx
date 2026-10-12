import { ChevronRight } from 'lucide-react'
import { ReputationReport } from '@/components/reputation/ReputationReport'
import { TierGem, tierLabelClasses } from '@/components/reputation/TierLabel'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { TIER_CLASS_LABEL, tierClass } from '@/reputation/display'
import type { ReputationResult } from '@/reputation/types'

/**
 * Reputation tier badge. Shows the tier NAME only (never a numeric level).
 * Clicking opens the full breakdown: score, seven factors, subfactors,
 * thresholds, evidence, eligibility checks, warnings and methodology.
 */
export function TierBadge({
  reputation,
  strategyName,
  size = 'sm',
  className,
}: {
  reputation: ReputationResult
  strategyName: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const cls = tierClass(reputation)
  const label = TIER_CLASS_LABEL[cls]
  const provisional = reputation.status === 'provisional'
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${label}${provisional ? ' (provisional)' : ''} — view reputation breakdown for ${strategyName}`}
          title={provisional ? 'Provisional rating — click for details' : 'Click for reputation breakdown'}
          className={cn(tierLabelClasses(cls, size), 'relative z-10 transition-[filter] hover:brightness-125', className)}
        >
          <TierGem tier={cls} />
          {label}
          {provisional && (
            <span aria-hidden className="font-normal opacity-60">
              *
            </span>
          )}
          <ChevronRight className={cn('opacity-60', size === 'sm' ? 'size-3' : 'size-3.5')} aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent
        title={`Reputation · ${strategyName}`}
        description="StratX Reputation Engine breakdown. Demo inputs — illustrative only."
        className="max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ReputationReport reputation={reputation} />
      </DialogContent>
    </Dialog>
  )
}
