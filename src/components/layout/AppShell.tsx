import { Compass, FlaskConical, Gavel, PenTool, PlusCircle, UserCog } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Suspense, useEffect } from 'react'
import { AccountButton } from '@/components/layout/AccountButton'
import { Logo } from '@/components/layout/Logo'
import { NetworkIndicator } from '@/components/layout/NetworkIndicator'
import { SearchBar } from '@/components/layout/SearchBar'
import { Skeleton } from '@/components/ui/misc'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/explore', label: 'Explore', icon: Compass, match: (p: string) => p.startsWith('/explore') || p.startsWith('/strategy/') },
  { to: '/auctions', label: 'Auctions', icon: Gavel, match: (p: string) => p.startsWith('/auctions') },
  { to: '/create', label: 'Create strategy', icon: PlusCircle, match: (p: string) => p.startsWith('/create') },
  { to: '/creator', label: 'My strategies', icon: PenTool, match: (p: string) => p.startsWith('/creator') },
]

function NavItems({ variant }: { variant: 'desktop' | 'mobile' }) {
  const { pathname } = useLocation()
  return (
    <>
      {NAV.map(({ to, label, icon: Icon, match }) => {
        const active = match(pathname)
        return (
          <NavLink
            key={label}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 text-sm font-semibold transition-colors whitespace-nowrap',
              variant === 'desktop'
                ? cn('h-9 rounded-full px-3.5', active ? 'bg-accent/15 text-accent' : 'text-fg-2 hover:bg-white/[0.05] hover:text-fg')
                : cn('h-11 border-b-2 px-1', active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'),
            )}
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        )
      })}
    </>
  )
}

function DemoBanner() {
  return (
    <div className="border-b border-warn/15 bg-warn/[0.06]">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-2 text-xs sm:px-6">
        <FlaskConical className="size-3.5 shrink-0 text-warn" />
        <p className="min-w-0 text-fg-2">
          <span className="font-semibold text-warn">Hackathon MVP on Solana Devnet.</span> Demo strategies and demo auctions are sample data. Auctions marked “Solana
          Devnet” are real program accounts paid in test USDC — no real money.
        </p>
      </div>
    </div>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Link to="/explore" aria-label="StratX home" className="shrink-0 rounded-xl">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
            <NavItems variant="desktop" />
          </nav>
          <SearchBar className="mx-auto hidden w-full max-w-sm 2xl:block" />
          <div className="ml-auto flex items-center gap-2 2xl:ml-0">
            <NetworkIndicator />
            <Tooltip content="Preferences">
              <Link to="/onboarding" aria-label="Preferences" className="hidden size-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg sm:inline-flex">
                <UserCog className="size-4" />
              </Link>
            </Tooltip>
            <AccountButton />
          </div>
        </div>
        <div className="border-t border-line px-4 py-2 sm:px-6 2xl:hidden">
          <SearchBar id="global-search-mobile" autoFocusShortcut={false} />
        </div>
        <nav aria-label="Primary" className="flex gap-5 overflow-x-auto px-4 sm:px-6 lg:hidden">
          <NavItems variant="mobile" />
        </nav>
      </header>
      <DemoBanner />

      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            <span className="font-semibold text-fg-2">StratX</span> · Trade strategies. Protect the edge. Prove the alpha.
          </span>
          <span>Solana Devnet MVP · Not investment advice · Source code and positions are never shown.</span>
        </div>
      </footer>
    </div>
  )
}
