import type { ReactNode } from 'react'
import { InfoHint } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

export type MetricTone = 'default' | 'pos' | 'neg' | 'muted'

const TONE: Record<MetricTone, string> = {
  default: 'text-fg',
  pos: 'text-pos',
  neg: 'text-neg',
  muted: 'text-muted',
}

export function toneFor(value: number | null | undefined): MetricTone {
  if (value === null || value === undefined) return 'muted'
  return value > 0 ? 'pos' : value < 0 ? 'neg' : 'default'
}

export function Metric({
  label,
  value,
  tone = 'default',
  hint,
  sub,
  size = 'md',
  className,
}: {
  label: string
  value: ReactNode
  tone?: MetricTone
  hint?: ReactNode
  sub?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        <span className="truncate">{label}</span>
        {hint && <InfoHint label={`About ${label}`}>{hint}</InfoHint>}
      </div>
      <div
        className={cn(
          'num mt-1 truncate',
          size === 'sm' && 'text-sm',
          size === 'md' && 'text-base',
          size === 'lg' && 'text-xl font-medium',
          TONE[tone],
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-faint">{sub}</div>}
    </div>
  )
}

export const METRIC_HINTS = {
  sharpe: 'Annualised mean daily return divided by annualised volatility (risk-free rate assumed 0).',
  sortino: 'Like Sharpe, but only penalises downside volatility.',
  maxDrawdown: 'Largest peak-to-trough decline in net asset value over the full record.',
  cagr: 'Compound annual growth rate since inception.',
  volatility: 'Annualised standard deviation of daily returns.',
  calmar: 'CAGR divided by the absolute maximum drawdown.',
  trackRecord: 'Length of continuous daily performance history.',
  reputation: 'S = 0.25P + 0.20R + 0.15C + 0.15T + 0.10K + 0.10V + 0.05U. Click a tier badge for the full breakdown.',
}
