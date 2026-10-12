import { AlertTriangle, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-line-strong text-muted [&_svg]:size-5">
        {icon ?? <SearchX />}
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  title = "Couldn't load strategies",
  className,
}: {
  error: Error
  onRetry?: () => void
  title?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center rounded-lg border border-neg/30 bg-neg/5 px-6 py-12 text-center', className)}
    >
      <AlertTriangle className="mb-3 size-6 text-neg" />
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{error.message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function StrategyCardSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-surface p-4" aria-hidden>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-3 h-5 w-40" />
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-4 h-9 w-full" />
      <Skeleton className="mt-4 h-10 w-full" />
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  )
}

export function StrategyGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading strategies" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <StrategyCardSkeleton key={i} />
      ))}
    </div>
  )
}
