/**
 * Transaction submission and status handling.
 *
 * Every on-chain action goes: network check → simulate → wallet signature →
 * submit → confirm. Each phase is reported so the UI can show pending,
 * confirmed, rejected and failed states. Success is only reported after the
 * cluster confirms the signature without error — never optimistically.
 */
import {
  type Connection,
  type PublicKey,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import { detectCluster, type ClusterName } from '@/solana/network'
import { PROGRAM_ERRORS } from '@/solana/program/constants'

export type TxPhase = 'idle' | 'preparing' | 'awaiting-signature' | 'submitted' | 'confirmed' | 'rejected' | 'failed'

export type TxFailureKind =
  | 'rejected'
  | 'wrong-network'
  | 'program'
  | 'insufficient-funds'
  | 'blockhash-expired'
  | 'network'
  | 'wallet'
  | 'unknown'

export interface TxFailure {
  kind: TxFailureKind
  message: string
  /** Anchor error name when the program rejected the transaction. */
  programError?: string
  logs?: string[]
  signature?: string
}

export type TxResult = { ok: true; signature: string } | { ok: false; failure: TxFailure }

export interface SigningWallet {
  publicKey: PublicKey | null
  signTransaction?: <T extends VersionedTransaction>(tx: T) => Promise<T>
}

/* ------------------------------------------------------------------ errors */

function programErrorFromCode(code: number) {
  const entry = PROGRAM_ERRORS[code - 6000]
  return entry ? { name: entry[0], message: entry[1] } : null
}

/** Extracts a StratX program error from logs, messages or an InstructionError object. */
export function parseProgramError(input: { logs?: string[] | null; message?: string; err?: unknown }) {
  const text = [...(input.logs ?? []), input.message ?? ''].join('\n')
  const named = /Error Code: (\w+)/.exec(text)
  if (named) {
    const idx = PROGRAM_ERRORS.findIndex(([n]) => n === named[1])
    if (idx >= 0) return { name: PROGRAM_ERRORS[idx][0], message: PROGRAM_ERRORS[idx][1] }
  }
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(text)
  if (hex) {
    const hit = programErrorFromCode(parseInt(hex[1], 16))
    if (hit) return hit
  }
  const custom = (input.err as { InstructionError?: [number, { Custom?: number }] } | undefined)?.InstructionError?.[1]?.Custom
  if (typeof custom === 'number') return programErrorFromCode(custom)
  return null
}

export function classifyError(e: unknown, logs?: string[] | null): TxFailure {
  const err = e as { name?: string; message?: string; code?: number; logs?: string[]; error?: { code?: number } }
  const name = err?.name ?? ''
  const message = String(err?.message ?? e ?? 'Unknown error')
  const allLogs = logs ?? err?.logs ?? undefined

  if (
    name === 'WalletSignTransactionError' && /reject|denied|cancel|declin/i.test(message) ||
    err?.code === 4001 ||
    err?.error?.code === 4001 ||
    /user rejected|rejected the request|request rejected|user denied|declined|cancelled by user/i.test(message)
  ) {
    return { kind: 'rejected', message: 'You rejected the request in your wallet. Nothing was sent.' }
  }
  const prog = parseProgramError({ logs: allLogs, message, err: e })
  if (prog) return { kind: 'program', programError: prog.name, message: prog.message, logs: allLogs }
  if (/insufficient (funds|lamports)|no record of a prior credit|insufficient balance/i.test(message + (allLogs ?? []).join('\n'))) {
    return { kind: 'insufficient-funds', message: 'Insufficient Devnet SOL to pay for this transaction and its fees.', logs: allLogs }
  }
  if (/blockhash not found|block height exceeded|TransactionExpired/i.test(message)) {
    return { kind: 'blockhash-expired', message: 'The transaction expired before confirmation. Please try again.' }
  }
  if (/WalletNotConnected|WalletNotReady|WalletSignTransactionError|WalletSendTransactionError/i.test(name + message)) {
    return { kind: 'wallet', message: `Wallet error: ${message}` }
  }
  if (/failed to fetch|network|ECONN|timeout|503|429/i.test(message)) {
    return { kind: 'network', message: `Could not reach the Solana RPC: ${message}` }
  }
  return { kind: 'unknown', message, logs: allLogs }
}

/* ------------------------------------------------------------------ send */

export interface SendDeps {
  connection: Pick<
    Connection,
    'getLatestBlockhash' | 'simulateTransaction' | 'sendRawTransaction' | 'confirmTransaction' | 'getGenesisHash'
  >
  wallet: SigningWallet
  instructions: TransactionInstruction[]
  expectedCluster?: ClusterName
  onPhase?: (phase: TxPhase, signature?: string) => void
}

export async function sendAndConfirm({ connection, wallet, instructions, expectedCluster = 'devnet', onPhase }: SendDeps): Promise<TxResult> {
  const phase = (p: TxPhase, sig?: string) => onPhase?.(p, sig)
  const fail = (failure: TxFailure): TxResult => {
    phase(failure.kind === 'rejected' ? 'rejected' : 'failed', failure.signature)
    return { ok: false, failure }
  }

  if (!wallet.publicKey) return fail({ kind: 'wallet', message: 'Connect a wallet first.' })
  if (!wallet.signTransaction) return fail({ kind: 'wallet', message: 'This wallet cannot sign transactions.' })

  phase('preparing')
  try {
    const cluster = await detectCluster(connection)
    if (cluster !== expectedCluster) {
      return fail({
        kind: 'wrong-network',
        message: `The app is connected to ${cluster}, but this action requires ${expectedCluster}. Check VITE_SOLANA_RPC_URL.`,
      })
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    const message = new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message()
    const tx = new VersionedTransaction(message)

    // Simulate before asking for a signature, so doomed transactions never reach the wallet.
    const sim = await connection.simulateTransaction(tx, { sigVerify: false, commitment: 'confirmed' })
    if (sim.value.err) {
      const f = classifyError({ message: JSON.stringify(sim.value.err) }, sim.value.logs)
      const prog = parseProgramError({ logs: sim.value.logs, err: sim.value.err })
      return fail(prog ? { kind: 'program', programError: prog.name, message: prog.message, logs: sim.value.logs ?? undefined } : f)
    }

    phase('awaiting-signature')
    const signed = await wallet.signTransaction(tx)

    const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 })
    phase('submitted', signature)

    const conf = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
    if (conf.value.err) {
      const prog = parseProgramError({ err: conf.value.err })
      return fail({
        kind: prog ? 'program' : 'unknown',
        programError: prog?.name,
        message: prog?.message ?? `Transaction failed on-chain: ${JSON.stringify(conf.value.err)}`,
        signature,
      })
    }
    phase('confirmed', signature)
    return { ok: true, signature }
  } catch (e) {
    return fail(classifyError(e))
  }
}

export function explorerTxUrl(signature: string, cluster = 'devnet') {
  return `https://explorer.solana.com/tx/${signature}${cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`}`
}
