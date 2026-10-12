import { CheckCircle2, ExternalLink, Loader2, PenLine, Send, ShieldX, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { TxState } from '@/hooks/useTxRunner'
import { cn } from '@/lib/utils'
import { explorerTxUrl } from '@/solana/tx'

const STEPS = [
  { phase: 'preparing', label: 'Checking network & simulating', icon: Loader2 },
  { phase: 'awaiting-signature', label: 'Approve in your wallet', icon: PenLine },
  { phase: 'submitted', label: 'Submitted — waiting for confirmation', icon: Send },
] as const

/** Renders the lifecycle of a single transaction: pending → confirmed / rejected / failed. */
export function TxStatus({ tx, successText = 'Confirmed on Solana Devnet.' }: { tx: TxState; successText?: string }) {
  const [showLogs, setShowLogs] = useState(false)
  if (tx.phase === 'idle') return null

  if (tx.phase === 'confirmed' && tx.signature) {
    return (
      <div role="status" className="rounded-md border border-pos/40 bg-pos/[0.06] p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-pos">
          <CheckCircle2 className="size-4" /> {successText}
        </div>
        <a
          href={explorerTxUrl(tx.signature)}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-accent hover:underline"
        >
          {tx.signature} <ExternalLink className="size-3 shrink-0" />
        </a>
      </div>
    )
  }

  if (tx.phase === 'rejected' || tx.phase === 'failed') {
    const Icon = tx.phase === 'rejected' ? ShieldX : XCircle
    return (
      <div role="alert" className={cn('rounded-md border p-3 text-sm', tx.phase === 'rejected' ? 'border-line-strong bg-surface-2' : 'border-neg/40 bg-neg/[0.06]')}>
        <div className={cn('flex items-center gap-2 font-medium', tx.phase === 'rejected' ? 'text-fg-2' : 'text-neg')}>
          <Icon className="size-4" /> {tx.phase === 'rejected' ? 'Rejected in wallet' : 'Transaction failed'}
        </div>
        <p className="mt-1 text-xs text-fg-2">
          {tx.failure?.message}
          {tx.failure?.programError && <span className="ml-1 font-mono text-faint">({tx.failure.programError})</span>}
        </p>
        {tx.signature && (
          <a href={explorerTxUrl(tx.signature)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
            View failed transaction <ExternalLink className="size-3" />
          </a>
        )}
        {tx.failure?.logs?.length ? (
          <div className="mt-1.5">
            <button type="button" onClick={() => setShowLogs((s) => !s)} className="text-[11px] text-muted hover:text-fg">
              {showLogs ? 'Hide' : 'Show'} program logs
            </button>
            {showLogs && (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-bg p-2 text-[10px] leading-relaxed text-muted">{tx.failure.logs.join('\n')}</pre>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  const current = STEPS.findIndex((s) => s.phase === tx.phase)
  return (
    <ol role="status" aria-live="polite" className="space-y-1.5 rounded-md border border-line bg-surface-2 p-3">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s.phase} className={cn('flex items-center gap-2 text-xs', active ? 'text-fg' : done ? 'text-pos' : 'text-faint')}>
            {done ? <CheckCircle2 className="size-3.5" /> : <s.icon className={cn('size-3.5', active && 'animate-spin [animation-duration:1.5s]', active && s.phase !== 'preparing' && 'animate-none')} />}
            {s.label}
            {active && s.phase === 'submitted' && tx.signature && (
              <a href={explorerTxUrl(tx.signature)} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">
                Explorer
              </a>
            )}
          </li>
        )
      })}
    </ol>
  )
}
