import { Check, Info } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-md', className)} />
}

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-2xl border border-line bg-surface', className)} {...props} />
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** Small focusable info icon with a tooltip, for explaining metrics. */
export function InfoHint({ children, label = 'More info' }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip content={children}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex size-4 items-center justify-center rounded text-faint hover:text-fg-2"
      >
        <Info className="size-3.5" />
      </button>
    </Tooltip>
  )
}

/** Toggle chip used by filter groups. */
export function Chip({
  selected,
  className,
  children,
  ...props
}: ComponentProps<'button'> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors whitespace-nowrap',
        selected
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-line-strong bg-surface text-fg-2 hover:border-faint hover:text-fg',
        className,
      )}
      {...props}
    >
      {selected && <Check className="size-3" />}
      {children}
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-px font-mono text-[10px] text-muted">
      {children}
    </kbd>
  )
}

/** Selectable card used for single/multi choice in onboarding. */
export function ChoiceCard({
  selected,
  title,
  description,
  icon,
  role = 'radio',
  onSelect,
  className,
}: {
  selected: boolean
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  role?: 'radio' | 'checkbox'
  onSelect: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors',
        selected ? 'border-accent/60 bg-accent/[0.07]' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border [&_svg]:size-4',
            selected ? 'border-accent/40 text-accent' : 'border-line-strong text-fg-2',
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{title}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center border',
          role === 'radio' ? 'rounded-full' : 'rounded',
          selected ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong',
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  )
}
