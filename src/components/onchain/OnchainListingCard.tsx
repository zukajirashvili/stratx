import { useConnection } from '@solana/wallet-adapter-react'
import { CheckCircle2, ExternalLink, Gavel, HandCoins, Lock, Tag, Timer, Undo2, Users, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '@/auth/account'
import { DevnetFunds } from '@/components/onchain/DevnetFunds'
import { TxStatus } from '@/components/onchain/TxStatus'
import { StatusDot } from '@/components/strategy/AuctionCountdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { useNow } from '@/hooks/useNow'
import { useTxRunner } from '@/hooks/useTxRunner'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { formatCountdown, formatDateTime, formatRelative, shortAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { clusterNowSec, offersFor, useOnchain } from '@/providers/onchain'
import { explorerAddressUrl } from '@/providers/solanaConfig'
import { acceptOffer, cancelListing, placeOffer, recordExpiry, withdrawOffer } from '@/solana/actions'
import type { OnchainListing } from '@/solana/program/client'
import { ENTITLEMENT_TERMS } from '@/solana/program/constants'
import { formatUsdc, parseUsdc, splitPayment } from '@/solana/program/pricing'
import { acceptGate, listingView, offerGate, withdrawGate, type ListingPhase, type OfferView } from '@/solana/program/view'

const PHASE: Record<ListingPhase, { label: string; tone: 'accent' | 'pos' | 'muted' | 'warn' }> = {
  open: { label: 'Taking offers', tone: 'accent' },
  ended: { label: 'Ended — no offer accepted', tone: 'muted' },
  sold: { label: 'Sold', tone: 'pos' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  expired: { label: 'Ended — no offer accepted', tone: 'muted' },
}

function Stat({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted [&_svg]:size-3.5">
        {icon} {label}
      </div>
      <div className={cn('num mt-1 text-lg font-bold', strong ? 'text-accent' : 'text-fg')}>{value}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ make an offer */

function OfferForm({ listing, strategyName, onDone }: { listing: OnchainListing; strategyName: string; onDone?: () => void }) {
  const { connection } = useConnection()
  const account = useAccount()
  const { program, clockOffsetSec, offers, refresh } = useOnchain()
  const usdc = useUsdcBalance()
  const now = useNow()
  const tx = useTxRunner()
  const l = listing.account
  const nowSec = clusterNowSec(now, clockOffsetSec)
  const view = listingView(l, offersFor(offers, listing.address), nowSec)
  const [amountText, setAmountText] = useState(view.bestOffer ? (Number(view.bestOffer) / 1e6 + 100).toString() : (Number(l.minOffer) / 1e6).toString())
  const [expiry, setExpiry] = useState<'end' | '1h' | '24h'>('end')
  const [accepted, setAccepted] = useState(false)

  const amount = parseUsdc(amountText)
  const expiresAt = expiry === 'end' ? 0 : Math.min(Number(l.endTs), Math.floor(nowSec) + (expiry === '1h' ? 3600 : 86_400))
  const hasLiveOffer = !!account.publicKey && view.offers.some((o) => o.bidder.equals(account.publicKey!))
  const gate = offerGate(view, l, {
    programReady: program?.kind === 'ready',
    viewer: account.publicKey,
    pending: tx.pending,
    termsAccepted: accepted,
    hasLiveOffer,
    amount,
    expiresAt,
    usdcBalance: usdc.units,
    nowSec,
  })
  const split = amount ? splitPayment(amount) : null

  if (tx.phase === 'confirmed') {
    return (
      <div className="space-y-4">
        <TxStatus tx={tx} successText="Offer placed — your USDC is locked in escrow on Solana Devnet." />
        <p className="text-sm text-fg-2">The quant can now accept it. You can withdraw it any time before then, and it’s refundable if the auction closes without you.</p>
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!gate.allowed || !amount) return
        tx.run((onPhase) =>
          placeOffer({ connection, wallet: account.signer, program: program!, listing: listing.address, amount, expiresAt, nowSec: clusterNowSec(Date.now(), clockOffsetSec), onPhase, refresh }).then((r) => {
            usdc.refresh()
            return r
          }),
        )
      }}
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat icon={<Tag />} label="Asking" value={formatUsdc(l.askPrice, { decimals: 0 })} />
        <Stat icon={<Gavel />} label="Best offer" value={view.bestOffer ? formatUsdc(view.bestOffer, { decimals: 0 }) : '—'} strong />
        <Stat icon={<Lock />} label="Minimum" value={formatUsdc(l.minOffer, { decimals: 0 })} />
      </div>

      <div>
        <label htmlFor="offer-amount" className="text-sm font-semibold text-fg">
          Your offer (USDC)
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted">$</span>
          <input
            id="offer-amount"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            disabled={tx.pending}
            className="num h-14 w-full rounded-2xl border border-line-strong bg-bg pl-9 pr-4 text-2xl font-bold text-fg focus:border-accent focus:outline-none"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[l.minOffer, ...(view.bestOffer ? [view.bestOffer + 100n * 1_000_000n] : []), l.askPrice].map((v, i) => (
            <button key={i} type="button" onClick={() => setAmountText((Number(v) / 1e6).toString())} className="rounded-full border border-line-strong px-3 py-1 text-xs text-fg-2 hover:border-accent hover:text-fg">
              {i === 0 ? 'Minimum' : v === l.askPrice ? 'Asking price' : 'Beat best offer'} · {formatUsdc(v, { decimals: 0 })}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Your balance: {usdc.units === null ? (account.publicKey ? 'no USDC yet' : '—') : formatUsdc(usdc.units)} (Devnet test USDC)
        </p>
      </div>

      <div>
        <label htmlFor="offer-expiry" className="text-sm font-semibold text-fg">
          Keep my offer open
        </label>
        <select id="offer-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-fg focus:border-accent focus:outline-none">
          <option value="end">Until the auction ends</option>
          <option value="1h">For 1 hour</option>
          <option value="24h">For 24 hours</option>
        </select>
      </div>

      {split && (
        <div className="rounded-2xl bg-green/25 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-fg">
            <Lock className="size-4 text-pos" /> {formatUsdc(amount!)} is locked in escrow
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">
            If the quant accepts: {formatUsdc(split.seller)} goes to the quant (97%) and {formatUsdc(split.fee)} to StratX (3%). If not, you get it all back.
          </p>
        </div>
      )}

      <details className="rounded-2xl border border-line p-3 text-xs text-fg-2">
        <summary className="cursor-pointer font-semibold text-fg">What you get if accepted — licence terms</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {ENTITLEMENT_TERMS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
      <label className="flex items-start gap-2 text-sm text-fg-2">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={tx.pending} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
        I accept the licence terms for <span className="font-semibold text-fg">{strategyName}</span>.
      </label>

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!gate.allowed}>
        <HandCoins /> {tx.pending ? 'Waiting for approval…' : `Offer ${amount ? formatUsdc(amount) : ''}`}
      </Button>
      {!gate.allowed && gate.reason && !tx.pending && <p className="text-center text-xs text-warn">{gate.reason}</p>}
      {account.publicKey && (usdc.units === null || (amount !== null && usdc.units < amount)) && <DevnetFunds compact onFunded={usdc.refresh} />}
      <TxStatus tx={tx} />
    </form>
  )
}

/* ------------------------------------------------------------------ accept */

function AcceptButton({ listing, offer }: { listing: OnchainListing; offer: OfferView }) {
  const { connection } = useConnection()
  const account = useAccount()
  const { program, clockOffsetSec, offers, refresh } = useOnchain()
  const now = useNow()
  const tx = useTxRunner()
  const view = listingView(listing.account, offersFor(offers, listing.address), clusterNowSec(now, clockOffsetSec))
  const gate = acceptGate(view, listing.account, offer, { programReady: program?.kind === 'ready', viewer: account.publicKey, pending: tx.pending })
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="green" disabled={!gate.allowed && tx.phase !== 'confirmed'} title={gate.reason ?? undefined}>
          <CheckCircle2 /> Accept
        </Button>
      </DialogTrigger>
      <DialogContent title={`Accept ${formatUsdc(offer.amount)}?`} description="This sells the access licence to this investor and closes the auction. It can’t be undone.">
        <dl className="space-y-2 rounded-2xl bg-white/[0.03] p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Offer</dt>
            <dd className="num font-semibold text-fg">{formatUsdc(offer.amount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">StratX fee (3%)</dt>
            <dd className="num text-fg-2">− {formatUsdc(offer.fee)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2">
            <dt className="font-semibold text-fg">You receive (97%)</dt>
            <dd className="num text-lg font-bold text-pos">{formatUsdc(offer.sellerProceeds)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          From {shortAddress(offer.bidder.toBase58(), 5)}. Paid instantly from escrow by the StratX program. Other investors can then withdraw their offers. A small amount of SOL
          pays for the licence record and token accounts.
        </p>
        {tx.phase !== 'confirmed' && (
          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full"
            disabled={!gate.allowed}
            onClick={() =>
              tx.run((onPhase) =>
                acceptOffer({ connection, wallet: account.signer, program: program!, listing: listing.address, bidder: offer.bidder, shownAmount: offer.amount, nowSec: clusterNowSec(Date.now(), clockOffsetSec), onPhase, refresh }),
              )
            }
          >
            {tx.pending ? 'Waiting for approval…' : `Accept and receive ${formatUsdc(offer.sellerProceeds)}`}
          </Button>
        )}
        {!gate.allowed && gate.reason && tx.phase === 'idle' && <p className="mt-2 text-center text-xs text-warn">{gate.reason}</p>}
        <div className="mt-3">
          <TxStatus tx={tx} successText="Sold! Payment split 97% / 3% on Solana Devnet." />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WithdrawButton({ listing, offer }: { listing: OnchainListing; offer: OfferView }) {
  const { connection } = useConnection()
  const account = useAccount()
  const { program, clockOffsetSec, offers, refresh } = useOnchain()
  const now = useNow()
  const tx = useTxRunner()
  const view = listingView(listing.account, offersFor(offers, listing.address), clusterNowSec(now, clockOffsetSec))
  const gate = withdrawGate(view, offer, { viewer: account.publicKey, pending: tx.pending })
  if (!gate.allowed) return null
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={tx.pending || program?.kind !== 'ready'}
        onClick={() => tx.run((onPhase) => withdrawOffer({ connection, wallet: account.signer, program: program!, listing: listing.address, bidder: offer.bidder, onPhase, refresh }))}
      >
        <Undo2 /> {gate.refundForOther ? 'Refund' : 'Withdraw'}
      </Button>
      {tx.phase !== 'idle' && <TxStatus tx={tx} successText={gate.refundForOther ? 'Refunded to the investor.' : 'Withdrawn — your USDC is back.'} />}
    </div>
  )
}

/* ------------------------------------------------------------------ card */

/** A real on-chain auction: asking price, live offers, and the actions this viewer may take. */
export function OnchainListingCard({ listing, strategyName, strategyHref }: { listing: OnchainListing; strategyName: string; strategyHref?: string }) {
  const { connection } = useConnection()
  const account = useAccount()
  const { program, clockOffsetSec, offers, refresh } = useOnchain()
  const now = useNow()
  const tx = useTxRunner()
  const [offerOpen, setOfferOpen] = useState(false)
  const l = listing.account
  const nowSec = clusterNowSec(now, clockOffsetSec)
  const view = listingView(l, offersFor(offers, listing.address), nowSec)
  const isSeller = !!account.publicKey?.equals(l.seller)
  const phase = PHASE[view.phase]
  const sale = l.status === 'sold' ? splitPayment(l.salePrice) : null

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white/[0.02] px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent">
            <Gavel className="size-3.5" /> Auction · Solana Devnet
          </div>
          <h3 className="truncate text-base font-bold text-fg">{strategyHref ? <Link to={strategyHref} className="hover:text-accent">{l.title || strategyName}</Link> : l.title || strategyName}</h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1 text-xs font-semibold text-fg">
          <StatusDot tone={phase.tone} pulse={view.phase === 'open'} /> {phase.label}
        </span>
      </header>

      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat icon={<Tag />} label="Asking price" value={formatUsdc(l.askPrice, { decimals: 0 })} />
          <Stat icon={<Gavel />} label={view.phase === 'sold' ? 'Sold for' : 'Best offer'} value={view.phase === 'sold' ? formatUsdc(l.salePrice, { decimals: 0 }) : view.bestOffer ? formatUsdc(view.bestOffer, { decimals: 0 }) : 'No offers yet'} strong />
          <Stat icon={<Timer />} label="Time left" value={view.phase === 'open' ? formatCountdown(view.secondsRemaining * 1000) : '—'} />
          <Stat icon={<Users />} label="Offers" value={String(view.offers.length)} />
        </div>

        {sale && (
          <div className="rounded-2xl bg-green/25 p-4 text-sm">
            <div className="font-semibold text-fg">
              Sold to {shortAddress(l.buyer!.toBase58(), 5)} for {formatUsdc(l.salePrice)}
            </div>
            <div className="mt-1 text-xs text-fg-2">
              Quant received {formatUsdc(sale.seller)} (97%) · StratX fee {formatUsdc(sale.fee)} (3%) · {formatDateTime(new Date(Number(l.soldAt) * 1000).toISOString())}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-fg">Offers</h4>
            <span className="text-xs text-muted">Minimum {formatUsdc(l.minOffer, { decimals: 0 })} · {l.accessTermDays}-day licence</span>
          </div>
          {view.offers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-muted">
              {view.phase === 'open' ? 'No offers yet — be the first.' : 'No open offers.'}
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {view.offers.map((o, i) => {
                const mine = !!account.publicKey?.equals(o.bidder)
                return (
                  <li key={o.bidder.toBase58()} className={cn('flex flex-wrap items-center gap-3 px-3 py-2.5', i === 0 && view.phase === 'open' && 'bg-accent/[0.06]')}>
                    <div className="min-w-0 flex-1">
                      <div className="num text-base font-bold text-fg">
                        {formatUsdc(o.amount)}
                        {i === 0 && view.phase === 'open' && !o.expired && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase text-accent">Highest</span>}
                      </div>
                      <div className="text-xs text-muted">
                        {mine ? 'You' : shortAddress(o.bidder.toBase58(), 4)} · {formatRelative(new Date(o.createdAt * 1000).toISOString(), nowSec * 1000)}
                        {o.expired ? ' · expired' : o.expiresAt ? ` · open until ${formatDateTime(new Date(o.expiresAt * 1000).toISOString())}` : ''}
                      </div>
                    </div>
                    {isSeller && view.phase === 'open' && <AcceptButton listing={listing} offer={o} />}
                    <WithdrawButton listing={listing} offer={o} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view.phase === 'open' && !isSeller && (
            <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
              <DialogTrigger asChild>
                <Button variant="primary" size="lg" disabled={program?.kind !== 'ready'}>
                  <HandCoins /> Make an offer
                </Button>
              </DialogTrigger>
              <DialogContent title={`Make an offer · ${strategyName}`} description="Real Solana Devnet transaction with test USDC. Your wallet will ask you to approve.">
                <OfferForm listing={listing} strategyName={strategyName} onDone={() => setOfferOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
          {isSeller && view.phase === 'open' && (
            <>
              <span className="text-sm text-fg-2">You’re the quant — accept any offer above.</span>
              <Button variant="danger" size="sm" className="ml-auto" disabled={tx.pending} onClick={() => tx.run((onPhase) => cancelListing({ connection, wallet: account.signer, program: program!, listing: listing.address, onPhase, refresh }))}>
                <XCircle /> Cancel auction
              </Button>
            </>
          )}
          {view.phase === 'ended' && (
            <Button variant="outline" size="sm" disabled={tx.pending || !account.publicKey} onClick={() => tx.run((onPhase) => recordExpiry({ connection, wallet: account.signer, program: program!, listing: listing.address, onPhase, refresh }))}>
              Mark as ended on-chain
            </Button>
          )}
          <a href={explorerAddressUrl(listing.address.toBase58())} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-accent">
            View on Explorer <ExternalLink className="size-3" />
          </a>
        </div>
        <TxStatus tx={tx} />
      </div>
    </article>
  )
}
