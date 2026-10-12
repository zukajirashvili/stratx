import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Kbd } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

/**
 * Global natural-language search entry point. Submitting routes to Explore
 * with the query in the URL (`?q=`), so it survives reloads and is shareable.
 */
export function SearchBar({
  className,
  id = 'global-search',
  autoFocusShortcut = true,
}: {
  className?: string
  id?: string
  autoFocusShortcut?: boolean
}) {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const urlQuery = location.pathname === '/explore' ? (params.get('q') ?? '') : ''
  const [value, setValue] = useState(urlQuery)
  const [syncedQuery, setSyncedQuery] = useState(urlQuery)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the field in sync when the URL query changes (e.g. a constraint chip is removed).
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery)
    setValue(urlQuery)
  }

  useEffect(() => {
    if (!autoFocusShortcut) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [autoFocusShortcut])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = new URLSearchParams(location.pathname === '/explore' ? params : undefined)
    const q = value.trim()
    if (q) next.set('q', q)
    else next.delete('q')
    navigate({ pathname: '/explore', search: next.toString() })
  }

  const clear = () => {
    setValue('')
    if (location.pathname === '/explore' && params.get('q')) {
      const next = new URLSearchParams(params)
      next.delete('q')
      navigate({ pathname: '/explore', search: next.toString() })
    }
    inputRef.current?.focus()
  }

  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        Search strategies in natural language
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Try "low-risk SOL strategies with drawdown under 10%"'
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-16 text-sm text-fg placeholder:text-faint transition-colors hover:border-faint focus:border-accent/60 focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/20 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value ? (
          <button type="button" onClick={clear} aria-label="Clear search" className="rounded p-1 text-muted hover:text-fg">
            <X className="size-3.5" />
          </button>
        ) : (
          <span className="hidden sm:inline">
            <Kbd>/</Kbd>
          </span>
        )}
      </div>
    </form>
  )
}
