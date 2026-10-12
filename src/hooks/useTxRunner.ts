import { useCallback, useRef, useState } from 'react'
import type { TxFailure, TxPhase, TxResult } from '@/solana/tx'

export interface TxState {
  phase: TxPhase
  signature: string | null
  failure: TxFailure | null
}

const PENDING: TxPhase[] = ['preparing', 'awaiting-signature', 'submitted']

/**
 * Runs one transaction at a time. A ref lock (not just state) blocks double
 * clicks that land before React re-renders.
 */
export function useTxRunner() {
  const [state, setState] = useState<TxState>({ phase: 'idle', signature: null, failure: null })
  const lock = useRef(false)

  const run = useCallback(async <R extends TxResult>(fn: (onPhase: (p: TxPhase, sig?: string) => void) => Promise<R>): Promise<R | null> => {
    if (lock.current) return null
    lock.current = true
    setState({ phase: 'preparing', signature: null, failure: null })
    try {
      const result = await fn((phase, sig) => setState((s) => ({ ...s, phase, signature: sig ?? s.signature })))
      setState((s) =>
        result.ok
          ? { phase: 'confirmed', signature: result.signature, failure: null }
          : { phase: result.failure.kind === 'rejected' ? 'rejected' : 'failed', signature: result.failure.signature ?? s.signature, failure: result.failure },
      )
      return result
    } finally {
      lock.current = false
    }
  }, [])

  const reset = useCallback(() => setState({ phase: 'idle', signature: null, failure: null }), [])

  return { ...state, pending: PENDING.includes(state.phase), run, reset }
}
