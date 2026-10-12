import { useCallback, useMemo, type ReactNode } from 'react'
import type { WalletError } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WALLET_ERROR_EVENT } from '@/auth/wallets'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { LedgerWalletAdapter } from '@solana/wallet-adapter-ledger'
import { SOLANA_RPC_URL } from '@/providers/solanaConfig'
import '@solana/wallet-adapter-react-ui/styles.css'

/**
 * Solana connection + external wallets.
 * Phantom, Solflare, Backpack and MetaMask implement the Wallet Standard and
 * are detected automatically when installed. Ledger (hardware) needs its own
 * adapter and a browser with WebHID (Chrome, Edge, Brave).
 */
export function SolanaProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new LedgerWalletAdapter()], [])
  const onError = useCallback((error: WalletError) => {
    console.warn('[wallet]', error)
    window.dispatchEvent(new CustomEvent(WALLET_ERROR_EVENT, { detail: error }))
  }, [])
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
