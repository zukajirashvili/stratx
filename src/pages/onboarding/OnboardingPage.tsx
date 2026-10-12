import { useAccount } from '@/auth/account'
import { SignInPanel } from '@/components/auth/SignInPanel'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  EyeOff,
  FlaskConical,
  Gavel,
  Layers,
  LineChart,
  Lock,
  PenTool,
  Search,
  ShieldCheck,
  Trophy,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo, LogoFull } from '@/components/layout/Logo'
import { NetworkIndicator } from '@/components/layout/NetworkIndicator'
import { TierLabel } from '@/components/reputation/TierLabel'
import { RiskBadge } from '@/components/strategy/badges'
import { Button } from '@/components/ui/button'
import { ChoiceCard, Chip, Panel } from '@/components/ui/misc'
import { shortAddress } from '@/lib/format'
import { ASSET_LABEL, ASSET_ORDER, RISK_LABEL, STYLE_LABEL, TIER_LABEL } from '@/lib/labels'
import { TIER_ORDER } from '@/reputation/display'
import { cn } from '@/lib/utils'
import { CreatorDisclosurePreview, DISCLOSURE_OPTIONS } from '@/pages/creator/CreatorDisclosurePreview'
import { usePreferences } from '@/providers/preferences'
import type { RiskLevel, StrategyStyle } from '@/types/strategy'
import type { CreatorProfile, InvestorProfile, UserProfile, UserRole } from '@/types/user'

type StepKey = 'welcome' | 'signin' | 'role' | 'investor' | 'creator' | 'disclosures' | 'done'

const DEFAULT_INVESTOR: InvestorProfile = {
  riskTolerance: 'moderate',
  assetInterests: [],
  minTier: 'silver',
  budgetSol: null,
}

const DEFAULT_CREATOR: CreatorProfile = {
  displayName: '',
  styles: [],
  disclosures: ['Daily NAV series', 'Aggregate risk metrics'],
  verificationPlan: 'attested',
}

function StepHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-[11px] font-medium uppercase tracking-wide text-accent">{eyebrow}</div>
      <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
      {description && <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>}
    </div>
  )
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-line bg-surface p-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong text-accent [&_svg]:size-4">
        {icon}
      </span>
      <div>
        <div className="text-sm font-medium text-fg">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  )
}

function AckCheckbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors',
        checked ? 'border-accent/50 bg-accent/[0.05]' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span className="text-sm leading-relaxed text-fg-2">{children}</span>
    </label>
  )
}

export function OnboardingPage() {
  const { profile, saveProfile, resetProfile } = usePreferences()
  const navigate = useNavigate()
  const account = useAccount()
  const publicKey = account.publicKey

  // Captured once: saving the profile mid-flow must not flip a first-run into "edit" mode.
  const [editing] = useState(() => profile.status === 'complete')
  const [role, setRole] = useState<UserRole | null>(profile.role)
  const [investor, setInvestor] = useState<InvestorProfile>(profile.investor ?? DEFAULT_INVESTOR)
  const [creator, setCreator] = useState<CreatorProfile>(profile.creator ?? DEFAULT_CREATOR)
  const [ackDemo, setAckDemo] = useState(profile.acknowledgedDemo)
  const [ackRisk, setAckRisk] = useState(profile.acknowledgedRisk)
  const [budgetInput, setBudgetInput] = useState(profile.investor?.budgetSol?.toString() ?? '')

  const steps = useMemo<StepKey[]>(() => {
    const s: StepKey[] = ['welcome', 'signin', 'role']
    if (role === 'investor' || role === 'both') s.push('investor')
    if (role === 'creator' || role === 'both') s.push('creator')
    s.push('disclosures', 'done')
    return s
  }, [role])

  const [stepIdx, setStepIdx] = useState(editing ? 1 : 0)
  const step = steps[Math.min(stepIdx, steps.length - 1)]

  // When sign-in completes (wallet approved, or back from Google/Apple/email), go straight
  // to "How will you use StratX?". OAuth returns reload the page, so the step can't be kept.
  const [seenStatus, setSeenStatus] = useState(account.status)
  if (account.status !== seenStatus) {
    setSeenStatus(account.status)
    if (account.status === 'signed-in' && stepIdx < steps.indexOf('role')) setStepIdx(steps.indexOf('role'))
  }

  const canContinue =
    step === 'role'
      ? role !== null
      : step === 'creator'
        ? creator.displayName.trim().length >= 2 && creator.styles.length > 0
        : step === 'disclosures'
          ? ackDemo && ackRisk
          : true

  const buildProfile = (status: UserProfile['status']): UserProfile => ({
    status,
    role,
    investor: role === 'investor' || role === 'both' ? { ...investor, budgetSol: budgetInput ? Number(budgetInput) : null } : null,
    creator: role === 'creator' || role === 'both' ? { ...creator, displayName: creator.displayName.trim() } : null,
    acknowledgedDemo: ackDemo,
    acknowledgedRisk: ackRisk,
    walletAtOnboarding: publicKey?.toBase58() ?? null,
    completedAt: status === 'complete' ? new Date().toISOString() : null,
  })

  const next = () => {
    if (step === 'disclosures') saveProfile(buildProfile('complete'))
    setStepIdx((i) => Math.min(i + 1, steps.length - 1))
    window.scrollTo(0, 0)
  }
  const back = () => setStepIdx((i) => Math.max(0, i - 1))
  const skip = () => {
    if (!editing) saveProfile({ ...buildProfile('skipped'), acknowledgedDemo: false, acknowledgedRisk: false })
    navigate('/explore')
  }

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const progressSteps: StepKey[] = steps.filter((s) => s !== 'welcome' && s !== 'done')
  const progressIdx = progressSteps.indexOf(step)

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <NetworkIndicator compact />
            {step !== 'done' && (
              <Button variant="ghost" size="sm" onClick={skip}>
                {editing ? 'Cancel' : 'Skip for now'}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {progressIdx >= 0 && (
          <div className="mb-8">
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>
                Step {progressIdx + 1} of {progressSteps.length}
              </span>
              <span className="capitalize">{step === 'disclosures' ? 'Acknowledgements' : step === 'signin' ? 'Sign in' : step === 'creator' ? 'Quant profile' : step}</span>
            </div>
            <div
              className="flex gap-1"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={progressSteps.length}
              aria-valuenow={progressIdx + 1}
              aria-label="Onboarding progress"
            >
              {progressSteps.map((s, i) => (
                <span key={s} className={cn('h-1 flex-1 rounded-full', i <= progressIdx ? 'bg-accent' : 'bg-surface-3')} />
              ))}
            </div>
          </div>
        )}

        {step === 'welcome' && (
          <div>
            <LogoFull className="mx-auto mb-8 w-48 sm:w-56" />
            <StepHeader
              eyebrow="Welcome to StratX"
              title="Access quantitative strategies without exposing their edge"
              description="StratX lets creators prove how a strategy performs — and sell time-limited access through on-chain auctions — while the strategy itself stays private."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Feature icon={<Search />} title="Discover">
                Search in plain language and compare strategies on risk-adjusted metrics, not marketing.
              </Feature>
              <Feature icon={<Trophy />} title="Evaluate reputation">
                A seven-factor score combines track record, drawdown control and verification depth.
              </Feature>
              <Feature icon={<Gavel />} title="Acquire access">
                Make an offer in USDC. It stays in escrow until the quant accepts, and comes back if they don’t.
              </Feature>
              <Feature icon={<Lock />} title="Privacy by design">
                Source code, signals and live positions are never shown — only metrics the creator authorises.
              </Feature>
            </div>
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-dashed border-warn/40 bg-warn/[0.04] p-3.5 text-sm text-fg-2">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-warn" />
              <p>
                This is a hackathon MVP running on Solana <span className="text-fg">Devnet</span>. Strategies, scores
                and demo auctions are <span className="text-fg">demo data</span>; auctions marked “On-chain · Devnet”
                are real Devnet program accounts paid in test USDC.
              </p>
            </div>
            <div className="mt-8 flex justify-end">
              <Button variant="primary" size="lg" onClick={next}>
                Get started <ArrowRight />
              </Button>
            </div>
          </div>
        )}

        {step === 'role' && (
          <div>
            <StepHeader
              eyebrow="Your role"
              title="How will you use StratX?"
              description="This tailors the rest of setup. You can change it any time from Preferences."
            />
            <div role="radiogroup" aria-label="Role" className="space-y-2.5">
              <ChoiceCard
                selected={role === 'investor'}
                onSelect={() => setRole('investor')}
                icon={<LineChart />}
                title="Investor"
                description="Discover and evaluate strategies, and make offers for access in auctions."
              />
              <ChoiceCard
                selected={role === 'creator'}
                onSelect={() => setRole('creator')}
                icon={<PenTool />}
                title="Strategy creator"
                description="Publish verified performance and sell access without revealing your logic."
              />
              <ChoiceCard
                selected={role === 'both'}
                onSelect={() => setRole('both')}
                icon={<Layers />}
                title="Both"
                description="Set up investor preferences and a creator profile."
              />
            </div>
          </div>
        )}

        {step === 'signin' && (
          <div>
            <StepHeader
              eyebrow="Sign in"
              title="Create your StratX account"
              description="Sign in with Google, Apple or email — we’ll set up a Solana wallet for you — or connect the wallet you already use."
            />
            <SignInPanel onSignedIn={next} />
          </div>
        )}

        {step === 'investor' && (
          <div>
            <StepHeader
              eyebrow="Investor preferences"
              title="What are you looking for?"
              description='These power the "For you" view on Explore. Nothing here is investment advice.'
            />
            <fieldset>
              <legend className="mb-2.5 text-sm font-medium text-fg">Risk tolerance</legend>
              <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-3">
                {(
                  [
                    ['low', 'Prefer steady returns; drawdowns under ~12%.'],
                    ['moderate', 'Accept swings for higher returns; drawdowns to ~30%.'],
                    ['high', 'Comfortable with large drawdowns and volatility.'],
                  ] as [RiskLevel, string][]
                ).map(([r, d]) => (
                  <ChoiceCard
                    key={r}
                    selected={investor.riskTolerance === r}
                    onSelect={() => setInvestor({ ...investor, riskTolerance: r })}
                    title={<RiskBadge risk={r} />}
                    description={d}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-7">
              <legend className="mb-1 text-sm font-medium text-fg">Markets of interest</legend>
              <p className="mb-2.5 text-xs text-muted">Leave empty to include all markets.</p>
              <div className="flex flex-wrap gap-1.5">
                {ASSET_ORDER.map((a) => (
                  <Chip
                    key={a}
                    selected={investor.assetInterests.includes(a)}
                    onClick={() => setInvestor({ ...investor, assetInterests: toggleIn(investor.assetInterests, a) })}
                  >
                    {ASSET_LABEL[a]}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-7">
              <legend className="mb-2.5 text-sm font-medium text-fg">Minimum reputation tier</legend>
              <div className="flex flex-wrap gap-2">
                {TIER_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={investor.minTier === t}
                    onClick={() => setInvestor({ ...investor, minTier: t })}
                    className={cn(
                      'rounded-md border p-1.5 transition-colors',
                      investor.minTier === t ? 'border-accent/60 bg-accent/[0.07]' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <TierLabel tier={t} />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Shows {TIER_LABEL[investor.minTier]} and above.
              </p>
            </fieldset>

            <div className="mt-7">
              <label htmlFor="budget" className="text-sm font-medium text-fg">
                Typical access budget <span className="font-normal text-muted">(optional)</span>
              </label>
              <div className="relative mt-2 max-w-48">
                <input
                  id="budget"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="e.g. 40"
                  className="h-9 w-full rounded-md border border-line-strong bg-surface pl-3 pr-12 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">SOL</span>
              </div>
            </div>
          </div>
        )}

        {step === 'creator' && (
          <div>
            <StepHeader
              eyebrow="Creator profile"
              title="Set up how your strategy is presented"
              description="Decide what investors can see. Everything you don't select stays private — StratX never displays source code, signal logic or positions."
            />
            <div>
              <label htmlFor="creator-name" className="text-sm font-medium text-fg">Public display name</label>
              <input
                id="creator-name"
                value={creator.displayName}
                onChange={(e) => setCreator({ ...creator, displayName: e.target.value })}
                placeholder="e.g. Meridian Labs"
                maxLength={40}
                className="mt-2 h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
              />
            </div>
            <fieldset className="mt-6">
              <legend className="mb-2.5 text-sm font-medium text-fg">Strategy styles you run</legend>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STYLE_LABEL) as StrategyStyle[]).map((st) => (
                  <Chip
                    key={st}
                    selected={creator.styles.includes(st)}
                    onClick={() => setCreator({ ...creator, styles: toggleIn(creator.styles, st) })}
                  >
                    {STYLE_LABEL[st]}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-6">
              <legend className="mb-2.5 text-sm font-medium text-fg">How will performance be verified?</legend>
              <div role="radiogroup" className="space-y-2">
                <ChoiceCard
                  selected={creator.verificationPlan === 'attested'}
                  onSelect={() => setCreator({ ...creator, verificationPlan: 'attested' })}
                  icon={<ShieldCheck />}
                  title="On-chain attestation"
                  description="Trades settle on Solana; NAV is attested by the StratX indexer. Highest reputation weight."
                />
                <ChoiceCard
                  selected={creator.verificationPlan === 'exchange-linked'}
                  onSelect={() => setCreator({ ...creator, verificationPlan: 'exchange-linked' })}
                  icon={<BadgeCheck />}
                  title="Exchange-linked"
                  description="Read-only API keys reconciled daily. Keys are stored server-side, never in the browser."
                />
                <ChoiceCard
                  selected={creator.verificationPlan === 'self-reported'}
                  onSelect={() => setCreator({ ...creator, verificationPlan: 'self-reported' })}
                  icon={<EyeOff />}
                  title="Self-reported"
                  description="Upload NAV records yourself. Clearly labelled and weighted lowest."
                />
              </div>
            </fieldset>
            <fieldset className="mt-6">
              <legend className="mb-2.5 text-sm font-medium text-fg">Metrics you'll disclose</legend>
              <div className="flex flex-wrap gap-1.5">
                {DISCLOSURE_OPTIONS.map((d) => (
                  <Chip
                    key={d}
                    selected={creator.disclosures.includes(d)}
                    onClick={() => setCreator({ ...creator, disclosures: toggleIn(creator.disclosures, d) })}
                  >
                    {d}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <div className="mt-6">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Live preview</div>
              <CreatorDisclosurePreview creator={creator} />
            </div>
          </div>
        )}

        {step === 'disclosures' && (
          <div>
            <StepHeader
              eyebrow="Before you continue"
              title="Understand what you're looking at"
              description="Please confirm both statements to finish setup."
            />
            <div className="space-y-2.5">
              <AckCheckbox checked={ackDemo} onChange={setAckDemo}>
                <span className="font-medium text-fg">This is a demo.</span> All strategies, performance records,
                reputation scores, creators and demo auctions are fabricated sample data. They are not real results and
                have not been verified. Only on-chain auctions send transactions, on Solana Devnet with test USDC that
                has no monetary value — and only after you approve them in your wallet.
              </AckCheckbox>
              <AckCheckbox checked={ackRisk} onChange={setAckRisk}>
                <span className="font-medium text-fg">Trading strategies carry risk.</span> Past performance does not
                predict future results, access licences do not include custody or guarantees, and nothing on StratX is
                investment advice.
              </AckCheckbox>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div>
            <div className="mb-6 flex size-12 items-center justify-center rounded-full border border-pos/40 bg-pos/10 text-pos">
              <Check className="size-6" />
            </div>
            <StepHeader eyebrow="All set" title={editing ? 'Preferences updated' : "You're ready to explore"} />
            <Panel className="divide-y divide-line">
              <SummaryRow label="Role" value={role === 'both' ? 'Investor & creator' : role === 'creator' ? 'Creator' : 'Investor'} />
              <SummaryRow
                label="Account"
                value={account.status === 'signed-in' ? `${account.label ?? 'Wallet'}${publicKey ? ` · ${shortAddress(publicKey.toBase58(), 5)}` : ''}` : 'Not signed in — sign in any time from the header'}
              />
              {(role === 'investor' || role === 'both') && (
                <SummaryRow
                  label="For you"
                  value={`${RISK_LABEL[investor.riskTolerance]} · ${TIER_LABEL[investor.minTier]}+ · ${
                    investor.assetInterests.length ? investor.assetInterests.map((a) => ASSET_LABEL[a]).join(', ') : 'All markets'
                  }`}
                />
              )}
              {(role === 'creator' || role === 'both') && (
                <SummaryRow label="Creator" value={`${creator.displayName} · ${creator.disclosures.length} disclosed metrics`} />
              )}
            </Panel>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-end">
              {(role === 'creator' || role === 'both') && (
                <Button variant="outline" size="lg" onClick={() => navigate('/creator')}>
                  <PenTool /> Open Creator Studio
                </Button>
              )}
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate(role === 'creator' ? '/explore' : '/explore?fy=1')}
              >
                {role === 'creator' ? 'Explore strategies' : 'See strategies for you'} <ArrowRight />
              </Button>
            </div>
            {editing && (
              <div className="mt-10 border-t border-line pt-5 text-right">
                <button
                  type="button"
                  onClick={() => {
                    resetProfile()
                    setRole(null)
                    setInvestor(DEFAULT_INVESTOR)
                    setCreator(DEFAULT_CREATOR)
                    setAckDemo(false)
                    setAckRisk(false)
                    setBudgetInput('')
                    setStepIdx(0)
                  }}
                  className="text-xs text-muted hover:text-neg"
                >
                  Reset onboarding and start over
                </button>
              </div>
            )}
          </div>
        )}

        {step !== 'welcome' && step !== 'done' && (
          <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-5">
            <Button variant="ghost" onClick={back}>
              <ArrowLeft /> Back
            </Button>
            <Button variant="primary" onClick={next} disabled={!canContinue}>
              {step === 'disclosures'
                ? 'Finish setup'
                
                : step === 'signin' && account.status !== 'signed-in'
                  ? 'Continue without signing in'
                  : 'Continue'}{' '}
              <ArrowRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
      <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-muted sm:pt-0.5">{label}</span>
      <span className="text-sm text-fg">{value}</span>
    </div>
  )
}
