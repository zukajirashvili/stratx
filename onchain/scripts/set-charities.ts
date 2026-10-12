/**
 * Admin: sets the approved charities quants can pick for a truth bond (1–5).
 * Signed by the Config admin with the local Solana CLI keypair.
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/set-charities.ts "Education fund=<WALLET>" "Health fund=<WALLET>" ...
 *
 * Also creates each charity's USDC token account so a slashed bond can be paid.
 */
import * as anchor from '@coral-xyz/anchor'
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey, Transaction } from '@solana/web3.js'
import type { StratxAuction } from '../target/types/stratx_auction'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('../target/idl/stratx_auction.json')

const name32 = (s: string) => {
  const b = Buffer.from(s, 'utf8')
  if (b.length === 0 || b.length > 32) throw new Error(`Charity name must be 1-32 bytes: "${s}"`)
  const out = new Array(32).fill(0)
  b.forEach((x, i) => (out[i] = x))
  return out
}

async function main() {
  const entries = process.argv.slice(2).map((arg) => {
    const i = arg.lastIndexOf('=')
    if (i <= 0) throw new Error(`Expected "Name=WALLET", got "${arg}"`)
    return { name: arg.slice(0, i).trim(), wallet: new PublicKey(arg.slice(i + 1).trim()) }
  })
  if (entries.length === 0 || entries.length > 5) throw new Error('Pass 1-5 charities as "Name=WALLET"')

  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = new anchor.Program<StratxAuction>(IDL, provider)
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId)
  const [charities] = PublicKey.findProgramAddressSync([Buffer.from('charities')], program.programId)
  const cfg = await program.account.config.fetch(config)

  const sig = await program.methods
    .setCharities(entries.map((e) => e.wallet), entries.map((e) => name32(e.name)))
    .accountsPartial({ config, charities, admin: provider.wallet.publicKey })
    .rpc({ commitment: 'confirmed' })

  const tx = new Transaction()
  for (const e of entries) {
    tx.add(createAssociatedTokenAccountIdempotentInstruction(provider.wallet.publicKey, getAssociatedTokenAddressSync(cfg.usdcMint, e.wallet), e.wallet, cfg.usdcMint))
  }
  const ataSig = await provider.sendAndConfirm(tx)

  console.log('Charities set')
  entries.forEach((e, i) => console.log(`  ${i}: ${e.name} — ${e.wallet.toBase58()}`))
  console.log('  list account   ', charities.toBase58())
  console.log('  signature      ', sig)
  console.log('  usdc accounts  ', ataSig)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
