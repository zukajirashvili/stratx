import { Gavel, Tag, Timer } from 'lucide-react'
import { useNow } from '@/hooks/useNow'
import { formatUsd, getAuctionSnapshot } from '@/lib/auction'
import { formatCountdown } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Auction } from '@/types/strategy'

/** Live status dot. */
export function StatusDot({ tone, pulse }: { tone: 'pos' | 'warn' | 'neg' | 'muted' | 'accent'; pulse?: boolean }) {
  const color = { pos: 'bg-pos', warn: 'bg-warn', neg: 'bg-neg', muted: 'bg-faint', accent: 'bg-accent' }[tone]
  return (
    <span aria-hidden className="relative inline-flex size-2">
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', color)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', color)} />
    </span>
  )
}

/** Compact demo-auction summary for cards and rows. Ticks every second. */
export function AuctionInline({ auction, className }: { auction: Auction | null; className?: string }) {
  const now = useNow()
  if (!auction) return <span className={cn('text-xs text-faint', className)}>No auction</span>
  const s = getAuctionSnapshot(auction, now)
  if (s.status === 'upcoming') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-fg-2', className)}>
        <StatusDot tone="warn" /> Opens in <span className="num text-fg">{formatCountdown(s.msRemaining)}</span>
      </span>
    )
  }
  if (s.status === 'ended') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted', className)}>
        <StatusDot tone={s.sold ? 'pos' : 'muted'} />
        {s.sold ? `Sold for ${formatUsd(s.bestOffer ?? 0)}` : 'Ended'}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs', className)}>
      <span className="inline-flex items-center gap-1.5 text-fg">
        <StatusDot tone="accent" pulse />
        <span className="num font-semibold">{s.bestOffer ? formatUsd(s.bestOffer) : `Ask ${formatUsd(auction.askPrice)}`}</span>
        {s.bestOffer && <span className="text-muted">best offer</span>}
      </span>
      <span className="inline-flex items-center gap-1 text-muted">
        <Timer className="size-3" />
        <span className="num">{formatCountdown(s.msRemaining)}</span>
      </span>
    </span>
  )
}

/** Larger summary block for detail pages. */
export function AuctionLiveTicker({ auction }: { auction: Auction }) {
  const now = useNow()
  const s = getAuctionSnapshot(auction, now)
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Tag className="size-3" /> Asking
        </div>
        <div className="num mt-1 text-lg font-semibold text-fg">{formatUsd(auction.askPrice)}</div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Gavel className="size-3" /> {s.sold ? 'Sold for' : 'Best offer'}
        </div>
        <div className={cn('num mt-1 text-lg font-semibold', s.bestOffer ? 'text-accent' : 'text-faint')}>
          {s.bestOffer ? formatUsd(s.bestOffer) : '—'}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Timer className="size-3" /> {s.status === 'upcoming' ? 'Opens in' : s.status === 'active' ? 'Ends in' : 'Status'}
        </div>
        <div className="num mt-1 text-lg font-semibold text-fg">
          {s.status === 'ended' ? (s.sold ? 'Sold' : 'Ended') : formatCountdown(s.msRemaining)}
        </div>
      </div>
    </div>
  )
}
