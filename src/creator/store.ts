import { useSyncExternalStore } from 'react'
import type { CreatorStrategyRecord } from '@/creator/types'
import { readJson, writeJson } from '@/lib/storage'

/**
 * Quant-created strategies, stored in this browser for the MVP.
 * Their on-chain listings (title, prices, offers) are public on Devnet; the
 * performance file and analysis stay with the creator until a shared index
 * exists (a later stage).
 */
const KEY = 'stratx.creatorStrategies.v1'
let cache: CreatorStrategyRecord[] | null = null
let version = 0
const listeners = new Set<() => void>()

export function loadCreatorRecords(): CreatorStrategyRecord[] {
  if (typeof window === 'undefined') return []
  cache ??= readJson<CreatorStrategyRecord[]>(KEY, [])
  return cache
}

function commit(next: CreatorStrategyRecord[]) {
  cache = next
  version++
  writeJson(KEY, next)
  listeners.forEach((l) => l())
}

export function saveCreatorRecord(r: CreatorStrategyRecord) {
  const rest = loadCreatorRecords().filter((x) => x.id !== r.id)
  commit([r, ...rest])
}

export function removeCreatorRecord(id: string) {
  commit(loadCreatorRecords().filter((x) => x.id !== id))
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null
      version++
      cb()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

/** Re-renders when creator strategies change (this tab or another). */
export function useCreatorRecordsVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0)
}

export function useCreatorRecords() {
  useCreatorRecordsVersion()
  return loadCreatorRecords()
}
