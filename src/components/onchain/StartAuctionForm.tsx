import { useConnection } from '@solana/wallet-adapter-react'
import { Gavel, Lock, Tag, Timer } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from '@/auth/account'
import { ProgramStatusNotice } from '@/components/onchain/ProgramStatusNotice'
import { TxStatus } from '@/components/onchain/TxStatus'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useNow'
import { useTxRunner } from '@/hooks/useTxRunner'
import { clusterNowSec, useOnchain } from '@/providers/onchain'
import { createListing } from '@/solana/actions'
import { PROGRAM_ERRORS } from '@/solana/program/constants'
import { formatUsdc, parseUsdc, splitPayment, validateListing } from '@/solana/program/pricing'

const DURATIONS = [
  { label: '1 hour', s: 3600 },
  { label: '24 hours', s: 86_400 },
  { label: '3 days', s: 3 * 86_400 },
  { label: '7 days', s: 7 * 86_400 },
  { label: '14 days', s: 14 * 86_400 },
]
const field = 'h-12 w-full rounded-xl border border-line-strong bg-bg px-3 text-base text-fg focus:border-accent focus:outline-none disabled:opacity-50'

/**
 * Quant starts an auction for a strategy: asking price, minimum offer they'll
 * consider, how long offers are taken, and the licence length. Real Devnet tx.
 */
export function StartAuctionForm({ strategyId, title, onDone }: { strategyId: string; title: string; onDone?: () => void }) {
  const { connection } = useConnection()
  const account = useAccount()
  const { program, clockOffsetSec, refresh } = useOnchain()
  const tx = useTxRunner()
  const [ask, setAsk] = useState('15000')
  const [min, setMin] = useState('10000')
  const [duration, setDuration] = useState(86_400)
  const [days, setDays] = useState(90)

  const askUnits = parseUsdc(ask)
  const minUnits = parseUsdc(min)
  const now = useNow()
  const nowSec = Math.floor(clusterNowSec(now, clockOffsetSec))
  const err =
    askUnits === null || minUnits === null
      ? 'Enter amounts in dollars, e.g. 15000.'
      : (() => {
          const e = validateListing({ askPrice: askUnits, minOffer: minUnits, endTs: nowSec + duration, accessTermDays: days, now: nowSec })
          return e ? (PROGRAM_ERRORS.find(([n]) => n === e)?.[1] ?? e) : null
        })()
  const ready = program?.kind === 'ready'

  if (tx.phase === 'confirmed') {
    return (
      <div className="space-y-4">
        <TxStatus tx={tx} successText="Your auction is live on Solana Devnet." />
        <p className="text-sm text-fg-2">Investors can now make offers. You’ll see them on the strategy page and in My strategies — accept the one you like.</p>
        {onDone && (
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (err || !askUnits || !minUnits || !ready) return
        const start = Math.floor(clusterNowSec(Date.now(), clockOffsetSec))
        tx.run((onPhase) =>
          createListing({
            connection,
            wallet: account.signer,
            program: program!,
            input: { strategyId, title, askPrice: askUnits, minOffer: minUnits, endTs: start + duration, accessTermDays: days },
            nowSec: start,
            onPhase,
            refresh,
          }),
        )
      }}
    >
      <ol className="grid gap-2 text-xs text-fg-2 sm:grid-cols-3">
        <li className="rounded-xl bg-white/[0.03] p-3"><Tag className="mb-1 size-4 text-accent" /> You set an asking price.</li>
        <li className="rounded-xl bg-white/[0.03] p-3"><Lock className="mb-1 size-4 text-accent" /> Investors make offers — their USDC is locked in escrow.</li>
        <li className="rounded-xl bg-white/[0.03] p-3"><Gavel className="mb-1 size-4 text-accent" /> You accept the offer you like. You get 97%.</li>
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-fg">Asking price ($)</span>
          <input className={`${field} num`} inputMode="decimal" value={ask} onChange={(e) => setAsk(e.target.value)} disabled={tx.pending} />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-fg">Lowest offer you’ll consider ($)</span>
          <input className={`${field} num`} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} disabled={tx.pending} />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-fg"><Timer className="size-4" /> Take offers for</span>
          <select className={field} value={duration} onChange={(e) => setDuration(Number(e.target.value))} disabled={tx.pending}>
            {DURATIONS.map((d) => (
              <option key={d.s} value={d.s}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-fg">Buyer gets access for</span>
          <select className={field} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={tx.pending}>
            {[30, 90, 180, 365].map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </label>
      </div>

      {askUnits && !err && (
        <p className="rounded-xl bg-green/25 px-4 py-3 text-sm text-fg-2">
          If you accept an offer at your asking price you receive <span className="font-bold text-pos">{formatUsdc(splitPayment(askUnits).seller)}</span> (97%). StratX keeps 3%.
        </p>
      )}
      {err && <p className="text-sm text-warn">{err}</p>}
      <ProgramStatusNotice />

      {account.status !== 'signed-in' ? (
        <p className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">Sign in or connect a wallet to start an auction.</p>
      ) : (
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!!err || !ready || tx.pending}>
          <Gavel /> {tx.pending ? 'Waiting for approval…' : 'Start auction'}
        </Button>
      )}
      <TxStatus tx={tx} />
    </form>
  )
}
