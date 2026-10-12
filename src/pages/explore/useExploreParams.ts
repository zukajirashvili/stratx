import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ASSET_ORDER, RISK_ORDER } from '@/lib/labels'
import { TIER_CLASS_ORDER } from '@/reputation/display'
import { SORT_OPTIONS, type AuctionFilter, type ExploreFilters, type SortKey } from '@/lib/strategyQuery'

const AUCTION_VALUES: AuctionFilter[] = ['active', 'upcoming', 'ended', 'none']

function readList<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]): T[] {
  const raw = params.get(key)
  if (!raw) return []
  return raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v))
}

export type ViewMode = 'cards' | 'table'

/**
 * All Explore state lives in the URL so searches, filters and sort survive
 * reloads, back/forward navigation and can be shared as links.
 */
export function useExploreParams() {
  const [params, setParams] = useSearchParams()

  const state = useMemo(() => {
    const sortRaw = params.get('sort') as SortKey | null
    const filters: ExploreFilters = {
      tiers: readList(params, 'tier', TIER_CLASS_ORDER),
      risk: readList(params, 'risk', RISK_ORDER),
      assets: readList(params, 'asset', ASSET_ORDER),
      auction: readList(params, 'auction', AUCTION_VALUES),
      watchlistOnly: params.get('watch') === '1',
    }
    return {
      q: params.get('q') ?? '',
      filters,
      sort: SORT_OPTIONS.some((o) => o.key === sortRaw) ? sortRaw! : ('reputation' as SortKey),
      sortExplicit: SORT_OPTIONS.some((o) => o.key === sortRaw),
      view: (params.get('view') === 'table' ? 'table' : 'cards') as ViewMode,
      forYou: params.get('fy') === '1',
    }
  }, [params])

  const update = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          mutate(next)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setList = useCallback(
    (key: 'tier' | 'risk' | 'asset' | 'auction', values: string[]) =>
      update((p) => (values.length ? p.set(key, values.join(',')) : p.delete(key))),
    [update],
  )

  const setFlag = useCallback(
    (key: 'watch' | 'fy', on: boolean) => update((p) => (on ? p.set(key, '1') : p.delete(key))),
    [update],
  )

  return {
    ...state,
    setQuery: (q: string) => update((p) => (q.trim() ? p.set('q', q.trim()) : p.delete('q'))),
    setList,
    setFlag,
    setSort: (s: SortKey) => update((p) => p.set('sort', s)),
    setView: (v: ViewMode) => update((p) => (v === 'cards' ? p.delete('view') : p.set('view', v))),
    clearFilters: () =>
      update((p) => {
        ;['tier', 'risk', 'asset', 'auction', 'watch', 'fy'].forEach((k) => p.delete(k))
      }),
    clearAll: () =>
      update((p) => {
        ;['q', 'tier', 'risk', 'asset', 'auction', 'watch', 'fy'].forEach((k) => p.delete(k))
      }),
  }
}
