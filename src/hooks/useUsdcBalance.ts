import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useEffect, useState } from 'react'
import { useAccount } from '@/auth/account'
import { useOnchain } from '@/providers/onchain'
import { fetchUsdcBalance, usdcAta } from '@/solana/program/client'
import { DEVNET_USDC_MINT } from '@/solana/program/constants'

/**
 * Live USDC balance (base units) of the signed-in account for the mint the
 * program is configured with (falls back to Circle Devnet USDC). null = no USDC account.
 */
export function useUsdcBalance() {
  const { connection } = useConnection()
  const { publicKey } = useAccount()
  const { program } = useOnchain()
  const mint = program?.kind === 'ready' ? program.config.usdcMint : new PublicKey(DEVNET_USDC_MINT)
  const mintKey = mint.toBase58()
  const [state, setState] = useState<{ key: string; units: bigint | null; loading: boolean } | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!publicKey) return
    let cancelled = false
    const key = `${publicKey.toBase58()}:${mintKey}`
    const m = new PublicKey(mintKey)
    const load = () => fetchUsdcBalance(connection, publicKey, m).then((units) => !cancelled && setState({ key, units, loading: false }))
    load()
    let subId: number | null = null
    try {
      subId = connection.onAccountChange(usdcAta(m, publicKey), () => load(), { commitment: 'confirmed' })
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true
      if (subId !== null) connection.removeAccountChangeListener(subId).catch(() => {})
    }
  }, [connection, publicKey, mintKey, nonce])

  const current = publicKey && state?.key === `${publicKey.toBase58()}:${mintKey}` ? state : null
  return { units: current?.units ?? null, loaded: !!current, mint, refresh: () => setNonce((n) => n + 1) }
}
