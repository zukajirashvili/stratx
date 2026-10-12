import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base'
import { useWallet } from '@solana/wallet-adapter-react'
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Mail, ShieldCheck, Usb } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SOCIAL_SETUP_HELP, useAccount } from '@/auth/account'
import { KNOWN_WALLETS, WALLET_ERROR_EVENT, walletErrorMessage } from '@/auth/wallets'
import { Button } from '@/components/ui/button'
import { shortAddress } from '@/lib/format'

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.4 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  )
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
    </svg>
  )
}

function Row({ icon, title, sub, right, onClick, disabled, href }: { icon: ReactNode; title: string; sub?: string; right?: ReactNode; onClick?: () => void; disabled?: boolean; href?: string }) {
  const cls =
    'flex w-full min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-left transition-colors hover:border-accent/60 hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50'
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {right ?? <ArrowRight className="size-4 shrink-0 text-muted" />}
    </>
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {body}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {body}
    </button>
  )
}

/** Google / Apple / email (via Privy) and external wallets, in one friendly panel. */
export function SignInPanel({ onSignedIn }: { onSignedIn?: () => void }) {
  const account = useAccount()
  const { wallets, wallet, select, connect, connecting } = useWallet()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [emailStep, setEmailStep] = useState<'idle' | 'code'>('idle')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Wallet the user just clicked; connected explicitly once it becomes the selected wallet.
  const pendingWallet = useRef<string | null>(null)

  // Wallet-adapter errors (rejected request, locked wallet…) are reported through the provider.
  useEffect(() => {
    const onWalletError = (e: Event) => setError(walletErrorMessage((e as CustomEvent<unknown>).detail))
    window.addEventListener(WALLET_ERROR_EVENT, onWalletError)
    return () => window.removeEventListener(WALLET_ERROR_EVENT, onWalletError)
  }, [])

  // select() only changes the selected wallet; connect once the selection has landed.
  useEffect(() => {
    if (!pendingWallet.current || wallet?.adapter.name !== pendingWallet.current) return
    pendingWallet.current = null
    if (!wallet.adapter.connected) connect().catch((e) => setError(walletErrorMessage(e)))
  }, [wallet, connect])

  const connectWallet = (name: WalletName) => {
    setError(null)
    if (wallet?.adapter.name === name) {
      // Already selected (e.g. an earlier attempt was dismissed): select() would be a no-op.
      connect().catch((e) => setError(walletErrorMessage(e)))
      return
    }
    pendingWallet.current = name
    select(name)
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (account.status === 'signed-in') {
    return (
      <div className="rounded-2xl border border-green-strong/60 bg-green/30 p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-pos" />
          <div>
            <div className="font-semibold text-fg">You're signed in</div>
            <div className="text-sm text-fg-2">
              {account.label ?? 'Wallet'} · {account.publicKey ? shortAddress(account.publicKey.toBase58(), 5) : 'creating wallet…'}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {onSignedIn && (
            <Button variant="primary" onClick={onSignedIn}>
              Continue <ArrowRight />
            </Button>
          )}
          <Button variant="ghost" onClick={() => account.signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  const socialDisabled = !account.socialAvailable

  return (
    <div className="space-y-6">
      <section aria-labelledby="signin-social">
        <h2 id="signin-social" className="mb-3 text-sm font-semibold text-fg-2">
          Sign in with an account
        </h2>
        <div className="space-y-2.5">
          <Row icon={<GoogleLogo />} title="Continue with Google" onClick={() => run('google', () => account.signInWithOAuth('google'))} disabled={socialDisabled || !!busy} right={busy === 'google' ? <Loader2 className="size-4 animate-spin" /> : undefined} />
          <Row icon={<AppleLogo />} title="Continue with Apple" onClick={() => run('apple', () => account.signInWithOAuth('apple'))} disabled={socialDisabled || !!busy} right={busy === 'apple' ? <Loader2 className="size-4 animate-spin" /> : undefined} />
          <form
            className="rounded-2xl border border-line bg-surface-2 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (emailStep === 'idle') run('email', async () => {
                await account.sendEmailCode(email.trim())
                setEmailStep('code')
              })
              else run('code', async () => account.verifyEmailCode(code.trim()))
            }}
          >
            <label htmlFor="signin-email" className="flex items-center gap-2 px-1 pb-2 text-sm font-semibold text-fg">
              <Mail className="size-4 text-accent" /> {emailStep === 'idle' ? 'Continue with email' : `Enter the code sent to ${email}`}
            </label>
            <div className="flex gap-2">
              {emailStep === 'idle' ? (
                <input
                  id="signin-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={socialDisabled}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-bg px-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-50"
                />
              ) : (
                <input
                  id="signin-email"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-bg px-3 text-sm tracking-widest text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
              )}
              <Button type="submit" variant="primary" size="lg" className="h-11" disabled={socialDisabled || !!busy}>
                {busy === 'email' || busy === 'code' ? <Loader2 className="animate-spin" /> : emailStep === 'idle' ? 'Send code' : 'Verify'}
              </Button>
            </div>
            {emailStep === 'code' && (
              <button type="button" className="mt-2 px-1 text-xs text-muted hover:text-fg" onClick={() => setEmailStep('idle')}>
                Use a different email
              </button>
            )}
          </form>
        </div>
        {socialDisabled && <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">{SOCIAL_SETUP_HELP}</p>}
        {!socialDisabled && <p className="mt-2 text-xs text-muted">We create a secure Solana wallet for you automatically — no seed phrase to manage.</p>}
      </section>

      <div className="flex items-center gap-3 text-xs text-faint">
        <span className="h-px flex-1 bg-line" /> or connect a wallet <span className="h-px flex-1 bg-line" />
      </div>

      <section aria-label="Wallets" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {KNOWN_WALLETS.map((kw) => {
          const w = wallets.find((x) => x.adapter.name.toLowerCase() === kw.name.toLowerCase())
          const ready = w && (w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable)
          const icon = w?.adapter.icon ? (
            <img src={w.adapter.icon} alt="" className="size-6 rounded-md" />
          ) : kw.hardware ? (
            <Usb className="size-5 text-fg-2" />
          ) : (
            <span className="text-sm font-bold text-fg-2">{kw.label[0]}</span>
          )
          if (!ready) {
            return (
              <Row
                key={kw.name}
                href={kw.installUrl}
                icon={icon}
                title={kw.label}
                sub={kw.hardware ? 'Needs a Chromium browser with USB (WebHID)' : 'Not installed — tap to get it'}
                right={<ExternalLink className="size-4 shrink-0 text-muted" />}
              />
            )
          }
          return (
            <Row
              key={kw.name}
              icon={icon}
              title={kw.label}
              sub={kw.note ?? 'Detected'}
              onClick={() => connectWallet(w!.adapter.name as WalletName)}
              disabled={connecting}
              right={connecting ? <Loader2 className="size-4 animate-spin" /> : undefined}
            />
          )
        })}
      </section>

      {error && <p role="alert" className="rounded-xl bg-neg/10 px-3 py-2 text-sm text-neg">{error}</p>}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-pos" />
        StratX never asks for your seed phrase or private key. Every transaction needs your approval. This MVP runs on Solana Devnet with
        test funds.
      </p>
    </div>
  )
}
