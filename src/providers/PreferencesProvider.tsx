import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { PreferencesContext } from '@/providers/preferences'
import { readJson, removeKey, writeJson } from '@/lib/storage'
import { NEW_PROFILE, type UserProfile } from '@/types/user'

/**
 * Per-browser preferences: onboarding profile, watchlist, last viewed strategy.
 * Stored locally for the MVP; a later stage can key these to the connected
 * wallet via a signed message and persist them server-side.
 */
const KEYS = {
  profile: 'stratx.profile.v1',
  watchlist: 'stratx.watchlist.v1',
  lastViewed: 'stratx.lastViewed.v1',
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => ({ ...NEW_PROFILE, ...readJson(KEYS.profile, NEW_PROFILE) }))
  const [watchlist, setWatchlist] = useState<string[]>(() => readJson(KEYS.watchlist, []))
  const [lastViewed, setLastViewed] = useState<string | null>(() => readJson(KEYS.lastViewed, null))

  const saveProfile = useCallback((p: UserProfile) => {
    setProfile(p)
    writeJson(KEYS.profile, p)
  }, [])

  const resetProfile = useCallback(() => {
    setProfile(NEW_PROFILE)
    removeKey(KEYS.profile)
  }, [])

  const toggleWatchlist = useCallback((id: string) => {
    setWatchlist((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      writeJson(KEYS.watchlist, next)
      return next
    })
  }, [])

  const setLastViewedStrategyId = useCallback((id: string) => {
    setLastViewed(id)
    writeJson(KEYS.lastViewed, id)
  }, [])

  const value = useMemo(
    () => ({
      profile,
      saveProfile,
      resetProfile,
      watchlist,
      toggleWatchlist,
      lastViewedStrategyId: lastViewed,
      setLastViewedStrategyId,
    }),
    [profile, saveProfile, resetProfile, watchlist, toggleWatchlist, lastViewed, setLastViewedStrategyId],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
