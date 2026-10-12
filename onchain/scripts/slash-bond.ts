/**
 * Admin: a strategy's published results were found to be false. Sends the
 * quant's whole bond to the charity they chose. Irreversible.
 * Signed by the Config admin with the local Solana CLI keypair.
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/slash-bond.ts <QUANT_WALLET> <STRATEGY_ID>
 */
import * as anchor from '@coral-xyz/anchor'
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import type { StratxAuction } from '../target/types/stratx_auction'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('../target/idl/stratx_auction.json')

async function main() {
  const [quantArg, strategyId] = process.argv.slice(2)
  if (!quantArg || !strategyId) throw new Error('Usage: slash-bond.ts <QUANT_WALLET> <STRATEGY_ID>')
  const quant = new PublicKey(quantArg)
  const sid = Buffer.alloc(32)
  sid.write(strategyId, 'utf8')

  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = new anchor.Program<StratxAuction>(IDL, provider)
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId)
  const [bond] = PublicKey.findProgramAddressSync([Buffer.from('bond'), quant.toBuffer(), sid], program.programId)
  const cfg = await program.account.config.fetch(config)
  const b = await program.account.bond.fetch(bond)
  if (!('active' in b.status)) throw new Error(`Bond is not active: ${JSON.stringify(b.status)}`)

  const charityToken = getAssociatedTokenAddressSync(cfg.usdcMint, b.charity)
  const sig = await program.methods
    .slashBond()
    .accountsPartial({
      bond,
      vault: getAssociatedTokenAddressSync(cfg.usdcMint, bond, true),
      config,
      admin: provider.wallet.publicKey,
      usdcMint: cfg.usdcMint,
      charity: b.charity,
      charityToken,
      quant,
    })
    .preInstructions([createAssociatedTokenAccountIdempotentInstruction(provider.wallet.publicKey, charityToken, b.charity, cfg.usdcMint)])
    .rpc({ commitment: 'confirmed' })

  console.log(`Bond slashed: ${Number(b.amount) / 1e6} USDC sent to ${b.charity.toBase58()}`)
  console.log('  signature', sig)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
