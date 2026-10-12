import { createContext, useContext } from 'react'
import type { PublicKey } from '@solana/web3.js'
import type { OnchainListing, OnchainOffer, ProgramStatus } from '@/solana/program/client'
import type { ClusterName } from '@/solana/network'

export interface OnchainState {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  cluster: ClusterName | null
  program: ProgramStatus | null
  listings: OnchainListing[]
  /** Live offers (escrowed, not yet accepted/withdrawn), across all listings. */
  offers: OnchainOffer[]
  /** cluster unix time − browser unix time, in seconds (for display only). */
  clockOffsetSec: number
  lastUpdated: number | null
  refresh: () => Promise<void>
}

export const OnchainContext = createContext<OnchainState | null>(null)

export function useOnchain() {
  const ctx = useContext(OnchainContext)
  if (!ctx) throw new Error('useOnchain must be used inside <OnchainProvider>')
  return ctx
}

/** Browser time corrected to the cluster clock, in seconds. */
export function clusterNowSec(nowMs: number, offsetSec: number) {
  return nowMs / 1000 + offsetSec
}

export function offersFor(offers: OnchainOffer[], listing: PublicKey) {
  return offers.filter((o) => o.account.listing.equals(listing)).map((o) => o.account)
}
