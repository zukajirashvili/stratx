/** Window event the wallet provider fires with a wallet-adapter error as `detail`. */
export const WALLET_ERROR_EVENT = 'stratx:wallet-error'

/** Plain-language message for a wallet-adapter error. */
export function walletErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const msg = err instanceof Error ? err.message : String(err ?? '')
  if (name === 'WalletNotReadyError') return 'That wallet isn’t installed or is still loading. Install it, refresh the page, and try again.'
  if (/reject|denied|cancel/i.test(msg) || (name === 'WalletConnectionError' && /user/i.test(msg)))
    return 'The connection request was cancelled in the wallet. Click the wallet again and approve it.'
  if (/lock/i.test(msg)) return 'Your wallet is locked. Unlock it, then click the wallet again.'
  return msg ? `Couldn’t connect the wallet: ${msg}` : 'Couldn’t connect the wallet. Unlock it, refresh the page, and try again.'
}

/** External wallets offered on the sign-in screen, in display order. */
export interface KnownWallet {
  /** Adapter name as registered via Wallet Standard / adapter. */
  name: string
  label: string
  installUrl: string
  hardware?: boolean
  note?: string
}

export const KNOWN_WALLETS: KnownWallet[] = [
  { name: 'Phantom', label: 'Phantom', installUrl: 'https://phantom.com/download' },
  { name: 'Solflare', label: 'Solflare', installUrl: 'https://solflare.com/download' },
  { name: 'Backpack', label: 'Backpack', installUrl: 'https://backpack.app/download' },
  { name: 'MetaMask', label: 'MetaMask', installUrl: 'https://metamask.io/download', note: 'Uses MetaMask’s Solana account' },
  { name: 'Ledger', label: 'Ledger', installUrl: 'https://www.ledger.com/ledger-live', hardware: true, note: 'Hardware wallet · USB, Chrome/Edge/Brave' },
]
