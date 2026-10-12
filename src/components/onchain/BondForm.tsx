import { useConnection } from '@solana/wallet-adapter-react'
import { HandHeart, Lock, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from '@/auth/account'
import { DevnetFunds } from '@/components/onchain/DevnetFunds'
import { ProgramStatusNotice } from '@/components/onchain/ProgramStatusNotice'
import { TxStatus } from '@/components/onchain/TxStatus'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/useAsync'
import { useTxRunner } from '@/hooks/useTxRunner'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { useOnchain } from '@/providers/onchain'
import { postBond } from '@/solana/actions'
import { fetchCharities } from '@/solana/program/client'
import { PROGRAM_ERRORS } from '@/solana/program/constants'
import { formatUsdc, parseUsdc, validateBond } from '@/solana/program/pricing'

const LOCKS = [30, 90, 180, 365]
const field = 'h-12 w-full rounded-xl border border-line-strong bg-bg px-3 text-base text-fg focus:border-accent focus:outline-none disabled:opacity-50'

/**
 * Quant puts USDC behind the claim that a strategy's published results are
 * genuine. Real Devnet transaction; the money sits in a program escrow.
 */
export function BondForm({ strategyId, onDone }: { strategyId: string; onDone?: () => void }) {
  const { connection } = useConnection()
  const account = useAccount()
  const { program, refresh } = useOnchain()
  const usdc = useUsdcBalance()
  const tx = useTxRunner()
  const [amount, setAmount] = useState('100')
  const [days, setDays] = useState(90)
  const [charity, setCharity] = useState(0)
  const ready = program?.kind === 'ready'
  const charities = useAsync(() => (ready ? fetchCharities(connection, program.programId) : Promise.resolve([])), [ready, connection])

  const units = parseUsdc(amount)
  const err =
    units === null
      ? 'Enter an amount in dollars, e.g. 100.'
      : (() => {
          const e = validateBond({ amount: units, lockDays: days })
          return e ? (PROGRAM_ERRORS.find(([n]) => n === e)?.[1] ?? e) : null
        })()
  const list = charities.data ?? []
  const chosen = list[charity]
  const short = units !== null && usdc.units !== null && usdc.units < units

  if (tx.phase === 'confirmed') {
    return (
      <div className="space-y-4">
        <TxStatus tx={tx} successText="Your bond is locked on Solana Devnet." />
        <p className="text-sm text-fg-2">Investors now see that you put {units !== null ? formatUsdc(units, { decimals: 0 }) : 'money'} behind your results.</p>
        {onDone && (
          <Button variant="primary" onClick={onDone}>
            Continue
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
        if (err || units === null || !ready || !chosen) return
        tx.run((onPhase) =>
          postBond({ connection, wallet: account.signer, program: program!, input: { strategyId, amount: units, lockDays: days, charityIndex: charity }, onPhase, refresh }),
        )
      }}
    >
      <ol className="grid gap-2 text-xs text-fg-2 sm:grid-cols-3">
        <li className="rounded-xl bg-white/[0.03] p-3"><Lock className="mb-1 size-4 text-accent" /> You lock USDC behind your claim that your results are real.</li>
        <li className="rounded-xl bg-white/[0.03] p-3"><HandHeart className="mb-1 size-4 text-accent" /> If they’re proven false, it goes to the charity you pick, not to StratX.</li>
        <li className="rounded-xl bg-white/[0.03] p-3"><ShieldCheck className="mb-1 size-4 text-accent" /> Otherwise you take it all back when the lock period ends.</li>
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-fg">Bond amount ($ USDC)</span>
          <input className={`${field} num`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={tx.pending} />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-fg">Locked for</span>
          <select className={field} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={tx.pending}>
            {LOCKS.map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-fg">If your results are proven false, send it to</span>
          <select className={field} value={charity} onChange={(e) => setCharity(Number(e.target.value))} disabled={tx.pending || list.length === 0}>
            {list.length === 0 && <option>{charities.status === 'loading' ? 'Loading charities…' : 'No charities set up yet'}</option>}
            {list.map((c, i) => (
              <option key={c.wallet.toBase58()} value={i}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="rounded-xl bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-fg-2">
        Who decides? The StratX admin reviews reports about a strategy. If its published results turn out to be false, the admin sends the bond to your charity. Every decision is a public transaction on Solana.
      </p>
      {err && <p className="text-sm text-warn">{err}</p>}
      <ProgramStatusNotice />

      {account.status !== 'signed-in' ? (
        <p className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">Sign in or connect a wallet to post a bond.</p>
      ) : (
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!!err || !ready || !chosen || short || tx.pending}>
          <ShieldCheck /> {tx.pending ? 'Waiting for approval…' : `Lock ${units !== null && !err ? formatUsdc(units, { decimals: 0 }) : ''} bond`}
        </Button>
      )}
      {account.publicKey && (usdc.units === null || short) && (
        <div className="space-y-2">
          <p className="text-xs text-warn">You need {units !== null ? formatUsdc(units, { decimals: 0 }) : 'some'} in Devnet USDC for this bond. You have {usdc.units === null ? 'none' : formatUsdc(usdc.units)}.</p>
          <DevnetFunds compact onFunded={usdc.refresh} />
        </div>
      )}
      <TxStatus tx={tx} />
    </form>
  )
}
