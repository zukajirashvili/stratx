import { useMemo } from 'react'
import type { PerformancePoint } from '@/types/strategy'

/** Lightweight SVG sparkline of the equity curve (sampled to ~60 points). */
export function Sparkline({
  series,
  width = 120,
  height = 36,
  className,
}: {
  series: PerformancePoint[]
  width?: number
  height?: number
  className?: string
}) {
  const { path, area, up } = useMemo(() => {
    const step = Math.max(1, Math.floor(series.length / 60))
    const pts = series.filter((_, i) => i % step === 0 || i === series.length - 1).map((p) => p.equity)
    const min = Math.min(...pts)
    const max = Math.max(...pts)
    const span = max - min || 1
    const coords = pts.map((v, i) => [
      (i / (pts.length - 1)) * width,
      height - 2 - ((v - min) / span) * (height - 4),
    ])
    const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    return { path: d, area: `${d} L${width},${height} L0,${height} Z`, up: pts[pts.length - 1] >= pts[0] }
  }, [series, width, height])

  const color = up ? 'var(--color-pos)' : 'var(--color-neg)'
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Equity curve, ${up ? 'up' : 'down'} since inception`}
    >
      <path d={area} fill={color} opacity={0.08} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
