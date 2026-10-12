import { Star } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { usePreferences } from '@/providers/preferences'
import { cn } from '@/lib/utils'

export function WatchButton({ strategyId, name, className }: { strategyId: string; name: string; className?: string }) {
  const { watchlist, toggleWatchlist } = usePreferences()
  const watching = watchlist.includes(strategyId)
  return (
    <Tooltip content={watching ? 'Remove from watchlist' : 'Add to watchlist'}>
      <button
        type="button"
        aria-pressed={watching}
        aria-label={watching ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          toggleWatchlist(strategyId)
        }}
        className={cn(
          'relative z-10 inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-surface-3',
          watching ? 'text-warn' : 'text-faint hover:text-fg-2',
          className,
        )}
      >
        <Star className={cn('size-4', watching && 'fill-current')} />
      </button>
    </Tooltip>
  )
}
