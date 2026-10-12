/**
 * One-time Devnet setup: creates the Config account (admin, fee recipient, USDC mint).
 *
 * Must be signed by the program's UPGRADE AUTHORITY (the wallet that ran
 * `anchor deploy`). Uses the local Solana CLI keypair — never a browser key.
 *
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/init-config.ts <FEE_RECIPIENT_WALLET> [USDC_MINT]
 *
 * USDC_MINT defaults to Circle's Devnet USDC (get test USDC at https://faucet.circle.com).
 */
import * as anchor from '@coral-xyz/anchor'
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey, Transaction } from '@solana/web3.js'
import type { StratxAuction } from '../target/types/stratx_auction'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('../target/idl/stratx_auction.json')

const DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

async function main() {
  const [feeArg, mintArg = DEVNET_USDC] = process.argv.slice(2)
  if (!feeArg) throw new Error('Usage: init-config.ts <FEE_RECIPIENT_WALLET> [USDC_MINT]')
  const feeRecipient = new PublicKey(feeArg)
  const usdcMint = new PublicKey(mintArg)

  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = new anchor.Program<StratxAuction>(IDL, provider)

  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId)
  if (await provider.connection.getAccountInfo(config)) {
    console.log(`Config already exists at ${config.toBase58()} — nothing to do.`)
    return
  }
  const [programData] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
  )

  const sig = await program.methods
    .initializeConfig()
    .accountsPartial({ config, admin: provider.wallet.publicKey, feeRecipient, usdcMint, program: program.programId, programData })
    .rpc({ commitment: 'confirmed' })

  // Make sure the fee recipient's USDC account exists so accepted offers can pay the fee.
  const feeAta = getAssociatedTokenAddressSync(usdcMint, feeRecipient)
  const ataSig = await provider.sendAndConfirm(
    new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(provider.wallet.publicKey, feeAta, feeRecipient, usdcMint)),
  )

  console.log('Config initialised')
  console.log('  program        ', program.programId.toBase58())
  console.log('  config         ', config.toBase58())
  console.log('  admin          ', provider.wallet.publicKey.toBase58())
  console.log('  fee recipient  ', feeRecipient.toBase58(), '(USDC account', feeAta.toBase58() + ')')
  console.log('  usdc mint      ', usdcMint.toBase58())
  console.log('  init signature ', sig)
  console.log('  ata signature  ', ataSig)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
