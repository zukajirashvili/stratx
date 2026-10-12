import { useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Copy, Droplets, ExternalLink, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from '@/auth/account'
import { Button } from '@/components/ui/button'
import { DEVNET_FAUCET_URL } from '@/solana/network'
import { USDC_FAUCET_URL } from '@/solana/program/constants'
import { SOLANA_NETWORK } from '@/providers/solanaConfig'

/**
 * How to get Devnet test funds: SOL (network fees) and USDC (offers).
 * Both are free test tokens with no monetary value.
 */
export function DevnetFunds({ onFunded, compact = false }: { onFunded?: () => void; compact?: boolean }) {
  const { connection } = useConnection()
  const { publicKey } = useAccount()
  const [state, setState] = useState<{ kind: 'idle' | 'pending' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)
  if (SOLANA_NETWORK !== 'devnet') return null

  const airdrop = async () => {
    if (!publicKey) return
    setState({ kind: 'pending' })
    try {
      const sig = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL)
      const bh = await connection.getLatestBlockhash('confirmed')
      const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed')
      if (res.value.err) throw new Error(JSON.stringify(res.value.err))
      setState({ kind: 'ok', msg: '1 Devnet SOL received.' })
      onFunded?.()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setState({ kind: 'error', msg: /429|rate|limit|airdrop/i.test(m) ? 'The public RPC rate-limited the airdrop — use the SOL faucet link.' : `Airdrop failed: ${m}` })
    }
  }

  return (
    <div className={compact ? 'space-y-2 text-xs' : 'space-y-2.5 rounded-2xl border border-line bg-surface-2 p-4 text-xs'}>
      {!compact && <div className="text-sm font-semibold text-fg">Get free Devnet test funds</div>}
      <ol className="list-decimal space-y-1 pl-4 text-fg-2">
        <li>
          <span className="text-fg">SOL</span> pays network fees:{' '}
          <button type="button" onClick={airdrop} disabled={!publicKey || state.kind === 'pending'} className="font-semibold text-accent hover:underline disabled:opacity-50">
            {state.kind === 'pending' ? <Loader2 className="inline size-3 animate-spin" /> : <Droplets className="inline size-3" />} request 1 SOL
          </button>{' '}
          or use the{' '}
          <a href={DEVNET_FAUCET_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            SOL faucet <ExternalLink className="inline size-3" />
          </a>
          .
        </li>
        <li>
          <span className="text-fg">USDC</span> is what offers are paid in: open the{' '}
          <a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            Circle faucet <ExternalLink className="inline size-3" />
          </a>
          , choose Solana Devnet and paste your address.
        </li>
      </ol>
      {publicKey && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard?.writeText(publicKey.toBase58()).catch(() => {})
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          <Copy /> {copied ? 'Address copied' : 'Copy my address'}
        </Button>
      )}
      {state.msg && <p className={state.kind === 'ok' ? 'text-pos' : 'text-warn'}>{state.msg}</p>}
      <p className="text-faint">Test tokens have no monetary value.</p>
    </div>
  )
}
