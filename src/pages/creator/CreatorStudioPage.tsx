import { ArrowRight, Gavel, PlusCircle, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAccount } from '@/auth/account'
import { OnchainListingCard } from '@/components/onchain/OnchainListingCard'
import { ProgramStatusNotice } from '@/components/onchain/ProgramStatusNotice'
import { StartAuctionForm } from '@/components/onchain/StartAuctionForm'
import { TierLabel } from '@/components/reputation/TierLabel'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Panel } from '@/components/ui/misc'
import { removeCreatorRecord, useCreatorRecords } from '@/creator/store'
import { creatorRecordToStrategy } from '@/creator/toStrategy'
import { formatDuration, formatPercent, formatRatio, shortAddress } from '@/lib/format'
import { useOnchain } from '@/providers/onchain'
import { tierClass } from '@/reputation/display'

/** The quant's dashboard: their strategies, their auctions, and offers waiting for a decision. */
export function CreatorStudioPage() {
  const account = useAccount()
  const records = useCreatorRecords()
  const { listings } = useOnchain()
  const myListings = account.publicKey ? listings.filter((l) => l.account.seller.equals(account.publicKey!)) : []
  const strategies = records.map((r) => ({ r, s: creatorRecordToStrategy(r) }))
  const recordIds = new Set(records.map((r) => r.id))
  const orphanListings = myListings.filter((l) => !recordIds.has(l.account.strategyId))

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-gradient-to-br from-surface-2 to-green/40 p-6 sm:p-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">My strategies</h1>
          <p className="mt-1 text-fg-2">
            {account.status === 'signed-in'
              ? `Signed in as ${account.label ?? 'wallet'} · ${account.publicKey ? shortAddress(account.publicKey.toBase58(), 5) : ''}`
              : 'Sign in to start auctions and accept offers.'}
          </p>
        </div>
        <Button asChild variant="primary" size="lg">
          <Link to="/create"><PlusCircle /> Create a strategy</Link>
        </Button>
      </section>

      <ProgramStatusNotice />

      {records.length === 0 && myListings.length === 0 && (
        <EmptyState
          icon={<PlusCircle />}
          title="You haven’t created a strategy yet"
          description="Upload your strategy’s daily performance and StratX will analyse it, give it a reputation tier, and let you auction access to it."
          action={
            <Button asChild variant="primary">
              <Link to="/create">Create your first strategy <ArrowRight /></Link>
            </Button>
          }
        />
      )}

      {strategies.map(({ r, s }) => {
        const own = myListings.filter((l) => l.account.strategyId === r.id)
        const hasOpen = own.some((l) => l.account.status === 'open')
        return (
          <section key={r.id} className="space-y-4">
            <Panel className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  {s && <TierLabel tier={tierClass(s.reputation)} size="md" />}
                  <h2 className="mt-2 text-xl font-bold text-fg">
                    <Link to={`/strategy/${r.id}`} className="hover:text-accent">{r.name}</Link>
                  </h2>
                  <p className="text-sm text-fg-2">{r.tagline}</p>
                  {s && (
                    <p className="mt-2 text-xs text-muted">
                      CAGR {formatPercent(s.metrics.cagr)} · Sharpe {formatRatio(s.metrics.sharpe)} · Max drop {formatPercent(s.metrics.maxDrawdown)} · {formatDuration(s.metrics.trackRecordDays)} record
                      {r.isExampleData && ' · example data'}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!hasOpen && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="primary"><Gavel /> Start an auction</Button>
                      </DialogTrigger>
                      <DialogContent title={`Start an auction · ${r.name}`} description="Real Solana Devnet transaction." className="max-w-xl">
                        <StartAuctionForm strategyId={r.id} title={r.name} />
                      </DialogContent>
                    </Dialog>
                  )}
                  <Button asChild variant="outline"><Link to={`/strategy/${r.id}`}>View</Link></Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${r.name} from this browser`}
                    title="Delete from this browser (on-chain auctions are not affected)"
                    onClick={() => {
                      if (window.confirm(`Delete “${r.name}” from this browser? On-chain auctions stay on Devnet.`)) removeCreatorRecord(r.id)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </Panel>
            {own.map((l) => (
              <OnchainListingCard key={l.address.toBase58()} listing={l} strategyName={r.name} />
            ))}
          </section>
        )
      })}

      {orphanListings.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-fg">Other auctions from this wallet</h2>
          {orphanListings.map((l) => (
            <OnchainListingCard key={l.address.toBase58()} listing={l} strategyName={l.account.title} />
          ))}
        </section>
      )}
    </div>
  )
}
