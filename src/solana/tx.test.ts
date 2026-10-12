import { Keypair, SystemProgram, type VersionedTransaction } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'
import { GENESIS_HASH, clusterFromGenesis, walletSupportsCluster } from '@/solana/network'
import { classifyError, parseProgramError, sendAndConfirm, type SendDeps, type TxPhase } from '@/solana/tx'

const payer = Keypair.generate()
const ix = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 })

function mockConnection(over: Partial<Record<keyof SendDeps['connection'], unknown>> = {}) {
  return {
    getGenesisHash: vi.fn().mockResolvedValue(GENESIS_HASH.devnet),
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 }),
    simulateTransaction: vi.fn().mockResolvedValue({ value: { err: null, logs: [] } }),
    sendRawTransaction: vi.fn().mockResolvedValue('SIG123'),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    ...over,
  } as unknown as SendDeps['connection']
}

const okWallet: SendDeps['wallet'] = { publicKey: payer.publicKey, signTransaction: async <T extends VersionedTransaction>(t: T) => t }

async function run(connection = mockConnection(), wallet: SendDeps['wallet'] = okWallet) {
  const phases: TxPhase[] = []
  const result = await sendAndConfirm({ connection, wallet, instructions: [ix], onPhase: (p) => phases.push(p) })
  return { result, phases }
}

describe('sendAndConfirm', () => {
  it('reports confirmed only after the cluster confirms', async () => {
    const { result, phases } = await run()
    expect(result).toEqual({ ok: true, signature: 'SIG123' })
    expect(phases).toEqual(['preparing', 'awaiting-signature', 'submitted', 'confirmed'])
  })

  it('maps a wallet rejection to the rejected state and sends nothing', async () => {
    const conn = mockConnection()
    const wallet = {
      publicKey: payer.publicKey,
      signTransaction: vi.fn().mockRejectedValue(Object.assign(new Error('User rejected the request.'), { name: 'WalletSignTransactionError' })),
    }
    const { result, phases } = await run(conn, wallet)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe('rejected')
    expect(phases.at(-1)).toBe('rejected')
    expect(conn.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('blocks on a network mismatch before asking for a signature', async () => {
    const conn = mockConnection({ getGenesisHash: vi.fn().mockResolvedValue(GENESIS_HASH['mainnet-beta']) })
    const wallet = { publicKey: payer.publicKey, signTransaction: vi.fn() }
    const { result } = await run(conn, wallet)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe('wrong-network')
    expect(wallet.signTransaction).not.toHaveBeenCalled()
  })

  it('surfaces program errors from simulation without prompting the wallet', async () => {
    const logs = ['Program log: AnchorError occurred. Error Code: ListingEnded. Error Number: 6009. Error Message: Listing has ended.']
    const conn = mockConnection({ simulateTransaction: vi.fn().mockResolvedValue({ value: { err: { InstructionError: [0, { Custom: 6009 }] }, logs } }) })
    const wallet = { publicKey: payer.publicKey, signTransaction: vi.fn() }
    const { result, phases } = await run(conn, wallet)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.kind).toBe('program')
      expect(result.failure.programError).toBe('ListingEnded')
    }
    expect(wallet.signTransaction).not.toHaveBeenCalled()
    expect(phases.at(-1)).toBe('failed')
  })

  it('reports failure when the confirmed transaction errored on-chain', async () => {
    const conn = mockConnection({ confirmTransaction: vi.fn().mockResolvedValue({ value: { err: { InstructionError: [0, { Custom: 6008 }] } } }) })
    const { result, phases } = await run(conn)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.programError).toBe('ListingNotOpen')
      expect(result.failure.signature).toBe('SIG123')
    }
    expect(phases).not.toContain('confirmed')
  })

  it('reports RPC failures', async () => {
    const conn = mockConnection({ sendRawTransaction: vi.fn().mockRejectedValue(new Error('failed to fetch')) })
    const { result } = await run(conn)
    expect(!result.ok && result.failure.kind).toBe('network')
  })

  it('requires a connected wallet', async () => {
    const { result } = await run(mockConnection(), { publicKey: null })
    expect(!result.ok && result.failure.kind).toBe('wallet')
  })
})

describe('error classification', () => {
  it('recognises rejection variants', () => {
    expect(classifyError({ code: 4001, message: 'x' }).kind).toBe('rejected')
    expect(classifyError(new Error('Transaction declined')).kind).toBe('rejected')
  })
  it('decodes hex custom program errors', () => {
    expect(parseProgramError({ message: 'custom program error: 0x177c' })?.name).toBe('OfferAmountMismatch') // 6012
  })
  it('detects insufficient funds and expired blockhashes', () => {
    expect(classifyError(new Error('Attempt to debit an account but found no record of a prior credit.')).kind).toBe('insufficient-funds')
    expect(classifyError(new Error('Blockhash not found')).kind).toBe('blockhash-expired')
  })
})

describe('network detection', () => {
  it('identifies clusters by genesis hash', () => {
    expect(clusterFromGenesis(GENESIS_HASH.devnet)).toBe('devnet')
    expect(clusterFromGenesis(GENESIS_HASH['mainnet-beta'])).toBe('mainnet-beta')
    expect(clusterFromGenesis('somethingElse')).toBe('localnet')
    expect(clusterFromGenesis(null)).toBe('unknown')
  })
  it('reads wallet-standard chains when available', () => {
    const adapter = (chains?: string[]) => ({ wallet: { chains } }) as never
    expect(walletSupportsCluster(adapter(['solana:mainnet', 'solana:devnet']), 'devnet')).toBe(true)
    expect(walletSupportsCluster(adapter(['solana:mainnet']), 'devnet')).toBe(false)
    expect(walletSupportsCluster(adapter(undefined), 'devnet')).toBeNull()
  })
})
