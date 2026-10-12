import { useConnection } from '@solana/wallet-adapter-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { OnchainContext, type OnchainState } from '@/providers/onchain'
import { fetchClusterTime, fetchListings, fetchOffers, fetchProgramStatus } from '@/solana/program/client'
import { detectCluster } from '@/solana/network'

const POLL_MS = 20_000

/**
 * Indexes the StratX auction program on the configured cluster: deployment
 * and config status, all Listing accounts, all live Offer accounts, and the
 * cluster clock offset. Everything shown as "on-chain" in the UI comes from here.
 */
export function OnchainProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection()
  const [state, setState] = useState<Omit<OnchainState, 'refresh'>>({
    status: 'loading',
    error: null,
    cluster: null,
    program: null,
    listings: [],
    offers: [],
    clockOffsetSec: 0,
    lastUpdated: null,
  })
  const inflight = useRef<Promise<void> | null>(null)
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  // The cluster (genesis hash) never changes for a connection — detect it once.
  const clusterRef = useRef<{ endpoint: string; cluster: Awaited<ReturnType<typeof detectCluster>> } | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    // A fetch already running may have started before the caller's transaction
    // confirmed — wait for it, then fetch again so callers get fresh state.
    if (inflight.current) {
      await inflight.current.catch(() => {})
      return refreshRef.current()
    }
    const run = (async () => {
      try {
        const cachedCluster = clusterRef.current?.endpoint === connection.rpcEndpoint ? clusterRef.current.cluster : null
        const [cluster, program, clusterTime] = await Promise.all([
          cachedCluster ?? detectCluster(connection),
          fetchProgramStatus(connection),
          fetchClusterTime(connection),
        ])
        if (cluster !== 'unknown') clusterRef.current = { endpoint: connection.rpcEndpoint, cluster }
        const deployed = program.kind !== 'not-deployed'
        const [listings, offers] = deployed ? await Promise.all([fetchListings(connection), fetchOffers(connection)]) : [[], []]
        setState({
          status: 'ready',
          error: null,
          cluster,
          program,
          listings,
          offers,
          clockOffsetSec: clusterTime ? clusterTime - Date.now() / 1000 : 0,
          lastUpdated: Date.now(),
        })
      } catch (e) {
        setState((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e) }))
      } finally {
        inflight.current = null
      }
    })()
    inflight.current = run
    return run
  }, [connection])

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    refresh()
    // Public RPCs rate-limit hard: only poll while the tab is visible, and catch up when it returns.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh])
  return <OnchainContext.Provider value={value}>{children}</OnchainContext.Provider>
}
