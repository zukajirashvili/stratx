import { cn } from '@/lib/utils'

/** The StratX "S" mark (public/brand/stratx-mark.png, transparent, 222×252). */
export function LogoMark({ className }: { className?: string }) {
  return <img src="/brand/stratx-mark.png" alt="" width={28} height={32} className={cn('h-8 w-auto select-none', className)} draggable={false} />
}

/** Full logo: S mark above the STRATX wordmark. Used only on the onboarding Welcome screen. */
export function LogoFull({ className }: { className?: string }) {
  return <img src="/brand/stratx-logo.png" alt="StratX" width={730} height={544} className={cn('h-auto select-none', className)} draggable={false} />
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight text-fg">
        Strat<span className="text-accent">X</span>
      </span>
    </span>
  )
}
