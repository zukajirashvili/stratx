import { EyeOff, Lock } from 'lucide-react'
import { DemoTag } from '@/components/strategy/badges'
import { STYLE_LABEL } from '@/lib/labels'
import type { CreatorProfile } from '@/types/user'

export const DISCLOSURE_OPTIONS = [
  'Daily NAV series',
  'Aggregate risk metrics',
  'Monthly returns',
  'Venue list',
  'Leverage range',
  'Asset universe',
  'Holding-period distribution',
] as const

const ALWAYS_PRIVATE = ['Source code', 'Signal logic & parameters', 'Live positions', 'Order-level fills']

/** Shows a creator exactly what an investor would see, given their disclosure choices. */
export function CreatorDisclosurePreview({ creator }: { creator: CreatorProfile }) {
  const has = (d: string) => creator.disclosures.includes(d)
  const redacted = (
    <span className="inline-flex items-center gap-1 text-faint">
      <Lock className="size-3" /> Private
    </span>
  )
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted">
            {creator.styles.length ? creator.styles.map((s) => STYLE_LABEL[s]).join(' · ') : 'Choose a style'}
          </div>
          <div className="mt-1 truncate text-[15px] font-semibold text-fg">Your strategy</div>
          <div className="text-xs text-muted">by {creator.displayName.trim() || 'Your name'}</div>
        </div>
        <DemoTag label="Preview" />
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-line px-4 py-3 text-sm sm:grid-cols-4">
        {[
          ['Equity curve', has('Daily NAV series') ? 'Shown' : null],
          ['Sharpe / Max DD', has('Aggregate risk metrics') ? 'Shown' : null],
          ['Monthly table', has('Monthly returns') ? 'Shown' : null],
          ['Venues', has('Venue list') ? 'Shown' : null],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
            <dd className="mt-0.5 text-xs">{v ? <span className="text-pos">{v}</span> : redacted}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1 font-medium text-fg-2">
          <EyeOff className="size-3" /> Always private:
        </span>
        {ALWAYS_PRIVATE.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
    </div>
  )
}
