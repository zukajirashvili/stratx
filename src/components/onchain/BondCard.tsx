import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { HandHeart, ShieldCheck, ShieldX, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from '@/auth/account'
import { BondForm } from '@/components/onchain/BondForm'
import { TxStatus } from '@/components/onchain/TxStatus'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/useAsync'
import { useNow } from '@/hooks/useNow'
import { useTxRunner } from '@/hooks/useTxRunner'
import { formatDateTime, shortAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { clusterNowSec, useOnchain } from '@/providers/onchain'
import { releaseBond } from '@/solana/actions'
import { fetchBondsFor, fetchCharities, type OnchainBond } from '@/solana/program/client'
import { formatUsdc } from '@/solana/program/pricing'

/**
 * Truth bonds posted on-chain for a strategy: who put money behind its
 * results, how much, until when, and which charity gets it if they're false.
 * `canPost` shows the bond form to the strategy's creator when they have none.
 */
export function BondCard({ strategyId, canPost = false, ownerWallet }: { strategyId: string; canPost?: boolean; ownerWallet?: string }) {
  const { connection } = useConnection()
  const { program, listings, lastUpdated } = useOnchain()
  const account = useAccount()
  const [posting, setPosting] = useState(false)
  const ready = program?.kind === 'ready'
  // A bond is keyed by (quant, strategy): look up the wallets that could have posted one.
  const quants = [
    ...listings.filter((l) => l.account.strategyId === strategyId).map((l) => l.account.seller.toBase58()),
    ...(account.publicKey ? [account.publicKey.toBase58()] : []),
    ...(ownerWallet ? [ownerWallet] : []),
  ]
  const quantsKey = [...new Set(quants)].sort().join(',')
  const data = useAsync(
    async () =>
      ready
        ? Promise.all([
            fetchBondsFor(connection, strategyId, quantsKey ? quantsKey.split(',').map((q) => new PublicKey(q)) : [], program.programId),
            fetchCharities(connection, program.programId),
          ])
        : ([[], []] as const),
    [ready, connection, strategyId, quantsKey, lastUpdated],
  )
  if (!ready) return null

  const [bonds, charities] = data.data ?? [[], []]
  const charityName = (b: OnchainBond) => charities.find((c) => c.wallet.equals(b.account.charity))?.name ?? shortAddress(b.account.charity.toBase58(), 4)
  const mine = account.publicKey ? bonds.find((b) => b.account.quant.equals(account.publicKey!)) : undefined

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-5 text-accent" />
        <h3 className="font-bold text-fg">Money behind the results</h3>
      </div>
      {data.status === 'loading' && <p className="text-sm text-muted">Checking Solana Devnet…</p>}
      {data.status === 'error' && (
        <p className="text-sm text-warn">
          Couldn’t load bonds from Solana Devnet. <button type="button" className="font-semibold underline" onClick={data.retry}>Try again</button>
        </p>
      )}
      {data.status === 'success' && bonds.length === 0 && !posting && (
        <p className="text-sm text-fg-2">No bond yet. A bond is USDC the creator locks on-chain behind the claim that these results are real.</p>
      )}
      <ul className="space-y-3">
        {bonds.map((b) => (
          <BondRow key={b.address.toBase58()} bond={b} charity={charityName(b)} isMine={!!account.publicKey && b.account.quant.equals(account.publicKey)} />
        ))}
      </ul>
      {canPost && !mine && data.status === 'success' && (
        <div className="mt-4">
          {posting ? (
            <BondForm strategyId={strategyId} onDone={() => setPosting(false)} />
          ) : (
            <Button variant="primary" onClick={() => setPosting(true)}>
              <ShieldCheck /> Put money behind my results
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

function BondRow({ bond, charity, isMine }: { bond: OnchainBond; charity: string; isMine: boolean }) {
  const { connection } = useConnection()
  const account = useAccount()
  const { program, clockOffsetSec, refresh } = useOnchain()
  const now = Math.floor(clusterNowSec(useNow(), clockOffsetSec))
  const tx = useTxRunner()
  const b = bond.account
  const unlocked = now >= Number(b.unlockAt)
  const amount = formatUsdc(b.amount, { decimals: 0 })

  return (
    <li className={cn('rounded-xl p-4 text-sm', b.status === 'slashed' ? 'bg-neg/10' : 'bg-green/20')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-lg font-extrabold text-fg num">{amount}</span>
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', b.status === 'active' ? 'bg-pos/15 text-pos' : b.status === 'slashed' ? 'bg-neg/15 text-neg' : 'bg-white/10 text-fg-2')}>
          {b.status === 'slashed' ? <ShieldX className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
          {b.status === 'active' ? 'Locked' : b.status === 'slashed' ? 'Sent to charity' : 'Returned to creator'}
        </span>
      </div>
      <p className="mt-1 text-fg-2">
        {b.status === 'active' && <>Locked by {isMine ? 'you' : shortAddress(b.quant.toBase58(), 4)} until {formatDateTime(new Date(Number(b.unlockAt) * 1000).toISOString())}.</>}
        {b.status === 'slashed' && <>The results were found to be false, so the bond went to {charity}. </>}
        {b.status === 'released' && <>The lock period ended without the results being proven false. </>}
      </p>
      {b.status === 'active' && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-2">
          <HandHeart className="size-3.5 text-accent" /> If the results are proven false, it goes to <span className="font-semibold text-fg">{charity}</span>.
        </p>
      )}
      {isMine && b.status === 'active' && unlocked && (
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={tx.pending || program?.kind !== 'ready'}
          onClick={() => tx.run((onPhase) => releaseBond({ connection, wallet: account.signer, program: program!, strategyId: b.strategyId, nowSec: now, onPhase, refresh }))}
        >
          <Undo2 /> {tx.pending ? 'Waiting for approval…' : 'Take my bond back'}
        </Button>
      )}
      <TxStatus tx={tx} successText="Your bond is back in your wallet." />
    </li>
  )
}
