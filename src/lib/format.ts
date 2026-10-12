export function formatPercent(value: number, opts: { digits?: number; signed?: boolean } = {}) {
  const { digits = 1, signed = false } = opts
  const pct = value * 100
  const sign = signed && pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(digits)}%`
}

export function formatRatio(value: number, digits = 2) {
  return value.toFixed(digits)
}

export function formatSol(value: number, digits?: number) {
  const d = digits ?? (value >= 100 ? 1 : 2)
  return `${value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })} SOL`
}

export function formatUsdCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatDuration(days: number) {
  if (days < 60) return `${days}d`
  const months = Math.floor(days / 30.44)
  if (months < 24) return `${months} mo`
  const years = days / 365.25
  return `${years.toFixed(1)} yr`
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(iso).toLocaleDateString('en-US', opts)
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60_000)
  let out: string
  if (mins < 1) out = 'just now'
  else if (mins < 60) out = `${mins} min`
  else if (mins < 60 * 48) out = `${Math.round(mins / 60)} h`
  else out = `${Math.round(mins / 1440)} d`
  if (out === 'just now') return out
  return diff >= 0 ? `${out} ago` : `in ${out}`
}

/** Countdown like `1d 04:12:09` or `04:12:09`. */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`
  return d > 0 ? `${d}d ${hms}` : hms
}

export function shortAddress(address: string, chars = 4) {
  if (address.length <= chars * 2 + 1) return address
  return `${address.slice(0, chars)}…${address.slice(-chars)}`
}
