import { createContext, useContext } from 'react'
import type { UserProfile } from '@/types/user'

export interface PreferencesContextValue {
  profile: UserProfile
  saveProfile: (profile: UserProfile) => void
  resetProfile: () => void
  watchlist: string[]
  toggleWatchlist: (strategyId: string) => void
  lastViewedStrategyId: string | null
  setLastViewedStrategyId: (id: string) => void
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>')
  return ctx
}
