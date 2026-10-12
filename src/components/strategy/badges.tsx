import { CircleDashed, FlaskConical, Link2, ShieldCheck, UserPen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { RISK_LABEL, VERIFICATION_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { DataSource, RiskLevel, VerificationState } from '@/types/strategy'

const RISK_TONE = { low: 'pos', moderate: 'warn', high: 'neg' } as const

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <Badge tone={RISK_TONE[risk]}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {RISK_LABEL[risk]}
    </Badge>
  )
}

const VERIFICATION_ICON = {
  attested: ShieldCheck,
  'exchange-linked': Link2,
  'self-reported': UserPen,
  pending: CircleDashed,
} satisfies Record<VerificationState, unknown>

const VERIFICATION_TONE = {
  attested: 'accent',
  'exchange-linked': 'info',
  'self-reported': 'neutral',
  pending: 'warn',
} as const

/**
 * Verification badge. For demo records the badge always carries a "demo"
 * marker and explains that no verification actually took place.
 */
export function VerificationBadge({ state, source }: { state: VerificationState; source: DataSource }) {
  const Icon = VERIFICATION_ICON[state]
  const isDemo = source === 'demo'
  const unverified = source !== 'onchain'
  return (
    <Tooltip
      content={
        isDemo
          ? `Demo data: shows how a "${VERIFICATION_LABEL[state]}" record would appear. No real verification has been performed.`
          : source === 'self-reported'
            ? 'Uploaded by the creator and format-checked only. Not independently verified.'
            : VERIFICATION_LABEL[state]
      }
    >
      <span tabIndex={0} className="inline-flex">
        <Badge tone={unverified ? 'neutral' : VERIFICATION_TONE[state]} className={cn(unverified && 'border-dashed')}>
          <Icon />
          {VERIFICATION_LABEL[state]}
          {isDemo && <span className="text-faint">· demo</span>}
        </Badge>
      </span>
    </Tooltip>
  )
}

export function DemoTag({ className, label = 'Demo data' }: { className?: string; label?: string }) {
  return (
    <Tooltip content="Fabricated sample data for product demonstration. Not real performance, not verified, not an offer.">
      <span
        tabIndex={0}
        className={cn(
          'inline-flex h-5 items-center gap-1 rounded border border-dashed border-warn/40 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-warn',
          className,
        )}
      >
        <FlaskConical className="size-3" />
        {label}
      </span>
    </Tooltip>
  )
}
