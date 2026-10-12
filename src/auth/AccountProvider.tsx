import { PrivyProvider, useLoginWithEmail, useLoginWithOAuth, usePrivy } from '@privy-io/react-auth'
import { useSignTransaction, useWallets } from '@privy-io/react-auth/solana'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, VersionedTransaction } from '@solana/web3.js'
import { useCallback, useMemo, type ReactNode } from 'react'
import { AccountContext, PRIVY_APP_ID, SOCIAL_SETUP_HELP, type AccountState, type SignInMethod } from '@/auth/account'
import { SOLANA_NETWORK } from '@/providers/solanaConfig'

const notConfigured = async () => {
  throw new Error(SOCIAL_SETUP_HELP)
}

/** Wallet-adapter account (Phantom, Solflare, Backpack, MetaMask, Ledger…). */
function useAdapterAccount() {
  const { publicKey, wallet, signTransaction, disconnect, connected, connecting } = useWallet()
  return {
    connected: connected && !!publicKey,
    connecting,
    publicKey,
    name: wallet?.adapter.name ?? null,
    signTransaction: signTransaction
      ? async <T extends VersionedTransaction>(tx: T) => (await signTransaction(tx)) as T
      : undefined,
    disconnect,
  }
}

function merge(
  adapter: ReturnType<typeof useAdapterAccount>,
  social: {
    available: boolean
    ready: boolean
    authenticated: boolean
    method: SignInMethod | null
    label: string | null
    publicKey: PublicKey | null
    signTransaction?: <T extends VersionedTransaction>(tx: T) => Promise<T>
    signInWithOAuth: AccountState['signInWithOAuth']
    sendEmailCode: AccountState['sendEmailCode']
    verifyEmailCode: AccountState['verifyEmailCode']
    logout: () => Promise<void>
  },
): AccountState {
  // An explicitly connected external wallet takes priority.
  if (adapter.connected) {
    return {
      status: 'signed-in',
      method: 'wallet',
      label: adapter.name,
      publicKey: adapter.publicKey,
      signer: { publicKey: adapter.publicKey, signTransaction: adapter.signTransaction },
      socialAvailable: social.available,
      signInWithOAuth: social.signInWithOAuth,
      sendEmailCode: social.sendEmailCode,
      verifyEmailCode: social.verifyEmailCode,
      signOut: async () => {
        await adapter.disconnect().catch(() => {})
        if (social.authenticated) await social.logout()
      },
    }
  }
  if (social.authenticated) {
    return {
      status: 'signed-in',
      method: social.method,
      label: social.label,
      publicKey: social.publicKey,
      signer: { publicKey: social.publicKey, signTransaction: social.signTransaction },
      socialAvailable: true,
      signInWithOAuth: social.signInWithOAuth,
      sendEmailCode: social.sendEmailCode,
      verifyEmailCode: social.verifyEmailCode,
      signOut: social.logout,
    }
  }
  return {
    status: (social.available && !social.ready) || adapter.connecting ? 'loading' : 'signed-out',
    method: null,
    label: null,
    publicKey: null,
    signer: { publicKey: null },
    socialAvailable: social.available,
    signInWithOAuth: social.signInWithOAuth,
    sendEmailCode: social.sendEmailCode,
    verifyEmailCode: social.verifyEmailCode,
    signOut: async () => {},
  }
}

/** Bridges Privy (Google / Apple / email + embedded Solana wallet) into the account context. */
function PrivyBridge({ children }: { children: ReactNode }) {
  const adapter = useAdapterAccount()
  const { ready, authenticated, user, logout } = usePrivy()
  const { initOAuth } = useLoginWithOAuth()
  const { sendCode, loginWithCode } = useLoginWithEmail()
  const { wallets } = useWallets()
  const { signTransaction } = useSignTransaction()

  const embedded = wallets[0] ?? null
  const publicKey = useMemo(() => (embedded ? new PublicKey(embedded.address) : null), [embedded])
  const method: SignInMethod | null = user?.google ? 'google' : user?.apple ? 'apple' : user?.email ? 'email' : null
  const label = user?.google?.email ?? user?.apple?.email ?? user?.email?.address ?? null

  const sign = useCallback(
    async <T extends VersionedTransaction>(tx: T): Promise<T> => {
      if (!embedded) throw new Error('Your StratX wallet is still being created. Try again in a moment.')
      const { signedTransaction } = await signTransaction({
        transaction: tx.serialize(),
        wallet: embedded,
        chain: `solana:${SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet' : SOLANA_NETWORK}` as never,
      })
      return VersionedTransaction.deserialize(signedTransaction) as T
    },
    [embedded, signTransaction],
  )

  const value = merge(adapter, {
    available: true,
    ready,
    authenticated,
    method,
    label,
    publicKey,
    signTransaction: embedded ? sign : undefined,
    signInWithOAuth: (provider) => initOAuth({ provider }),
    sendEmailCode: (email) => sendCode({ email }),
    verifyEmailCode: (code) => loginWithCode({ code }),
    logout,
  })
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

function WalletOnlyBridge({ children }: { children: ReactNode }) {
  const adapter = useAdapterAccount()
  const value = merge(adapter, {
    available: false,
    ready: true,
    authenticated: false,
    method: null,
    label: null,
    publicKey: null,
    signInWithOAuth: notConfigured,
    sendEmailCode: notConfigured,
    verifyEmailCode: notConfigured,
    logout: async () => {},
  })
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function AccountProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <WalletOnlyBridge>{children}</WalletOnlyBridge>
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'apple'],
        appearance: { theme: 'dark', accentColor: '#ff7a1a', walletChainType: 'solana-only' },
        embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' }, ethereum: { createOnLogin: 'off' } },
        externalWallets: { disableAllExternalWallets: true },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  )
}
