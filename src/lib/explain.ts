import { formatDuration, formatPercent } from '@/lib/format'
import { TIER_CLASS_LABEL, tierClass, type TierClass } from '@/reputation/display'
import type { Strategy } from '@/types/strategy'

/** One-sentence meaning of each tier, in plain language. */
export const TIER_MEANING: Record<TierClass, string> = {
  obsidian: 'the highest tier — a long, independently verified and trusted record.',
  diamond: 'an exceptional, well-verified record over two years or more.',
  platinum: 'a strong record with solid verification over at least a year.',
  gold: 'a good record with authenticated data over at least six months.',
  silver: 'a decent record, but with shorter history or lighter verification.',
  bronze: 'an early or weakly verified record — treat with caution.',
  'not-tiered': 'scores well enough for a tier but fails one of its safety checks.',
  'below-bronze': 'the record is too weak or too risky to earn a tier yet.',
  unrated: 'not enough verified information to give it a score yet.',
}

function sharpeWord(s: number) {
  if (s >= 2) return 'excellent'
  if (s >= 1.5) return 'strong'
  if (s >= 1) return 'good'
  if (s >= 0.5) return 'modest'
  return 'weak'
}

export interface PlainPoint {
  tone: 'good' | 'neutral' | 'caution'
  text: string
}

/** Plain-language summary of a strategy, built only from its actual data. */
export function explainStrategy(s: Strategy): PlainPoint[] {
  const m = s.metrics
  const cls = tierClass(s.reputation)
  const points: PlainPoint[] = []

  points.push({
    tone: ['obsidian', 'diamond', 'platinum', 'gold'].includes(cls) ? 'good' : cls === 'silver' ? 'neutral' : 'caution',
    text: `${TIER_CLASS_LABEL[cls]}: ${TIER_MEANING[cls]}${s.reputation.score !== null ? ` Score ${s.reputation.score.toFixed(1)} / 100.` : ''}`,
  })
  points.push({
    tone: m.cagr > 0 ? 'good' : 'caution',
    text: `${m.cagr >= 0 ? 'Grew' : 'Lost'} about ${formatPercent(Math.abs(m.cagr), { digits: 0 })} a year over ${formatDuration(m.trackRecordDays)} — ${/^[aeiou]/.test(sharpeWord(m.sharpe)) ? 'an' : 'a'} ${sharpeWord(m.sharpe)} return for the risk taken (Sharpe ${m.sharpe.toFixed(2)}).`,
  })
  const dd = Math.abs(m.maxDrawdown)
  points.push({
    tone: dd <= 0.1 ? 'good' : dd <= 0.25 ? 'neutral' : 'caution',
    text: `Its worst fall from a peak was ${formatPercent(dd, { digits: 1 })}, so it’s rated ${s.riskLevel} risk. Expect swings of about ${formatPercent(m.annualizedVolatility, { digits: 0 })} a year.`,
  })
  if (s.source === 'demo') {
    points.push({ tone: 'caution', text: 'Demo data: this strategy and its numbers are illustrative only — not real results.' })
  } else if (s.source === 'self-reported') {
    points.push({ tone: 'caution', text: 'The performance was uploaded by the creator and only format-checked. It hasn’t been independently verified.' })
  }
  return points
}
