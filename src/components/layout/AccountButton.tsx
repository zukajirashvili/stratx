import { Check, ChevronDown, Copy, ExternalLink, LogIn, LogOut, Mail, PenTool, RefreshCw, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '@/auth/account'
import { SignInPanel } from '@/components/auth/SignInPanel'
import { DevnetFunds } from '@/components/onchain/DevnetFunds'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useSolBalance } from '@/hooks/useSolBalance'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { shortAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { explorerAddressUrl, SOLANA_NETWORK } from '@/providers/solanaConfig'
import { formatUsdc } from '@/solana/program/pricing'

/** Header account control: "Sign in" when signed out; account menu with balances when signed in. */
export function AccountButton({ className }: { className?: string }) {
  const account = useAccount()
  const sol = useSolBalance()
  const usdc = useUsdcBalance()
  const [open, setOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (account.status !== 'signed-in') {
    return (
      <>
        <Button variant="primary" size="sm" className={className} onClick={() => setSignInOpen(true)} disabled={account.status === 'loading'}>
          <LogIn /> {account.status === 'loading' ? 'Loading…' : 'Sign in'}
        </Button>
        <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
          <DialogContent title="Sign in to StratX" description="Use Google, Apple, email, or your own Solana wallet." className="max-w-lg">
            <SignInPanel onSignedIn={() => setSignInOpen(false)} />
          </DialogContent>
        </Dialog>
      </>
    )
  }

  const address = account.publicKey?.toBase58() ?? null
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg-2 hover:bg-surface-3 hover:text-fg [&_svg]:size-4'
  const MethodIcon = account.method === 'wallet' ? Wallet : Mail

  return (
    <div ref={ref} className={cn('relative', className)}>
      <Button size="sm" variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MethodIcon />
        <span className="hidden max-w-32 truncate sm:inline">{account.method === 'wallet' ? (address ? shortAddress(address) : account.label) : account.label}</span>
        <ChevronDown className="text-muted" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-line-strong bg-surface-2 p-2 shadow-2xl">
          <div className="rounded-xl bg-bg/60 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {account.method === 'wallet' ? account.label : `Signed in with ${account.method}`}
            </div>
            {account.method !== 'wallet' && <div className="truncate text-sm text-fg">{account.label}</div>}
            <div className="num mt-1 break-all text-xs text-fg-2">{address ?? 'Creating your wallet…'}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/[0.04] p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted">SOL</div>
                <div className="num text-sm font-bold text-fg">{sol.balance === null ? '…' : sol.balance.toFixed(3)}</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted">USDC</div>
                <div className="num text-sm font-bold text-fg">{usdc.units === null ? (usdc.loaded ? '0' : '…') : formatUsdc(usdc.units, { symbol: false })}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-warn">{SOLANA_NETWORK} · test funds only</span>
              <button type="button" onClick={() => { sol.refresh(); usdc.refresh() }} aria-label="Refresh balances" className="rounded p-1 text-muted hover:text-fg">
                <RefreshCw className="size-3.5" />
              </button>
            </div>
          </div>
          {((sol.balance ?? 0) < 0.05 || (usdc.units ?? 0n) === 0n) && (
            <div className="px-2 pt-3">
              <DevnetFunds compact onFunded={sol.refresh} />
            </div>
          )}
          <div className="mt-2 border-t border-line pt-2">
            {address && (
              <>
                <button
                  role="menuitem"
                  type="button"
                  className={item}
                  onClick={async () => {
                    await navigator.clipboard?.writeText(address).catch(() => {})
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  {copied ? <Check className="text-pos" /> : <Copy />} {copied ? 'Copied' : 'Copy address'}
                </button>
                <a role="menuitem" className={item} href={explorerAddressUrl(address)} target="_blank" rel="noreferrer">
                  <ExternalLink /> View on Solana Explorer
                </a>
              </>
            )}
            <Link role="menuitem" to="/creator" className={item} onClick={() => setOpen(false)}>
              <PenTool /> My strategies
            </Link>
            <button role="menuitem" type="button" className={cn(item, 'hover:text-neg')} onClick={() => { setOpen(false); account.signOut().catch(() => {}) }}>
              <LogOut /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
