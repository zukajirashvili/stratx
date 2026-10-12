import { useConnection } from '@solana/wallet-adapter-react'
import { StatusDot } from '@/components/strategy/AuctionCountdown'
import { Tooltip } from '@/components/ui/tooltip'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useOnchain } from '@/providers/onchain'
import { SOLANA_NETWORK } from '@/providers/solanaConfig'

/**
 * Shows the active Solana cluster and whether the RPC is reachable. Reuses the
 * on-chain index's polling (no extra RPC calls) and checks the genesis hash so
 * a misconfigured RPC shows "Wrong network".
 */
export function NetworkIndicator({ compact = false }: { compact?: boolean }) {
  const { connection } = useConnection()
  const { cluster, status, error, lastUpdated } = useOnchain()
  const isMainnet = SOLANA_NETWORK === 'mainnet-beta'
  const mismatch = !!cluster && cluster !== 'unknown' && cluster !== SOLANA_NETWORK
  const label = mismatch ? 'Wrong network' : isMainnet ? 'Mainnet' : SOLANA_NETWORK === 'testnet' ? 'Testnet' : 'Devnet'
  const health = status === 'error' ? 'down' : status === 'ready' ? 'ok' : 'checking'
  const tone = mismatch || health === 'down' ? 'neg' : health === 'ok' ? 'pos' : 'muted'

  return (
    <Tooltip
      content={
        <div className="space-y-0.5">
          <div className="font-medium text-fg">Solana {label}</div>
          <div>{connection.rpcEndpoint}</div>
          {health === 'ok' && lastUpdated && <div>Checked {formatRelative(new Date(lastUpdated).toISOString())}</div>}
          {health === 'down' && <div className="text-neg">RPC unreachable{error ? `: ${error}` : ''} — retrying.</div>}
          {mismatch && <div className="text-neg">RPC serves {cluster}, but the app expects {SOLANA_NETWORK}.</div>}
          {!isMainnet && <div className="text-warn">Test network. Tokens have no real value.</div>}
        </div>
      }
    >
      <button
        type="button"
        aria-label={`Network: ${label}, ${health === 'ok' ? 'online' : health}`}
        className={cn(
          'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold',
          mismatch ? 'border-neg/40 bg-neg/10 text-neg' : isMainnet ? 'border-line-strong text-fg-2' : 'border-warn/35 bg-warn/[0.08] text-warn',
        )}
      >
        <StatusDot tone={tone} />
        {label}
        {!isMainnet && !compact && <span className="hidden font-normal text-warn/80 xl:inline">· test funds</span>}
      </button>
    </Tooltip>
  )
}
