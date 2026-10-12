import type { Connection } from '@solana/web3.js'
import type { Adapter } from '@solana/wallet-adapter-base'

/** Genesis hashes identify a cluster regardless of which RPC URL is used. */
export const GENESIS_HASH = {
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  testnet: '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
} as const

export type ClusterName = keyof typeof GENESIS_HASH | 'localnet' | 'unknown'

export function clusterFromGenesis(hash: string | null | undefined): ClusterName {
  if (!hash) return 'unknown'
  const hit = (Object.keys(GENESIS_HASH) as (keyof typeof GENESIS_HASH)[]).find((k) => GENESIS_HASH[k] === hash)
  return hit ?? 'localnet'
}

/** Which cluster the app's RPC endpoint actually serves. */
export async function detectCluster(connection: Pick<Connection, 'getGenesisHash'>): Promise<ClusterName> {
  try {
    return clusterFromGenesis(await connection.getGenesisHash())
  } catch {
    return 'unknown'
  }
}

/**
 * Best-effort check of the wallet's advertised chains (Wallet Standard
 * `chains`, e.g. "solana:devnet"). Wallets don't expose their *currently
 * selected* network, so this can only detect wallets that don't support Devnet
 * at all. StratX signs with the wallet but submits through its own Devnet RPC,
 * so the transaction always lands on Devnet regardless of the wallet's UI.
 */
export function walletSupportsCluster(adapter: Adapter | null | undefined, cluster: 'devnet' | 'testnet' | 'mainnet'): boolean | null {
  const chains = (adapter as unknown as { wallet?: { chains?: readonly string[] } } | null)?.wallet?.chains
  if (!chains || !chains.length) return null
  return chains.includes(`solana:${cluster}`)
}

export const DEVNET_FAUCET_URL = 'https://faucet.solana.com'
