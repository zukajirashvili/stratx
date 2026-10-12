import { Buffer } from 'buffer'

// @solana/web3.js relies on Node's Buffer. Must run before any Solana import.
if (!('Buffer' in globalThis)) {
  ;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer
}
