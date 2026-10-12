import { useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import { useAccount } from '@/auth/account'

/**
 * Live SOL balance of the signed-in account (wallet or Privy-created wallet),
 * kept current via an account-change subscription.
 */
export function useSolBalance() {
  const { connection } = useConnection()
  const { publicKey } = useAccount()
  const [result, setResult] = useState<{ key: string; balance: number | null; error: boolean } | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!publicKey) return
    let cancelled = false
    const key = publicKey.toBase58()
    connection.getBalance(publicKey, 'confirmed').then(
      (lamports) => !cancelled && setResult({ key, balance: lamports / LAMPORTS_PER_SOL, error: false }),
      () => !cancelled && setResult({ key, balance: null, error: true }),
    )
    let subId: number | null = null
    try {
      subId = connection.onAccountChange(publicKey, (info) => !cancelled && setResult({ key, balance: info.lamports / LAMPORTS_PER_SOL, error: false }), {
        commitment: 'confirmed',
      })
    } catch {
      /* websocket unavailable — manual refresh still works */
    }
    return () => {
      cancelled = true
      if (subId !== null) connection.removeAccountChangeListener(subId).catch(() => {})
    }
  }, [connection, publicKey, nonce])

  const current = publicKey && result?.key === publicKey.toBase58() ? result : null
  return { balance: current?.balance ?? null, error: current?.error ?? false, refresh: () => setNonce((n) => n + 1) }
}
