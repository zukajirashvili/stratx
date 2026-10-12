import { AlertTriangle, ArrowDownUp, ArrowRight, LayoutGrid, Link2, Rows3, SlidersHorizontal, Sparkles, Star, Wand2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, StrategyGridSkeleton } from '@/components/states'
import { DemoTag } from '@/components/strategy/badges'
import { StrategyCard } from '@/components/strategy/StrategyCard'
import { StrategyTable } from '@/components/strategy/StrategyTable'
import { Button } from '@/components/ui/button'
import { Chip, Panel } from '@/components/ui/misc'
import { useNow } from '@/hooks/useNow'
import { useStrategies } from '@/hooks/useStrategies'
import { ASSET_LABEL, RISK_LABEL, TIER_LABEL } from '@/lib/labels'
import { EXAMPLE_QUERIES, interpretQuery, removeFromQuery } from '@/search/interpret'
import { clusterNowSec, offersFor, useOnchain } from '@/providers/onchain'
import { usdcToNumber } from '@/solana/program/pricing'
import { listingView, type ListingSummary } from '@/solana/program/view'
import {
  countActiveFilters,
  queryStrategies,
  SORT_OPTIONS,
  type ProfileConstraints,
  type SortKey,
} from '@/lib/strategyQuery'
import { cn } from '@/lib/utils'
import { FeaturedStrategy } from '@/pages/explore/FeaturedStrategy'
import { FilterPanel } from '@/pages/explore/FilterPanel'
import { useExploreParams } from '@/pages/explore/useExploreParams'
import { usePreferences } from '@/providers/preferences'
import { strategyService } from '@/services/strategyService'

function ExploreSearch({ q, onSubmit }: { q: string; onSubmit: (q: string) => void }) {
  const [value, setValue] = useState(q)
  const [lastQ, setLastQ] = useState(q)
  // Mirror external changes (header search, removed chips) into the field.
  if (q !== lastQ) {
    setLastQ(q)
    setValue(q)
  }
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(value)
      }}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <label htmlFor="explore-search" className="sr-only">
        Describe the strategy you are looking for
      </label>
      <div className="relative flex-1">
        <Wand2 className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-accent" />
        <input
          id="explore-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe what you want — e.g. low-risk strategies with a long track record"
          autoComplete="off"
          className="h-14 w-full rounded-2xl border border-line-strong bg-bg/80 pl-11 pr-3 text-base text-fg placeholder:text-faint hover:border-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 focus-visible:outline-none"
        />
      </div>
      <Button type="submit" variant="primary" size="lg" className="h-14 rounded-2xl px-8">
        Search
      </Button>
    </form>
  )
}

export function ExplorePage() {
  const params = useExploreParams()
  const { data, status, error, retry } = useStrategies()
  const { profile, watchlist } = usePreferences()
  const now = useNow()
  const [filtersOpen, setFiltersOpen] = useState(false)

  const intent = useMemo(() => interpretQuery(params.q), [params.q])
  const onchain = useOnchain()

  // Index live on-chain auctions by strategy id (actual Devnet program accounts).
  const nowSec = clusterNowSec(now, onchain.clockOffsetSec)
  const onchainByStrategy = new Map<string, ListingSummary>()
  for (const l of onchain.listings) {
    const v = listingView(l.account, offersFor(onchain.offers, l.address), nowSec)
    if (v.phase !== 'open') continue
    const prev = onchainByStrategy.get(l.account.strategyId)
    if (!prev || l.account.askPrice < prev.askPrice) {
      onchainByStrategy.set(l.account.strategyId, { askPrice: l.account.askPrice, bestOffer: v.bestOffer, offerCount: v.offers.length, secondsRemaining: v.secondsRemaining })
    }
  }
  const onchainLive = new Set(onchainByStrategy.keys())
  const onchainAskUsd = new Map([...onchainByStrategy].map(([k, v]) => [k, usdcToNumber(v.askPrice)]))

  const profileConstraints: ProfileConstraints | null = profile.investor
    ? {
        maxRisk: profile.investor.riskTolerance,
        assets: profile.investor.assetInterests,
        minTier: profile.investor.minTier,
      }
    : null

  // An explicit sort choice wins; otherwise use the ranking the query asked for.
  const effectiveSort: SortKey = params.sortExplicit ? params.sort : (intent.sort?.key ?? 'reputation')

  const results = data
    ? queryStrategies(
        data,
        { intent, filters: params.filters, sort: effectiveSort, forYou: params.forYou },
        { now, watchlist, profile: profileConstraints, onchainLive, onchainAskUsd },
      )
    : []

  const featured = data ? strategyService.pickFeatured(data, now) : null
  const activeFilterCount = countActiveFilters(params.filters) + (params.forYou ? 1 : 0)
  const isRefined = !!params.q || activeFilterCount > 0
  const onboardingIncomplete = profile.status !== 'complete'

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface-2 via-surface to-green/40 p-6 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent">Strategy marketplace on Solana</span>
            <DemoTag />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-fg sm:text-5xl">
            Trade strategies. Protect the edge. <span className="text-accent">Prove the alpha.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-base text-fg-2">
            Find quant strategies with a reputation you can check, then make an offer for access. Creators share results — never their code.
          </p>
          <div className="mt-6">
            <ExploreSearch q={params.q} onSubmit={params.setQuery} />
          </div>
        </div>
        <ol className="relative mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'Find a strategy', 'Search in plain English or browse by tier and risk.'],
            ['2', 'Check its reputation', 'Every tier is explained, factor by factor.'],
            ['3', 'Make an offer', 'Your USDC waits in escrow until the quant accepts.'],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-3 rounded-2xl bg-bg/50 p-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-accent-ink">{n}</span>
              <span>
                <span className="block text-sm font-bold text-fg">{t}</span>
                <span className="block text-xs text-fg-2">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {onboardingIncomplete && (
        <div className="flex flex-col gap-3 rounded-2xl border border-accent/25 bg-accent/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-2">
            <span className="font-medium text-fg">Finish setting up StratX.</span> Tell us your risk tolerance and
            interests to unlock a personalised "For you" view.
          </p>
          <Button asChild size="sm" variant="primary">
            <Link to="/onboarding">
              Continue onboarding <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <Panel className="p-4 sm:p-5">
        <h2 className="mb-2 text-sm font-bold text-fg">{params.q ? 'How we understood your search' : 'Try asking'}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {intent.criteria.length || intent.terms.length || intent.sort || intent.unsupported.length ? (
            <>
              <span className="mr-1 text-xs text-muted">Interpreted as</span>
              {intent.criteria.map((c) => (
                <span
                  key={c.id}
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-full border pl-3 pr-1.5 text-xs font-semibold',
                    c.kind === 'warn' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-accent/35 bg-accent/10 text-accent',
                  )}
                >
                  {c.kind === 'warn' && <AlertTriangle className="size-3" />}
                  {c.label}
                  <button
                    type="button"
                    onClick={() => params.setQuery(removeFromQuery(params.q, c.source))}
                    aria-label={`Remove ${c.label}`}
                    className="rounded p-0.5 hover:bg-accent/20"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {intent.sort && (
                <span className={cn('inline-flex h-8 items-center gap-1 rounded-full border border-line-strong px-3 text-xs', params.sortExplicit ? 'text-faint line-through' : 'text-fg-2')}>
                  <ArrowDownUp className="size-3" /> {intent.sort.label}
                  {params.sortExplicit && <span className="no-underline"> (overridden)</span>}
                </span>
              )}
              {intent.terms.length > 0 && (
                <span className="inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-xs text-fg-2">
                  Keywords: {intent.terms.join(', ')}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="mr-1 text-xs text-muted">Try</span>
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => params.setQuery(ex)}
                  className="inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-xs text-fg-2 hover:border-accent hover:text-fg"
                >
                  {ex}
                </button>
              ))}
            </>
          )}
        </div>
        {intent.unsupported.length > 0 && (
          <ul className="mt-3 space-y-1">
            {intent.unsupported.map((u) => (
              <li key={u.term} className="flex items-start gap-1.5 text-xs text-warn">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                <span>
                  <span className="font-medium">Not available: {u.term}.</span> <span className="text-fg-2">{u.message}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
          <span>
            Searching {data?.length ?? '…'} strategies: {data?.filter((s) => s.source === 'demo').length ?? 0} demo records (sample data)
            {data?.some((s) => s.source === 'self-reported') ? ` and ${data.filter((s) => s.source === 'self-reported').length} created by quants (self-reported)` : ''}.
          </span>
          <span className="inline-flex items-center gap-1">
            <Link2 className="size-3" />
            {onchain.program?.kind === 'ready'
              ? `${onchainLive.size} with a live auction on Solana Devnet.`
              : 'Live Devnet auctions unavailable — the auction program isn’t deployed yet.'}
          </span>
        </p>
      </Panel>

      {!isRefined && status === 'success' && featured && <FeaturedStrategy strategy={featured} />}

      <div className="grid gap-6 lg:grid-cols-[248px_1fr]">
        <aside aria-label="Filters" className={cn('lg:block', filtersOpen ? 'block' : 'hidden')}>
          <Panel className="p-4 lg:sticky lg:top-20">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg">Filters</h2>
              {activeFilterCount > 0 && (
                <button type="button" onClick={params.clearFilters} className="text-xs text-accent hover:underline">
                  Clear all
                </button>
              )}
            </div>
            {data ? (
              <FilterPanel filters={params.filters} strategies={data} now={now} onchainLive={onchainLive} onChange={params.setList} />
            ) : (
              <p className="text-xs text-muted">Loading filters…</p>
            )}
          </Panel>
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="results-heading" className="mr-auto text-sm text-muted" aria-live="polite">
              {status === 'success' ? (
                <>
                  <span className="num font-medium text-fg">{results.length}</span> of{' '}
                  <span className="num">{data?.length}</span> strategies
                </>
              ) : status === 'loading' ? (
                'Loading strategies…'
              ) : (
                'Strategies'
              )}
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="lg:hidden"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <SlidersHorizontal /> Filters
              {countActiveFilters(params.filters) > 0 && (
                <span className="num rounded bg-accent/15 px-1 text-[11px] text-accent">
                  {countActiveFilters(params.filters)}
                </span>
              )}
            </Button>
            {profile.investor && (
              <Chip selected={params.forYou} onClick={() => params.setFlag('fy', !params.forYou)}>
                <Sparkles className="size-3" /> For you
              </Chip>
            )}
            <Chip selected={params.filters.watchlistOnly} onClick={() => params.setFlag('watch', !params.filters.watchlistOnly)}>
              <Star className="size-3" /> Watchlist
              <span className="num text-[10px] opacity-60">{watchlist.length}</span>
            </Chip>
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="hidden sm:inline">Sort</span>
              <select
                value={effectiveSort}
                onChange={(e) => params.setSort(e.target.value as SortKey)}
                aria-label="Sort strategies"
                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-fg hover:border-faint focus:border-accent/60 focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div role="group" aria-label="View" className="hidden rounded-md border border-line-strong p-0.5 sm:inline-flex">
              {(
                [
                  ['cards', LayoutGrid, 'Card view'],
                  ['table', Rows3, 'Table view'],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-label={label}
                  aria-pressed={params.view === v}
                  onClick={() => params.setView(v)}
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded',
                    params.view === v ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>

          {params.forYou && profile.investor && (
            <p className="mb-3 text-xs text-muted">
              For you: up to {RISK_LABEL[profile.investor.riskTolerance].toLowerCase()}, {TIER_LABEL[profile.investor.minTier]} tier or
              above
              {profile.investor.assetInterests.length > 0 &&
                `, ${profile.investor.assetInterests.map((a) => ASSET_LABEL[a]).join(' / ')}`}
              .{' '}
              <Link to="/onboarding" className="text-accent hover:underline">
                Edit preferences
              </Link>
            </p>
          )}

          {status === 'loading' && <StrategyGridSkeleton />}
          {status === 'error' && <ErrorState error={error} onRetry={retry} />}
          {status === 'success' && results.length === 0 && (
            <EmptyState
              title="No strategies match"
              description={
                params.filters.watchlistOnly && watchlist.length === 0
                  ? 'Your watchlist is empty. Star a strategy to add it.'
                  : 'Try loosening a constraint, removing a filter, or rephrasing your search.'
              }
              action={
                <>
                  {params.q && (
                    <Button size="sm" variant="outline" onClick={() => params.setQuery('')}>
                      Clear search
                    </Button>
                  )}
                  {activeFilterCount > 0 && (
                    <Button size="sm" variant="outline" onClick={params.clearFilters}>
                      Clear filters
                    </Button>
                  )}
                </>
              }
            />
          )}
          {status === 'success' && results.length > 0 && (
            <>
              <div className={cn(params.view === 'table' && 'sm:hidden')}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {results.map((h) => (
                    <StrategyCard
                      key={h.strategy.id}
                      strategy={h.strategy}
                      hit={params.q ? h : undefined}
                      onchain={onchainByStrategy.get(h.strategy.id)}
                    />
                  ))}
                </div>
              </div>
              {params.view === 'table' && (
                <div className="hidden sm:block">
                  <StrategyTable strategies={results.map((h) => h.strategy)} onchain={onchainByStrategy} />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
