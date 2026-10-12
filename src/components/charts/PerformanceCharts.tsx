import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MonthlyReturn, PerformancePoint } from '@/types/strategy'

const AXIS = { fontSize: 11, fill: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }
const GRID = 'var(--color-line)'
const STRATEGY_COLOR = 'var(--color-accent)'
const BENCH_COLOR = '#8fa3bb'

type RangeKey = '3M' | '6M' | '1Y' | 'ALL'
const RANGES: { key: RangeKey; days: number | null }[] = [
  { key: '3M', days: 91 },
  { key: '6M', days: 182 },
  { key: '1Y', days: 365 },
  { key: 'ALL', days: null },
]

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-line-strong bg-surface-3 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-muted">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-fg-2">
            {r.color && <span className="h-0.5 w-3 rounded" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num text-fg">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function RangeToggle({ value, onChange }: { value: RangeKey; onChange: (k: RangeKey) => void }) {
  return (
    <div role="group" aria-label="Chart range" className="inline-flex rounded-md border border-line-strong p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={value === r.key}
          onClick={() => onChange(r.key)}
          className={cn(
            'h-6 rounded px-2 text-[11px] font-medium',
            value === r.key ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {r.key}
        </button>
      ))}
    </div>
  )
}

/** Rebase a window of the series so both lines start at 0%. */
function useWindow(series: PerformancePoint[], range: RangeKey) {
  return useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days
    const slice = days && days < series.length ? series.slice(series.length - days - 1) : series
    const e0 = slice[0].equity
    const b0 = slice[0].benchmark
    const out: { date: string; strategy: number; benchmark: number; drawdown: number }[] = []
    for (let i = 0, peak = -Infinity; i < slice.length; i++) {
      const p = slice[i]
      peak = Math.max(peak, p.equity)
      out.push({ date: p.date, strategy: p.equity / e0 - 1, benchmark: p.benchmark / b0 - 1, drawdown: p.equity / peak - 1 })
    }
    return out
  }, [series, range])
}

export function EquityChart({ series, height = 280, benchmarkLabel = 'SOL buy & hold' }: { series: PerformancePoint[]; height?: number; benchmarkLabel?: string }) {
  const [range, setRange] = useState<RangeKey>('ALL')
  const data = useWindow(series, range)
  const last = data[data.length - 1]
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-fg-2" aria-label="Legend">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: STRATEGY_COLOR }} /> Strategy (net)
            <span className="num text-fg">{formatPercent(last.strategy, { signed: true })}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: BENCH_COLOR }} /> {benchmarkLabel}
            <span className="num text-fg">{formatPercent(last.benchmark, { signed: true })}</span>
          </span>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </div>
      <div style={{ height }} role="img" aria-label={`Cumulative return chart, ${range} range`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={48}
              tickFormatter={(d: string) => formatDate(d, { month: 'short', year: '2-digit' })}
            />
            <YAxis
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => formatPercent(v, { digits: 0 })}
            />
            <ReferenceLine y={0} stroke="var(--color-line-strong)" />
            <Tooltip
              cursor={{ stroke: 'var(--color-faint)', strokeDasharray: '3 3' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={formatDate(String(label))}
                    rows={[
                      { label: 'Strategy', value: formatPercent(Number(payload[0]?.payload.strategy), { signed: true }), color: STRATEGY_COLOR },
                      { label: benchmarkLabel, value: formatPercent(Number(payload[0]?.payload.benchmark), { signed: true }), color: BENCH_COLOR },
                    ]}
                  />
                ) : null
              }
            />
            <Line type="monotone" dataKey="benchmark" stroke={BENCH_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="strategy" stroke={STRATEGY_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface)' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function DrawdownChart({ series, height = 160 }: { series: PerformancePoint[]; height?: number }) {
  const data = useWindow(series, 'ALL')
  // Shallow drawdowns need a decimal place or the axis ticks repeat (-2%, -2%).
  const shallow = Math.min(...data.map((d) => d.drawdown)) > -0.1
  return (
    <div style={{ height }} role="img" aria-label="Underwater (drawdown) chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={48}
            tickFormatter={(d: string) => formatDate(d, { month: 'short', year: '2-digit' })}
          />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatPercent(v, { digits: shallow ? 1 : 0 })} />
          <Tooltip
            cursor={{ stroke: 'var(--color-faint)', strokeDasharray: '3 3' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox title={formatDate(String(label))} rows={[{ label: 'Drawdown', value: formatPercent(Number(payload[0]?.value)) }]} />
              ) : null
            }
          />
          <Area type="monotone" dataKey="drawdown" stroke="var(--color-neg)" strokeWidth={1.5} fill="var(--color-neg)" fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Monthly returns grid with a diverging (red ↔ neutral ↔ green) fill; values always printed. */
export function MonthlyReturnsTable({ months }: { months: MonthlyReturn[] }) {
  const years = [...new Set(months.map((m) => m.year))].sort((a, b) => b - a)
  const maxAbs = Math.max(0.05, ...months.map((m) => Math.abs(m.value)))
  const cell = (v: number | undefined) => {
    if (v === undefined) return { style: {}, text: '' }
    const a = Math.min(1, Math.abs(v) / maxAbs) * 0.45 + 0.05
    const color = v >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'
    return { style: { background: `color-mix(in oklab, ${color} ${Math.round(a * 100)}%, transparent)` }, text: formatPercent(v) }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">Monthly net returns</caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-left font-medium text-muted">Year</th>
            {MONTHS.map((m) => (
              <th key={m} scope="col" className="px-1 py-1 text-center font-medium text-muted">{m}</th>
            ))}
            <th scope="col" className="px-2 py-1 text-right font-medium text-muted">Year</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const row = months.filter((m) => m.year === y)
            const yearTotal = row.reduce((acc, m) => acc * (1 + m.value), 1) - 1
            return (
              <tr key={y}>
                <th scope="row" className="num px-2 py-1.5 text-left font-normal text-fg-2">{y}</th>
                {MONTHS.map((_, i) => {
                  const c = cell(row.find((m) => m.month === i)?.value)
                  return (
                    <td key={i} className="num rounded-sm px-1 py-1.5 text-center text-fg" style={c.style}>
                      {c.text || <span className="text-faint">–</span>}
                    </td>
                  )
                })}
                <td className={cn('num px-2 py-1.5 text-right font-medium', yearTotal >= 0 ? 'text-pos' : 'text-neg')}>
                  {formatPercent(yearTotal)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
