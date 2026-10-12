import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Copy,
  EyeOff,
  FileText,
  Gavel,
  Info,
  LineChart,
  ListTree,
  Lock,
  ShieldAlert,
  TriangleAlert,
  Trophy,
  UserRound,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAccount } from '@/auth/account'
import { DrawdownChart, EquityChart, MonthlyReturnsTable } from '@/components/charts/PerformanceCharts'
import { BondCard } from '@/components/onchain/BondCard'
import { OnchainListingCard } from '@/components/onchain/OnchainListingCard'
import { ProgramStatusNotice } from '@/components/onchain/ProgramStatusNotice'
import { StartAuctionForm } from '@/components/onchain/StartAuctionForm'
import { ReputationReport } from '@/components/reputation/ReputationReport'
import { TierBadge } from '@/components/reputation/TierBadge'
import { EmptyState, ErrorState } from '@/components/states'
import { AuctionInline } from '@/components/strategy/AuctionCountdown'
import { DemoTag, RiskBadge, VerificationBadge } from '@/components/strategy/badges'
import { DemoAuctionCard } from '@/components/strategy/DemoAuctionCard'
import { Metric, METRIC_HINTS, toneFor } from '@/components/strategy/Metric'
import { WatchButton } from '@/components/strategy/WatchButton'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Panel, PanelHeader, Skeleton } from '@/components/ui/misc'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip } from '@/components/ui/tooltip'
import { useCreatorRecords } from '@/creator/store'
import { useNow } from '@/hooks/useNow'
import { useStrategy } from '@/hooks/useStrategies'
import { formatUsd } from '@/lib/auction'
import { explainStrategy } from '@/lib/explain'
import { formatDate, formatDateTime, formatDuration, formatPercent, formatRatio, formatRelative, formatUsdCompact, shortAddress } from '@/lib/format'
import { ASSET_LABEL, STYLE_LABEL, VERIFICATION_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { clusterNowSec, offersFor, useOnchain } from '@/providers/onchain'
import { usePreferences } from '@/providers/preferences'
import { STATUS_LABEL, TIER_CLASS_LABEL, tierClass } from '@/reputation/display'
import { formatUsdc } from '@/solana/program/pricing'
import { listingView } from '@/solana/program/view'
import type { Strategy } from '@/types/strategy'

const TABS = ['overview', 'performance', 'reputation', 'auction', 'details'] as const
type TabKey = (typeof TABS)[number]

function DetailsSkeleton() {
  return (
    <div role="status" aria-label="Loading strategy" className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-48 rounded-3xl" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip content={copied ? 'Copied' : 'Copy address'}>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard?.writeText(address).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }, () => {})
        }
        className="inline-flex items-center gap-1 rounded px-1 font-mono text-xs text-fg-2 hover:bg-surface-2 hover:text-fg"
        aria-label={`Copy creator wallet address ${address}`}
      >
        {shortAddress(address, 5)}
        <Copy className="size-3" />
      </button>
    </Tooltip>
  )
}

function SourceTag({ s }: { s: Strategy }) {
  // Self-reported strategies are already labelled by their verification badge.
  return s.source === 'demo' ? <DemoTag /> : null
}

function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
          <dt className="w-52 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
          <dd className="min-w-0 text-sm text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ------------------------------------------------------------------ hero */

function Hero({ s, onAuction }: { s: Strategy; onAuction: () => void }) {
  const m = s.metrics
  const points = explainStrategy(s)
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface-2 via-surface to-green/30">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge reputation={s.reputation} strategyName={s.name} size="md" />
            <SourceTag s={s} />
            <VerificationBadge state={s.verification.state} source={s.verification.source} />
            <RiskBadge risk={s.riskLevel} />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">{s.name}</h1>
          <p className="mt-2 text-base text-fg-2">{s.tagline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4" /> <span className="text-fg-2">{s.creator.displayName}</span>
              {s.creator.identityLinked && <BadgeCheck className="size-4 text-info" aria-label="Identity linked (simulated in demo)" />}
            </span>
            {s.creator.wallet ? (
              <span className="inline-flex items-center gap-1">
                <CopyAddress address={s.creator.wallet} />
                {s.source === 'demo' && <span className="text-faint">(demo)</span>}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" /> Wallet not disclosed</span>
            )}
            <span>{STYLE_LABEL[s.style]}</span>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Yearly return', formatPercent(m.cagr), toneFor(m.cagr)],
              ['Sharpe', formatRatio(m.sharpe), 'default'],
              ['Worst drop', formatPercent(m.maxDrawdown), 'neg'],
              ['Track record', formatDuration(m.trackRecordDays), 'default'],
            ].map(([k, v, tone]) => (
              <div key={k} className="rounded-2xl bg-bg/50 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
                <dd className={cn('num mt-1 text-xl font-bold', tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-fg')}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-2xl bg-bg/60 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
            <Info className="size-4 text-accent" /> In plain words
          </h2>
          <ul className="mt-3 space-y-3">
            {points.map((p) => (
              <li key={p.text} className="flex gap-2.5 text-sm leading-relaxed text-fg-2">
                {p.tone === 'good' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-pos" /> : p.tone === 'caution' ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" /> : <Info className="mt-0.5 size-4 shrink-0 text-info" />}
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onAuction}>
              <Gavel /> Auction & offers
            </Button>
            <WatchButton strategyId={s.id} name={s.name} className="size-10 rounded-xl border border-line-strong" />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ tabs */

function OverviewTab({ s }: { s: Strategy }) {
  const m = s.metrics
  const account = useAccount()
  const ownRecord = useCreatorRecords().find((r) => r.id === s.id)
  const isOwner = !!ownRecord && (!ownRecord.ownerWallet || ownRecord.ownerWallet === account.publicKey?.toBase58())
  return (
    <div className="space-y-6">
      <BondCard strategyId={s.id} canPost={isOwner} ownerWallet={ownRecord?.ownerWallet ?? undefined} />
      <Panel className="p-5 sm:p-6">
        <h2 className="text-lg font-bold text-fg">About this strategy</h2>
        <p className="mt-2 leading-relaxed text-fg-2">{s.description || 'No description provided.'}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {s.assetCategories.map((a) => (
            <span key={a} className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-fg-2">{ASSET_LABEL[a]}</span>
          ))}
          {s.primaryAssets.map((a) => (
            <span key={a} className="num rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-fg-2">{a}</span>
          ))}
        </div>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-fg">Growth over time</h2>
        <EquityChart series={m.series} height={260} benchmarkLabel={s.source === 'self-reported' ? 'Cash (0%)' : 'SOL buy & hold'} />
      </Panel>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader title="What you can see vs. what stays private" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <ul className="space-y-1.5 text-sm text-fg-2">
              <li className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-pos"><BadgeCheck className="size-3.5" /> Shared</li>
              {s.disclosure.disclosed.map((d) => <li key={d}>{d}</li>)}
            </ul>
            <ul className="space-y-1.5 text-sm text-muted">
              <li className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted"><Lock className="size-3.5" /> Private</li>
              {s.disclosure.withheld.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Risks to know" />
          <ul className="list-disc space-y-1.5 p-5 pl-9 text-sm text-fg-2 marker:text-warn">
            {s.risks.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function PerformanceTab({ s }: { s: Strategy }) {
  const m = s.metrics
  return (
    <div className="space-y-6">
      <Panel className="p-5 sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-fg">Cumulative return</h2>
        <EquityChart series={m.series} height={320} benchmarkLabel={s.source === 'self-reported' ? 'Cash (0%)' : 'SOL buy & hold'} />
      </Panel>
      <Panel className="p-5 sm:p-6">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold text-fg">Drops from peak</h2>
          <span className="text-xs text-muted">
            Worst <span className="num text-neg">{formatPercent(m.maxDrawdown)}</span> · longest recovery <span className="num">{m.maxDrawdownDurationDays}d</span>
          </span>
        </div>
        <DrawdownChart series={m.series} />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Returns by period" description="Net of fees reported by the creator" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Period returns</caption>
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th scope="col" className="px-5 py-2 text-left font-semibold">Period</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">Strategy</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">Benchmark</th>
                </tr>
              </thead>
              <tbody>
                {m.periodReturns.map((p) => (
                  <tr key={p.key} className="border-b border-line last:border-0">
                    <th scope="row" className="px-5 py-2 text-left font-normal text-fg-2">{p.label}</th>
                    <td className={cn('num px-5 py-2 text-right', p.value === null ? 'text-faint' : p.value >= 0 ? 'text-pos' : 'text-neg')}>
                      {p.value === null ? 'Not enough history' : formatPercent(p.value, { signed: true })}
                    </td>
                    <td className="num px-5 py-2 text-right text-fg-2">{p.benchmark === null ? '—' : formatPercent(p.benchmark, { signed: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Risk profile" />
          <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
            <Metric label="Volatility" value={formatPercent(m.annualizedVolatility)} hint={METRIC_HINTS.volatility} />
            <Metric label="Sharpe" value={formatRatio(m.sharpe)} hint={METRIC_HINTS.sharpe} />
            <Metric label="Sortino" value={formatRatio(m.sortino)} hint={METRIC_HINTS.sortino} />
            <Metric label="Calmar" value={formatRatio(m.calmar)} hint={METRIC_HINTS.calmar} />
            <Metric label="Positive days" value={formatPercent(m.positiveDaysRatio, { digits: 0 })} />
            <Metric label="Best / worst month" value={`${formatPercent(m.bestMonth, { digits: 0 })} / ${formatPercent(m.worstMonth, { digits: 0 })}`} />
          </dl>
        </Panel>
      </div>
      <Panel>
        <PanelHeader title="Monthly returns" />
        <div className="p-3 sm:p-4">
          <MonthlyReturnsTable months={m.monthlyReturns} />
        </div>
      </Panel>
    </div>
  )
}

function AuctionTab({ s }: { s: Strategy }) {
  const { listings, program, refresh, status } = useOnchain()
  const account = useAccount()
  const records = useCreatorRecords()
  const mine = listings.filter((x) => x.account.strategyId === s.id)
  const ownRecord = records.find((r) => r.id === s.id)
  const isOwner = !!ownRecord && (!ownRecord.ownerWallet || ownRecord.ownerWallet === account.publicKey?.toBase58())
  const hasOpen = mine.some((x) => x.account.status === 'open')
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-fg">Auctions on Solana Devnet</h2>
          <p className="text-sm text-muted">The quant sets an asking price; investors make offers; the quant accepts the one they like.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => refresh()} disabled={status === 'loading'}>Refresh</Button>
          {isOwner && !hasOpen && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="primary"><Gavel /> Start an auction</Button>
              </DialogTrigger>
              <DialogContent title={`Start an auction · ${s.name}`} description="Real Solana Devnet transaction." className="max-w-xl">
                <StartAuctionForm strategyId={s.id} title={s.name} />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      <ProgramStatusNotice />
      {program?.kind === 'ready' && mine.length === 0 && (
        <EmptyState icon={<Gavel />} title="No on-chain auction yet" description={isOwner ? 'Start one to start receiving offers.' : 'The quant hasn’t opened an auction for this strategy.'} />
      )}
      {mine.map((x) => (
        <OnchainListingCard key={x.address.toBase58()} listing={x} strategyName={s.name} />
      ))}
      {s.auction && <DemoAuctionCard strategy={s} />}
    </div>
  )
}

function DetailsTab({ s }: { s: Strategy }) {
  const m = s.metrics
  const r = s.reputation
  const v = s.verification
  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Strategy" />
        <div className="px-5 pb-2">
          <DefinitionList
            items={[
              ['Name', s.name],
              ['Strategy ID', <span key="id" className="num">{s.id}</span>],
              ['Style', STYLE_LABEL[s.style]],
              ['Markets', s.assetCategories.map((a) => ASSET_LABEL[a]).join(', ')],
              ['Main assets', s.primaryAssets.join(', ') || '—'],
              ['Risk level', `${s.riskLevel[0].toUpperCase()}${s.riskLevel.slice(1)} (from volatility and worst drop)`],
              ['Stated capacity', s.capacityUsd ? formatUsdCompact(s.capacityUsd) : 'Not stated'],
              ['Data source', s.source === 'demo' ? 'Demo data (illustrative)' : s.source === 'self-reported' ? 'Self-reported by the creator' : 'On-chain'],
            ]}
          />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Creator" />
        <div className="px-5 pb-2">
          <DefinitionList
            items={[
              ['Name', s.creator.displayName],
              ['Wallet', s.creator.wallet ? <span key="wallet" className="num break-all">{s.creator.wallet}</span> : 'Not disclosed'],
              ['Identity linked', s.creator.identityLinked ? `Yes${s.source === 'demo' ? ' (simulated)' : ''}` : 'No'],
              ['On StratX since', formatDate(s.creator.joinedAt)],
              ['Strategies published', String(s.creator.strategiesPublished)],
            ]}
          />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Performance numbers" />
        <div className="px-5 pb-2">
          <DefinitionList
            items={[
              ['Total return', formatPercent(m.totalReturn, { signed: true })],
              ['Yearly return (CAGR)', formatPercent(m.cagr)],
              ['Volatility (yearly)', formatPercent(m.annualizedVolatility)],
              ['Sharpe / Sortino / Calmar', `${formatRatio(m.sharpe)} / ${formatRatio(m.sortino)} / ${formatRatio(m.calmar)}`],
              ['Worst drop (max drawdown)', `${formatPercent(m.maxDrawdown)} — recovered over ${m.maxDrawdownDurationDays} days`],
              ['Positive days', formatPercent(m.positiveDaysRatio, { digits: 0 })],
              ['Best / worst month', `${formatPercent(m.bestMonth, { signed: true })} / ${formatPercent(m.worstMonth, { signed: true })}`],
              ['Track record', `${m.trackRecordDays} days since ${formatDate(m.inceptionDate)}`],
              ...m.periodReturns.map((p) => [p.label, p.value === null ? 'Not enough history' : formatPercent(p.value, { signed: true })] as [string, ReactNode]),
            ]}
          />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Reputation & verification" />
        <div className="px-5 pb-2">
          <DefinitionList
            items={[
              ['Tier', `${TIER_CLASS_LABEL[tierClass(r)]} (${STATUS_LABEL[r.status].toLowerCase()})`],
              ['Score', r.score === null ? 'Unrated' : `${r.score.toFixed(1)} / 100 (max attainable ${r.maxAttainable})`],
              ...r.factors.map((f) => [`${f.key} · ${f.label} (${Math.round(f.weight * 100)}%)`, f.score === null ? 'Unavailable' : f.score.toFixed(1)] as [string, ReactNode]),
              ['Verification', `${VERIFICATION_LABEL[v.state]}${v.source !== 'onchain' ? ' — not independently verified' : ''}`],
              ['How records are checked', v.method],
              ['Last updated', `${formatDateTime(v.lastUpdatedAt)} (${formatRelative(v.lastUpdatedAt)})`],
              ['Reporting cadence', v.reportingCadence],
              ['Methodology', `v${r.methodologyVersion}`],
            ]}
          />
        </div>
      </Panel>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader title="Evidence" />
          <ul className="divide-y divide-line">
            {s.evidence.map((e) => (
              <li key={e.title} className="flex gap-3 px-5 py-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted" />
                <div>
                  <div className="text-sm font-semibold text-fg">{e.title}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{e.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="border-warn/25">
          <PanelHeader title="Limitations & risks" />
          <div className="space-y-4 p-5">
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-fg-2 marker:text-faint">
              {s.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <div>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-warn"><ShieldAlert className="size-3.5" /> Risks</h3>
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-fg-2 marker:text-faint">
                {s.risks.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ sidebar */

function AuctionSidebar({ s, onOpen }: { s: Strategy; onOpen: () => void }) {
  const { listings, offers, clockOffsetSec } = useOnchain()
  const now = useNow()
  const nowSec = clusterNowSec(now, clockOffsetSec)
  const live = listings
    .filter((x) => x.account.strategyId === s.id)
    .map((x) => ({ x, v: listingView(x.account, offersFor(offers, x.address), nowSec) }))
    .find(({ v }) => v.phase === 'open')
  return (
    <Panel className={live ? 'border-accent/40' : undefined}>
      <PanelHeader title={live ? 'Live auction · Devnet' : s.auction ? 'Demo auction' : 'Auction'} action={!live && s.auction ? <DemoTag label="Demo" /> : undefined} />
      <div className="space-y-3 p-5">
        {live ? (
          <>
            <div className="flex justify-between text-sm"><span className="text-muted">Asking</span><span className="num font-bold text-fg">{formatUsdc(live.x.account.askPrice, { decimals: 0 })}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted">Best offer</span><span className="num font-bold text-accent">{live.v.bestOffer ? formatUsdc(live.v.bestOffer, { decimals: 0 }) : 'None yet'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted">Offers</span><span className="num text-fg">{live.v.offers.length}</span></div>
          </>
        ) : s.auction ? (
          <>
            <div className="flex justify-between text-sm"><span className="text-muted">Asking</span><span className="num font-bold text-fg">{formatUsd(s.auction.askPrice)}</span></div>
            <AuctionInline auction={s.auction} />
          </>
        ) : (
          <p className="text-sm text-muted">No auction is open for this strategy.</p>
        )}
        <Button variant={live ? 'primary' : 'outline'} className="w-full" onClick={onOpen}>
          <Gavel /> {live ? 'Make an offer' : 'View auctions'}
        </Button>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ page */

export function StrategyDetailsPage() {
  const { id } = useParams()
  const { data: s, status, error, retry } = useStrategy(id)
  const [params, setParams] = useSearchParams()
  const { setLastViewedStrategyId } = usePreferences()

  const tabParam = params.get('tab') as TabKey | null
  const tab: TabKey = tabParam && TABS.includes(tabParam) ? tabParam : 'overview'
  const setTab = (t: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (t === 'overview') next.delete('tab')
        else next.set('tab', t)
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    if (s) {
      setLastViewedStrategyId(s.id)
      document.title = `${s.name} · StratX`
    }
    return () => {
      document.title = 'StratX'
    }
  }, [s, setLastViewedStrategyId])

  if (status === 'loading') return <DetailsSkeleton />
  if (status === 'error') return <ErrorState title="Couldn't load strategy" error={error} onRetry={retry} />
  if (!s) {
    return (
      <EmptyState
        title="Strategy not found"
        description={`No strategy exists with ID "${id}". It may have been removed, or it was created in another browser.`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/explore">Back to Explore</Link>
          </Button>
        }
      />
    )
  }

  const openAuction = () => {
    setTab('auction')
    document.getElementById('strategy-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> All strategies
      </Link>
      <Hero s={s} onAuction={openAuction} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0" id="strategy-tabs">
          <TabsList aria-label="Strategy sections">
            <TabsTrigger value="overview"><FileText /> Overview</TabsTrigger>
            <TabsTrigger value="performance"><LineChart /> Performance</TabsTrigger>
            <TabsTrigger value="reputation"><Trophy /> Reputation</TabsTrigger>
            <TabsTrigger value="auction"><Gavel /> Auction</TabsTrigger>
            <TabsTrigger value="details"><ListTree /> Details</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab s={s} /></TabsContent>
          <TabsContent value="performance"><PerformanceTab s={s} /></TabsContent>
          <TabsContent value="reputation">
            <Panel>
              <PanelHeader title="How this tier was earned" description="Seven weighted factors, explicit thresholds and safety checks for each tier." />
              <div className="p-5 sm:p-6"><ReputationReport reputation={s.reputation} /></div>
            </Panel>
          </TabsContent>
          <TabsContent value="auction"><AuctionTab s={s} /></TabsContent>
          <TabsContent value="details"><DetailsTab s={s} /></TabsContent>
        </Tabs>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Auction summary">
          <AuctionSidebar s={s} onOpen={openAuction} />
        </aside>
      </div>
    </div>
  )
}
