import { FlaskConical, Gavel } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AuctionLiveTicker } from '@/components/strategy/AuctionCountdown'
import { useNow } from '@/hooks/useNow'
import { formatUsd, getAuctionSnapshot } from '@/lib/auction'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Strategy } from '@/types/strategy'

/**
 * A DEMO offer auction: simulated investors and offers that appear over time.
 * Shows how the auction works; it can't be bid on.
 */
export function DemoAuctionCard({ strategy, showLink = false }: { strategy: Strategy; showLink?: boolean }) {
  const now = useNow()
  const a = strategy.auction!
  const s = getAuctionSnapshot(a, now)
  const offers = [...s.visibleOffers].sort((x, y) => y.amount - x.amount)
  const acceptedOffer = a.accepted && s.sold ? a.offers[a.accepted.offerIndex] : null
  return (
    <article className="overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-warn">
            <FlaskConical className="size-3.5" /> Demo simulation — can’t be bid on
          </div>
          <h3 className="text-base font-bold text-fg">
            {showLink ? <Link to={`/strategy/${strategy.id}?tab=auction`} className="hover:text-accent">{strategy.name}</Link> : strategy.name}
          </h3>
        </div>
        <span className="text-xs text-muted">Min offer {formatUsd(a.minOffer)} · {a.accessTermDays}-day licence</span>
      </header>
      <div className="space-y-4 p-5">
        <AuctionLiveTicker auction={a} />
        {offers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-3 text-center text-sm text-muted">{s.status === 'upcoming' ? 'Opens soon.' : 'No offers yet.'}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {offers.map((o, i) => {
              const isAccepted = acceptedOffer === o
              return (
                <li key={o.placedAt + o.amount} className={cn('flex items-center justify-between px-3 py-2', (isAccepted || (i === 0 && !s.sold)) && 'bg-accent/[0.06]')}>
                  <span className="num font-bold text-fg">{formatUsd(o.amount)}</span>
                  <span className="text-xs text-muted">
                    {o.bidder} · {formatRelative(o.placedAt, now)}
                    {isAccepted && <span className="ml-2 font-semibold text-pos">Accepted by quant</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Gavel className="size-3.5" /> Real auctions run on Solana Devnet — look for “Auction · Solana Devnet”.
        </p>
      </div>
    </article>
  )
}
