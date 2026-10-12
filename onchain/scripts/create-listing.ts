/**
 * Creates a Devnet listing signed by the local CLI wallet (which becomes the
 * seller). Amounts are USDC decimal strings converted with integer arithmetic.
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/create-listing.ts <strategy-id> "<title>" <ask USDC> <min offer USDC> <duration minutes> [access days]
 *
 * Example:
 *   npx ts-node scripts/create-listing.ts basalt-basis-carry "Basalt Basis Carry" 15000 10000 120 30
 */
import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import type { StratxAuction } from '../target/types/stratx_auction'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('../target/idl/stratx_auction.json')

function usdcToUnits(s: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`Invalid USDC amount: ${s}`)
  const [whole, frac = ''] = s.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0'))
}

function fixed(s: string, n: number): number[] {
  const b = Buffer.from(s, 'utf8')
  if (b.length === 0 || b.length > n) throw new Error(`value must be 1–${n} bytes`)
  const out = new Array(n).fill(0)
  b.forEach((x, i) => (out[i] = x))
  return out
}

async function main() {
  const [strategy, title, ask, min, minutes, days = '30'] = process.argv.slice(2)
  if (!strategy || !title || !ask || !min || !minutes) {
    throw new Error('Usage: create-listing.ts <strategy-id> "<title>" <ask USDC> <min USDC> <duration minutes> [access days]')
  }
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = new anchor.Program<StratxAuction>(IDL, provider)

  const slot = await provider.connection.getSlot('confirmed')
  const now = (await provider.connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000)
  const endTs = now + Number(minutes) * 60
  const listingId = BigInt(Date.now())
  const seller = provider.wallet.publicKey
  const [listing] = PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), seller.toBuffer(), new BN(listingId.toString()).toArrayLike(Buffer, 'le', 8)],
    program.programId,
  )

  const sig = await program.methods
    .createListing(
      new BN(listingId.toString()),
      fixed(strategy, 32),
      fixed(title, 64),
      new BN(usdcToUnits(ask).toString()),
      new BN(usdcToUnits(min).toString()),
      new BN(endTs),
      Number(days),
    )
    .accounts({ seller })
    .rpc({ commitment: 'confirmed' })

  console.log('Listing created')
  console.log('  listing   ', listing.toBase58())
  console.log('  strategy  ', strategy, '—', title)
  console.log('  ask / min ', ask, '/', min, 'USDC')
  console.log('  ends      ', new Date(endTs * 1000).toISOString())
  console.log('  signature ', sig)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
