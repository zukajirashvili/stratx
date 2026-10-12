import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AccountProvider } from '@/auth/AccountProvider'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/misc'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExplorePage } from '@/pages/explore/ExplorePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OnchainProvider } from '@/providers/OnchainProvider'
import { PreferencesProvider } from '@/providers/PreferencesProvider'
import { usePreferences } from '@/providers/preferences'
import { SolanaProvider } from '@/providers/SolanaProvider'

// Route-level code splitting: charts and heavier flows load on demand.
const StrategyDetailsPage = lazy(() => import('@/pages/strategy/StrategyDetailsPage').then((m) => ({ default: m.StrategyDetailsPage })))
const CreatorStudioPage = lazy(() => import('@/pages/creator/CreatorStudioPage').then((m) => ({ default: m.CreatorStudioPage })))
const CreateStrategyPage = lazy(() => import('@/pages/create/CreateStrategyPage').then((m) => ({ default: m.CreateStrategyPage })))
const AuctionsPage = lazy(() => import('@/pages/auctions/AuctionsPage').then((m) => ({ default: m.AuctionsPage })))
const OnboardingPage = lazy(() => import('@/pages/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })))

function RouteFallback() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-4">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-72" />
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16">
          <ErrorState title="Something went wrong" error={this.state.error} onRetry={() => window.location.reload()} />
        </div>
      )
    }
    return this.props.children
  }
}

/** First-time visitors go through onboarding once; skipping is always allowed. */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { profile } = usePreferences()
  const location = useLocation()
  if (profile.status === 'new') {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <SolanaProvider>
        <AccountProvider>
          <OnchainProvider>
            <PreferencesProvider>
              <TooltipProvider>
                <BrowserRouter>
                  <Suspense
                    fallback={
                      <div className="mx-auto max-w-2xl px-4 py-12">
                        <RouteFallback />
                      </div>
                    }
                  >
                    <Routes>
                      <Route path="/onboarding" element={<OnboardingPage />} />
                      <Route
                        element={
                          <OnboardingGate>
                            <AppShell />
                          </OnboardingGate>
                        }
                      >
                        <Route index element={<Navigate to="/explore" replace />} />
                        <Route path="/explore" element={<ExplorePage />} />
                        <Route path="/auctions" element={<AuctionsPage />} />
                        <Route path="/create" element={<CreateStrategyPage />} />
                        <Route path="/strategy/:id" element={<StrategyDetailsPage />} />
                        <Route path="/creator" element={<CreatorStudioPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Route>
                    </Routes>
                  </Suspense>
                </BrowserRouter>
              </TooltipProvider>
            </PreferencesProvider>
          </OnchainProvider>
        </AccountProvider>
      </SolanaProvider>
    </ErrorBoundary>
  )
}
