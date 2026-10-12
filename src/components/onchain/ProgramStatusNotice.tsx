import { AlertTriangle, Loader2 } from 'lucide-react'
import { useOnchain } from '@/providers/onchain'
import { shortAddress } from '@/lib/format'

/** Explains why on-chain actions are unavailable, if they are. Renders nothing when ready. */
export function ProgramStatusNotice({ className }: { className?: string }) {
  const { status, error, cluster, program } = useOnchain()
  if (status === 'loading' && !program) {
    return (
      <div className={`flex items-center gap-2 text-xs text-muted ${className ?? ''}`}>
        <Loader2 className="size-3.5 animate-spin" /> Checking the auction program on Devnet…
      </div>
    )
  }
  let title: string | null = null
  let body: string | null = null
  if (status === 'error') {
    title = 'Could not reach Solana'
    body = error ?? 'RPC error'
  } else if (cluster && cluster !== 'devnet') {
    title = `Wrong network: the app RPC is ${cluster}`
    body = 'On-chain auctions require Solana Devnet. Set VITE_SOLANA_NETWORK=devnet (or a Devnet VITE_SOLANA_RPC_URL).'
  } else if (program?.kind === 'not-deployed') {
    title = 'Auction program not deployed'
    body = `No executable program at ${shortAddress(program.programId.toBase58(), 6)} on Devnet yet, so starting auctions and making offers is switched off. Setup steps: docs/AUCTION.md.`
  } else if (program?.kind === 'config-missing') {
    title = 'Auction program not initialised'
    body = 'The program is deployed but its fee configuration has not been created. Run scripts/init-config.ts (docs/AUCTION.md).'
  }
  if (!title) return null
  return (
    <div role="status" className={`flex gap-2 rounded-md border border-warn/30 bg-warn/[0.06] p-3 text-xs ${className ?? ''}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <div>
        <div className="font-medium text-fg">{title}</div>
        <p className="mt-0.5 text-fg-2">{body}</p>
      </div>
    </div>
  )
}
