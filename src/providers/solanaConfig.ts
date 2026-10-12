import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { clusterApiUrl } from '@solana/web3.js'

/**
 * Network is Devnet unless VITE_SOLANA_NETWORK says otherwise. A custom RPC
 * can be provided with VITE_SOLANA_RPC_URL (use a public endpoint or one with
 * a client-safe key — never put private keys or secrets in VITE_ variables,
 * they are bundled into the frontend).
 */
export const SOLANA_NETWORK: WalletAdapterNetwork =
  (import.meta.env.VITE_SOLANA_NETWORK as WalletAdapterNetwork | undefined) ?? WalletAdapterNetwork.Devnet

export const SOLANA_RPC_URL: string =
  (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ?? clusterApiUrl(SOLANA_NETWORK)

export function explorerAddressUrl(address: string) {
  const cluster = SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`
  return `https://explorer.solana.com/address/${address}${cluster}`
}
