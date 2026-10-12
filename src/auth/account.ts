import { createContext, useContext } from 'react'
import type { PublicKey } from '@solana/web3.js'
import type { SigningWallet } from '@/solana/tx'

/**
 * One signed-in account, however the person signed in:
 *  - Google / Apple / email → Privy, with a Solana wallet created for them
 *  - Phantom / Solflare / Backpack / MetaMask / Ledger → their own wallet
 * Every transaction is still approved by the user (wallet popup or Privy prompt).
 */
export type SignInMethod = 'google' | 'apple' | 'email' | 'wallet'

export interface AccountState {
  status: 'loading' | 'signed-out' | 'signed-in'
  method: SignInMethod | null
  /** Email address or wallet name, for display. */
  label: string | null
  publicKey: PublicKey | null
  /** Pass to on-chain actions; signs via the active wallet. */
  signer: SigningWallet
  /** True when Google / Apple / email sign-in is configured (VITE_PRIVY_APP_ID). */
  socialAvailable: boolean
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>
  sendEmailCode: (email: string) => Promise<void>
  verifyEmailCode: (code: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AccountContext = createContext<AccountState | null>(null)

export function useAccount() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount must be used inside <AccountProvider>')
  return ctx
}

export const PRIVY_APP_ID = (import.meta.env?.VITE_PRIVY_APP_ID as string | undefined)?.trim() || null

export const SOCIAL_SETUP_HELP =
  'Google, Apple and email sign-in need a free Privy app. Create one at dashboard.privy.io, enable Google, Apple and Email, add this site’s URL to Allowed origins, then set VITE_PRIVY_APP_ID in .env.local and restart.'
