import { ArrowRight, Gavel, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AuctionInline } from '@/components/strategy/AuctionCountdown'
import { TierBadge } from '@/components/reputation/TierBadge'
import { DemoTag, RiskBadge, VerificationBadge } from '@/components/strategy/badges'
import { Metric, METRIC_HINTS, toneFor } from '@/components/strategy/Metric'
import { Sparkline } from '@/components/strategy/Sparkline'
import { Button } from '@/components/ui/button'
import { formatDuration, formatPercent, formatRatio } from '@/lib/format'
import { STYLE_LABEL } from '@/lib/labels'
import type { Strategy } from '@/types/strategy'

export function FeaturedStrategy({ strategy: s }: { strategy: Strategy }) {
  const m = s.metrics
  return (
    <section aria-labelledby="featured-title" className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <span className="flex items-center gap-2 text-xs font-medium text-fg-2">
          <Sparkles className="size-3.5 text-accent" /> Featured · top-rated strategy with an open auction
        </span>
        <DemoTag />
      </div>
      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge reputation={s.reputation} strategyName={s.name} size="md" />
            <VerificationBadge state={s.verification.state} source={s.verification.source} />
            <RiskBadge risk={s.riskLevel} />
          </div>
          <h2 id="featured-title" className="mt-3 text-xl font-semibold tracking-tight text-fg">
            {s.name}
          </h2>
          <p className="mt-1 text-sm text-fg-2">{s.tagline}</p>
          <p className="mt-1 text-xs text-muted">
            {STYLE_LABEL[s.style]} · by {s.creator.displayName}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Sharpe" value={formatRatio(m.sharpe)} hint={METRIC_HINTS.sharpe} />
            <Metric label="CAGR" value={formatPercent(m.cagr)} tone={toneFor(m.cagr)} hint={METRIC_HINTS.cagr} />
            <Metric label="Max DD" value={formatPercent(m.maxDrawdown)} tone="neg" hint={METRIC_HINTS.maxDrawdown} />
            <Metric label="Record" value={formatDuration(m.trackRecordDays)} hint={METRIC_HINTS.trackRecord} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="primary">
              <Link to={`/strategy/${s.id}`}>
                View strategy <ArrowRight />
              </Link>
            </Button>
            {s.auction && (
              <Button asChild variant="outline">
                <Link to={`/strategy/${s.id}?tab=auction`}>
                  <Gavel /> Auction details
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-line bg-bg/40 p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Net equity since inception (demo)</span>
            <span className={`num ${m.totalReturn >= 0 ? 'text-pos' : 'text-neg'}`}>
              {formatPercent(m.totalReturn, { signed: true })}
            </span>
          </div>
          <Sparkline series={m.series} height={110} />
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Auction</span>
            <AuctionInline auction={s.auction} />
          </div>
        </div>
      </div>
    </section>
  )
}
