import { AlertTriangle, Gavel } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TierBadge } from '@/components/reputation/TierBadge'
import { AuctionInline } from '@/components/strategy/AuctionCountdown'
import { RiskBadge } from '@/components/strategy/badges'
import { Sparkline } from '@/components/strategy/Sparkline'
import { WatchButton } from '@/components/strategy/WatchButton'
import { formatCountdown, formatDuration, formatPercent, formatRatio } from '@/lib/format'
import { STYLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { SearchHit } from '@/search/types'
import { formatUsdc } from '@/solana/program/pricing'
import type { ListingSummary } from '@/solana/program/view'
import type { Strategy } from '@/types/strategy'

function SourceChip({ s }: { s: Strategy }) {
  if (s.source === 'demo') return <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn">Demo</span>
  if (s.source === 'self-reported') return <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-info">Self-reported</span>
  return null
}

export function StrategyCard({ strategy: s, hit, onchain }: { strategy: Strategy; hit?: SearchHit; onchain?: ListingSummary }) {
  const m = s.metrics
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_12px_32px_-16px_rgb(255_122_26/0.45)] focus-within:border-accent/60">
      <div className="flex items-start gap-3 p-5 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge reputation={s.reputation} strategyName={s.name} />
            <SourceChip s={s} />
          </div>
          <h3 className="mt-3 truncate text-lg font-bold text-fg">
            <Link to={`/strategy/${s.id}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
              {s.name}
            </Link>
          </h3>
          <p className="truncate text-xs text-muted">
            {STYLE_LABEL[s.style]} · by {s.creator.displayName}
          </p>
        </div>
        <WatchButton strategyId={s.id} name={s.name} className="-mr-1.5 -mt-1" />
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] px-5 text-sm leading-5 text-fg-2">{s.tagline}</p>

      <div className="px-5 pt-3">
        <Sparkline series={m.series} height={44} />
      </div>

      <dl className="grid grid-cols-4 gap-2 px-5 py-4">
        {[
          ['Yearly return', formatPercent(m.cagr, { digits: 0 }), m.cagr >= 0 ? 'text-pos' : 'text-neg'],
          ['Sharpe', formatRatio(m.sharpe), 'text-fg'],
          ['Worst drop', formatPercent(m.maxDrawdown, { digits: 0 }), 'text-neg'],
          ['History', formatDuration(m.trackRecordDays), 'text-fg'],
        ].map(([k, v, c]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
            <dd className={cn('num mt-0.5 truncate text-sm font-bold', c)}>{v}</dd>
          </div>
        ))}
      </dl>

      {hit && (hit.reasons.length > 0 || hit.warnings.length > 0 || hit.matchedTerms.length > 0) && (
        <div className="space-y-1 border-t border-line bg-white/[0.02] px-5 py-3 text-xs">
          {hit.reasons.length > 0 && (
            <div className="text-fg-2">
              <span className="font-semibold text-pos">Why it matched: </span>
              {hit.reasons.join(' · ')}
            </div>
          )}
          {hit.matchedTerms.length > 0 && (
            <div className="text-fg-2">
              <span className="font-semibold text-muted">Keywords: </span>
              {hit.matchedTerms.join(', ')}
            </div>
          )}
          {hit.warnings.map((w) => (
            <div key={w} className="flex items-center gap-1 text-warn">
              <AlertTriangle className="size-3" /> {w}
            </div>
          ))}
        </div>
      )}

      {onchain ? (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-accent/30 bg-accent/[0.07] px-5 py-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
            <Gavel className="size-3.5" /> Live auction
          </span>
          <span className="num text-fg">
            {onchain.bestOffer ? `Best ${formatUsdc(onchain.bestOffer, { decimals: 0 })}` : `Ask ${formatUsdc(onchain.askPrice, { decimals: 0 })}`}
            <span className="text-muted"> · {formatCountdown(onchain.secondsRemaining * 1000)}</span>
          </span>
        </div>
      ) : (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          <RiskBadge risk={s.riskLevel} />
          <AuctionInline auction={s.auction} />
        </div>
      )}
    </article>
  )
}
