import { Gavel, Lock, PlusCircle, Tag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { OnchainListingCard } from '@/components/onchain/OnchainListingCard'
import { ProgramStatusNotice } from '@/components/onchain/ProgramStatusNotice'
import { EmptyState, StrategyGridSkeleton } from '@/components/states'
import { DemoAuctionCard } from '@/components/strategy/DemoAuctionCard'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useNow'
import { useStrategies } from '@/hooks/useStrategies'
import { getAuctionSnapshot } from '@/lib/auction'
import { clusterNowSec, useOnchain } from '@/providers/onchain'

export function AuctionsPage() {
  const { listings, program, status, clockOffsetSec } = useOnchain()
  const strategies = useStrategies()
  const now = useNow()
  const nowSec = clusterNowSec(now, clockOffsetSec)
  const open = listings.filter((l) => l.account.status === 'open' && nowSec < Number(l.account.endTs))
  const closed = listings.filter((l) => !open.includes(l))
  const nameOf = (id: string, fallback: string) => strategies.data?.find((s) => s.id === id)?.name ?? fallback
  const hasStrategy = (id: string) => !!strategies.data?.some((s) => s.id === id)
  const demo = (strategies.data ?? []).filter((s) => s.auction).sort((a, b) => {
    const order = { active: 0, upcoming: 1, ended: 2 }
    return order[getAuctionSnapshot(a.auction!, now).status] - order[getAuctionSnapshot(b.auction!, now).status]
  })

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-br from-surface-2 to-green/40 p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">Auctions</h1>
        <p className="mt-2 max-w-2xl text-fg-2">Quants list access to their strategy with an asking price. Investors make offers, and the quant picks the one they like.</p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            [Tag, 'Quant sets an asking price', 'e.g. $15,000 for 90 days of access'],
            [Lock, 'Investors make offers', 'USDC is locked in escrow — refundable if not chosen'],
            [Gavel, 'Quant accepts one', 'Paid instantly: 97% to the quant, 3% to StratX'],
          ].map(([Icon, t, d], i) => {
            const I = Icon as typeof Tag
            return (
              <li key={i} className="flex gap-3 rounded-2xl bg-bg/50 p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink"><I className="size-4" /></span>
                <span>
                  <span className="block text-sm font-bold text-fg">{t as string}</span>
                  <span className="block text-xs text-fg-2">{d as string}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="space-y-4" aria-labelledby="live-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="live-heading" className="text-xl font-bold text-fg">Live auctions on Solana Devnet</h2>
          <Button asChild variant="primary"><Link to="/create"><PlusCircle /> Create a strategy</Link></Button>
        </div>
        <ProgramStatusNotice />
        {status === 'loading' && !program && <StrategyGridSkeleton count={2} />}
        {program?.kind === 'ready' && open.length === 0 && (
          <EmptyState icon={<Gavel />} title="No live auctions right now" description="Be the first: create a strategy and start an auction." />
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {open.map((l) => (
            <OnchainListingCard key={l.address.toBase58()} listing={l} strategyName={nameOf(l.account.strategyId, l.account.title)} strategyHref={hasStrategy(l.account.strategyId) ? `/strategy/${l.account.strategyId}?tab=auction` : undefined} />
          ))}
        </div>
        {closed.length > 0 && (
          <details className="rounded-2xl border border-line p-4">
            <summary className="cursor-pointer text-sm font-semibold text-fg">Closed auctions ({closed.length})</summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {closed.map((l) => (
                <OnchainListingCard key={l.address.toBase58()} listing={l} strategyName={nameOf(l.account.strategyId, l.account.title)} />
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="demo-heading">
        <div>
          <h2 id="demo-heading" className="text-xl font-bold text-fg">Demo auctions</h2>
          <p className="text-sm text-muted">Simulated offers on the demo strategies, to show how auctions play out. Not real money.</p>
        </div>
        {strategies.status === 'loading' ? (
          <StrategyGridSkeleton count={2} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {demo.map((s) => (
              <DemoAuctionCard key={s.id} strategy={s} showLink />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
