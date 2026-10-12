import { useNavigate, Link } from 'react-router-dom'
import { AuctionInline } from '@/components/strategy/AuctionCountdown'
import { TierBadge } from '@/components/reputation/TierBadge'
import { RiskBadge, VerificationBadge } from '@/components/strategy/badges'
import { WatchButton } from '@/components/strategy/WatchButton'
import { formatDuration, formatPercent, formatRatio } from '@/lib/format'
import { STYLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { Strategy } from '@/types/strategy'
import type { ListingSummary } from '@/solana/program/view'
import { formatUsdc } from '@/solana/program/pricing'
import { Link2 } from 'lucide-react'

const TH = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted whitespace-nowrap'
const TD = 'px-3 py-2.5 whitespace-nowrap'

export function StrategyTable({ strategies, onchain }: { strategies: Strategy[]; onchain?: ReadonlyMap<string, ListingSummary> }) {
  const navigate = useNavigate()
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">Strategies (demo data)</caption>
        <thead className="border-b border-line bg-surface-2/50">
          <tr>
            <th scope="col" className={TH}>Strategy</th>
            <th scope="col" className={TH}>Reputation</th>
            <th scope="col" className={cn(TH, 'text-right')}>Sharpe</th>
            <th scope="col" className={cn(TH, 'text-right')}>CAGR</th>
            <th scope="col" className={cn(TH, 'text-right')}>Max DD</th>
            <th scope="col" className={cn(TH, 'text-right')}>Record</th>
            <th scope="col" className={TH}>Risk</th>
            <th scope="col" className={TH}>Verification</th>
            <th scope="col" className={TH}>Auction</th>
            <th scope="col" className={TH}><span className="sr-only">Watchlist</span></th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((s) => (
            <tr
              key={s.id}
              onClick={() => navigate(`/strategy/${s.id}`)}
              className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2/70"
            >
              <td className={TD}>
                <Link
                  to={`/strategy/${s.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-fg hover:text-accent"
                >
                  {s.name}
                </Link>
                <div className="text-xs text-muted">
                  {s.creator.displayName} · {STYLE_LABEL[s.style]}
                </div>
              </td>
              <td className={TD}>
                <div className="flex items-center gap-2">
                  <TierBadge reputation={s.reputation} strategyName={s.name} />
                  <span className="num text-xs text-muted">{s.reputation.score?.toFixed(1) ?? '—'}</span>
                </div>
              </td>
              <td className={cn(TD, 'num text-right')}>{formatRatio(s.metrics.sharpe)}</td>
              <td className={cn(TD, 'num text-right', s.metrics.cagr >= 0 ? 'text-pos' : 'text-neg')}>
                {formatPercent(s.metrics.cagr, { digits: 1 })}
              </td>
              <td className={cn(TD, 'num text-right text-neg')}>{formatPercent(s.metrics.maxDrawdown)}</td>
              <td className={cn(TD, 'num text-right text-fg-2')}>{formatDuration(s.metrics.trackRecordDays)}</td>
              <td className={TD}><RiskBadge risk={s.riskLevel} /></td>
              <td className={TD} onClick={(e) => e.stopPropagation()}>
                <VerificationBadge state={s.verification.state} source={s.verification.source} />
              </td>
              <td className={TD}>
                {onchain?.get(s.id) ? (
                  <span className="inline-flex items-center gap-1 text-xs text-accent">
                    <Link2 className="size-3" /> <span className="num">{formatUsdc(onchain.get(s.id)!.bestOffer ?? onchain.get(s.id)!.askPrice, { decimals: 0 })}</span>
                    <span className="text-muted">{onchain.get(s.id)!.bestOffer ? 'best offer' : 'asking'}</span>
                  </span>
                ) : (
                  <AuctionInline auction={s.auction} />
                )}
              </td>
              <td className={cn(TD, 'w-10 pr-2')}><WatchButton strategyId={s.id} name={s.name} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
