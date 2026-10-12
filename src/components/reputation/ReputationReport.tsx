import { AlertOctagon, AlertTriangle, Check, ChevronDown, Info, Minus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { TierLabel } from '@/components/reputation/TierLabel'
import { DemoTag } from '@/components/strategy/badges'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DENOMINATION_TO_USD, FACTOR_WEIGHTS, POLICY, TIER_GATES } from '@/reputation/config'
import { STATUS_LABEL, TIER_LABEL, tierClass } from '@/reputation/display'
import type {
  FactorResult,
  ReputationResult,
  ReputationWarning,
  SubfactorResult,
  TierEvaluation,
} from '@/reputation/types'

const pct = (w: number) => `${Math.round(w * 100)}%`
const fmtScore = (s: number | null) => (s === null ? '—' : Number.isInteger(s) ? String(s) : s.toFixed(1))

function scoreBar(score: number | null) {
  if (score === null) return 'bg-faint'
  if (score >= 75) return 'bg-accent'
  if (score >= 50) return 'bg-info'
  if (score >= 25) return 'bg-warn'
  return 'bg-neg'
}

function Meter({ score, label }: { score: number | null; label: string }) {
  return (
    <div
      className="h-1.5 w-full min-w-16 rounded-full bg-surface-3"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score ?? undefined}
      aria-valuetext={score === null ? 'Unavailable' : `${fmtScore(score)} of 100`}
    >
      {score !== null && <div className={cn('h-full rounded-full', scoreBar(score))} style={{ width: `${score}%` }} />}
    </div>
  )
}

function StatusPill({ status }: { status: SubfactorResult['status'] | FactorResult['status'] }) {
  const map = {
    available: ['text-pos', 'Available'],
    complete: ['text-pos', 'Complete'],
    partial: ['text-warn', 'Partial'],
    unavailable: ['text-muted', 'Unavailable'],
    invalid: ['text-neg', 'Invalid'],
  } as const
  const [cls, label] = map[status]
  return <span className={cn('text-[11px] font-medium', cls)}>{label}</span>
}

/* ------------------------------------------------------------------ warnings */

const SEVERITY = {
  critical: { icon: AlertOctagon, cls: 'text-neg', order: 0 },
  warning: { icon: AlertTriangle, cls: 'text-warn', order: 1 },
  info: { icon: Info, cls: 'text-info', order: 2 },
}

function Warnings({ warnings }: { warnings: ReputationWarning[] }) {
  const sorted = [...warnings].sort((a, b) => SEVERITY[a.severity].order - SEVERITY[b.severity].order)
  return (
    <ul className="space-y-1.5">
      {sorted.map((w, idx) => {
        const S = SEVERITY[w.severity]
        return (
          <li key={`${w.code}-${idx}`} className="flex gap-2 text-xs leading-relaxed text-fg-2">
            <S.icon className={cn('mt-0.5 size-3.5 shrink-0', S.cls)} aria-label={w.severity} />
            <span>{w.message}</span>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ subfactors */

function ThresholdTable({ sub }: { sub: SubfactorResult }) {
  if (!sub.table.length) return null
  return (
    <table className="mt-1.5 w-full max-w-md text-[11px]">
      <caption className="sr-only">Thresholds for {sub.label}</caption>
      <tbody>
        {sub.table.map((row) => {
          const hit = row.label === sub.matchedBand
          return (
            <tr key={row.label} className={cn(hit ? 'text-fg' : 'text-muted')}>
              <td className="py-0.5 pr-3">
                {hit && <span className="sr-only">Matched: </span>}
                <span className={cn(hit && 'rounded bg-accent/15 px-1 text-accent')}>{row.label}</span>
              </td>
              <td className="num py-0.5 text-right">{row.score}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function SubfactorRow({ sub, depth = 0 }: { sub: SubfactorResult; depth?: number }) {
  const [open, setOpen] = useState(false)
  const canExpand = sub.table.length > 0
  return (
    <>
      <tr className="border-t border-line align-top">
        <td className="py-2 pr-2" style={{ paddingLeft: depth * 16 }}>
          <div className="flex items-start gap-1.5">
            <span className="num shrink-0 text-[11px] text-faint">{sub.key}</span>
            <div className="min-w-0">
              <div className="text-xs text-fg">
                {sub.label}
                {sub.essential && <span className="ml-1 text-[10px] uppercase tracking-wide text-faint">essential</span>}
              </div>
              <div className="text-[11px] text-muted">{sub.inputDisplay}</div>
              {sub.reason && <div className="text-[11px] text-warn">{sub.reason}</div>}
              {canExpand && (
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-accent hover:underline"
                >
                  <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
                  {open ? 'Hide thresholds' : sub.matchedBand ? `Band: ${sub.matchedBand}` : 'Thresholds'}
                </button>
              )}
              {open && <ThresholdTable sub={sub} />}
            </div>
          </div>
        </td>
        <td className="num py-2 pr-2 text-right text-xs text-fg-2">{pct(sub.weight)}</td>
        <td className="py-2 pr-2">
          <div className="flex items-center gap-2">
            <Meter score={sub.score} label={`${sub.label} score`} />
            <span className="num w-9 text-right text-xs text-fg">{fmtScore(sub.score)}</span>
          </div>
        </td>
        <td className="py-2 text-right">
          <StatusPill status={sub.status} />
        </td>
      </tr>
      {sub.components?.map((c) => <SubfactorRow key={c.key} sub={c} depth={depth + 1} />)}
    </>
  )
}

function FactorBlock({ f }: { f: FactorResult }) {
  const [open, setOpen] = useState(false)
  const id = `factor-${f.key}`
  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-3 text-left hover:bg-surface-2 sm:grid-cols-[1fr_52px_160px_64px_20px]"
      >
        <span className="min-w-0">
          <span className="num mr-2 text-xs text-faint">{f.key}</span>
          <span className="text-sm font-medium text-fg">{f.label}</span>
          {f.note && <span className="ml-2 text-[11px] text-muted">· {f.note}</span>}
        </span>
        <span className="num hidden text-right text-xs text-fg-2 sm:block">{pct(f.weight)}</span>
        <span className="hidden items-center gap-2 sm:flex">
          <Meter score={f.score} label={`${f.label} score`} />
          <span className="num w-9 text-right text-xs text-fg">{fmtScore(f.score)}</span>
        </span>
        <span className="num hidden text-right text-xs text-fg sm:block">+{f.contribution.toFixed(2)}</span>
        <span className="flex items-center gap-2 sm:contents">
          <span className="num text-xs text-fg sm:hidden">{fmtScore(f.score)}</span>
          <ChevronDown className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div id={id} className="bg-bg/40 px-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <code className="num text-[11px] text-fg-2">{f.formula}</code>
            <StatusPill status={f.status} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <caption className="sr-only">{f.label} subfactors</caption>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-faint">
                  <th scope="col" className="pb-1 text-left font-medium">Subfactor · input</th>
                  <th scope="col" className="pb-1 pr-2 text-right font-medium">Weight</th>
                  <th scope="col" className="w-40 pb-1 font-medium">Score</th>
                  <th scope="col" className="pb-1 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {f.subfactors.map((s) => (
                  <SubfactorRow key={s.key} sub={s} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ eligibility */

function Eligibility({ evaluations, awarded }: { evaluations: TierEvaluation[]; awarded: string | null }) {
  const [showAll, setShowAll] = useState(false)
  const relevant = showAll ? [...evaluations].reverse() : [...evaluations].reverse().filter((e) => e.scoreQualifies)
  return (
    <div>
      <div className="space-y-2">
        {relevant.length === 0 && <p className="text-xs text-muted">Score does not reach any tier's range.</p>}
        {relevant.map((e) => (
          <div
            key={e.tier}
            className={cn('rounded-md border p-3', e.tier === awarded ? 'border-accent/50 bg-accent/[0.05]' : 'border-line')}
          >
            <div className="flex flex-wrap items-center gap-2">
              <TierLabel tier={e.tier} />
              <span className="num text-[11px] text-muted">
                score {e.minScore}
                {e.maxScoreExclusive === Infinity ? '+' : `–<${e.maxScoreExclusive}`}
              </span>
              <span className={cn('ml-auto text-xs font-medium', e.eligible ? 'text-pos' : 'text-muted')}>
                {e.tier === awarded ? 'Awarded' : e.eligible ? 'Eligible' : e.scoreQualifies ? 'Gates not met' : 'Score below range'}
              </span>
            </div>
            <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <li className="flex items-start gap-1.5 text-[11px]">
                {e.scoreQualifies ? <Check className="mt-px size-3 shrink-0 text-pos" /> : <X className="mt-px size-3 shrink-0 text-neg" />}
                <span className="text-fg-2">Score ≥ {e.minScore}</span>
              </li>
              {e.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-1.5 text-[11px]">
                  {c.passed ? <Check className="mt-px size-3 shrink-0 text-pos" /> : <X className="mt-px size-3 shrink-0 text-neg" />}
                  <span className="text-fg-2">
                    {c.label} <span className="text-faint">({c.detail})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 text-xs text-accent hover:underline">
        {showAll ? 'Show only tiers within score range' : 'Show gates for all six tiers'}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ report */

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function ReputationReport({ reputation: r }: { reputation: ReputationResult }) {
  const cls = tierClass(r)
  const demo = r.dataSource === 'demo'
  return (
    <div className="space-y-6">
      {demo && (
        <div role="note" className="rounded-md border border-dashed border-warn/40 bg-warn/[0.05] p-3 text-xs leading-relaxed text-fg-2">
          <span className="font-semibold text-warn">Simulated inputs.</span> This strategy, its performance record and every
          verification attribute below (source authenticity, integrity checks, independent review, dates) are demo data
          describing how such a record <em>would</em> score. No real verification has taken place, and nothing here is
          real-world performance.
        </div>
      )}
      {/* Summary */}
      <div className="grid gap-4 rounded-lg border border-line bg-bg/40 p-4 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TierLabel tier={cls} size="md" className="text-sm" />
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[11px] font-medium',
                r.status === 'rated' && 'border-pos/40 text-pos',
                r.status === 'provisional' && 'border-warn/40 text-warn',
                r.status === 'unrated' && 'border-line-strong text-muted',
              )}
            >
              {STATUS_LABEL[r.status]}
            </span>
            {r.dataSource === 'demo' && <DemoTag />}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {r.status === 'unrated'
              ? 'Essential inputs are missing or invalid, so no score or tier is issued.'
              : r.tier && r.scoreBandTier && r.tier !== r.scoreBandTier
                ? `Score falls in the ${TIER_LABEL[r.scoreBandTier]} range; eligibility gates award ${TIER_LABEL[r.tier]}.`
                : r.tier
                  ? `Score range and all ${TIER_LABEL[r.tier]} eligibility gates are met.`
                  : r.scoreBandTier
                    ? 'Score is within a tier range, but no tier’s eligibility gates are met.'
                    : 'Score is below the Bronze minimum.'}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
            <div>
              <dt className="text-faint">{demo ? 'Last verified (simulated)' : 'Last verified'}</dt>
              <dd className="text-fg-2">{r.lastVerifiedAt ? formatDate(r.lastVerifiedAt) : 'Never'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-faint">{demo ? 'Evidence source (simulated)' : 'Evidence source'}</dt>
              <dd className="text-fg-2">{r.evidenceSource}</dd>
            </div>
          </dl>
        </div>
        <div className="sm:text-right">
          <div className="text-[11px] uppercase tracking-wide text-muted">Score</div>
          <div className="num text-3xl font-medium text-fg">
            {r.score === null ? '—' : r.score.toFixed(1)}
            <span className="text-base text-faint"> / 100</span>
          </div>
          {r.status !== 'unrated' && r.maxAttainable < 100 && (
            <div className="text-[11px] text-muted">max attainable {r.maxAttainable}</div>
          )}
        </div>
      </div>

      {r.status === 'unrated' && r.missingEssential.length > 0 && (
        <div role="alert" className="rounded-md border border-neg/30 bg-neg/[0.05] p-3 text-xs text-fg-2">
          <div className="mb-1 font-medium text-fg">Missing essential data</div>
          <ul className="list-disc pl-4">
            {r.missingEssential.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <Section title="Warnings">
        <Warnings warnings={r.warnings} />
      </Section>

      <Section
        title="Seven factors"
        aside={<span className="text-[11px] text-faint">Click a factor for subfactors & thresholds</span>}
      >
        <div className="overflow-hidden rounded-md border border-line">
          <div className="hidden grid-cols-[1fr_52px_160px_64px_20px] gap-3 border-b border-line bg-surface-2/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-faint sm:grid">
            <span>Factor</span>
            <span className="text-right">Weight</span>
            <span>Score</span>
            <span className="text-right">Contrib.</span>
            <span />
          </div>
          {r.factors.map((f) => (
            <FactorBlock key={f.key} f={f} />
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-line-strong bg-surface-2/40 px-3 py-2 text-xs">
            <code className="num text-[11px] text-fg-2">S = 0.25P + 0.20R + 0.15C + 0.15T + 0.10K + 0.10V + 0.05U</code>
            <span className="num font-medium text-fg">{r.score === null ? 'UNRATED' : r.score.toFixed(1)}</span>
          </div>
        </div>
      </Section>

      {r.status !== 'unrated' && (
        <Section title="Tier eligibility">
          <Eligibility evaluations={r.tierEvaluations} awarded={r.tier} />
        </Section>
      )}

      <Section title="Methodology">
        <ul className="space-y-1.5 text-xs leading-relaxed text-fg-2">
          <li className="flex gap-2">
            <Minus className="mt-1 size-3 shrink-0 text-faint" />
            Weights: {Object.entries(FACTOR_WEIGHTS).map(([k, w]) => `${k} ${pct(w)}`).join(' · ')}. Every factor is 0–100 from explicit threshold tables (see each subfactor).
          </li>
          <li className="flex gap-2">
            <Minus className="mt-1 size-3 shrink-0 text-faint" />
            Missing essential inputs (P1, P2, R1, R2, T1, T2, V1–V4) make a strategy UNRATED. Missing non-essential inputs count as 0 and make the rating provisional — weights are never renormalised.
          </li>
          <li className="flex gap-2">
            <Minus className="mt-1 size-3 shrink-0 text-faint" />
            Participant Trust has no eligible data in this MVP. {POLICY.allowProvisionalWithoutTrust ? 'Prototype policy issues a provisional rating with U = 0 (max 95).' : 'Policy requires it; strategies are unrated.'}
          </li>
          <li className="flex gap-2">
            <Minus className="mt-1 size-3 shrink-0 text-faint" />
            A failed capital claim forces C = 0. Demo claim outcomes are computed deterministically from the demo series; in production only the vault program’s result counts. {DENOMINATION_TO_USD.SOL.label}.
          </li>
          <li className="flex gap-2">
            <Minus className="mt-1 size-3 shrink-0 text-faint" />
            Tiers ({TIER_GATES.map((g) => `${g.label} ${g.minScore}+ / ${g.minHistoryDays}d`).join(', ')}) need both the score range and eligibility gates; otherwise lower tiers are checked. Gates beyond score and history are a documented prototype policy.
          </li>
          <li className="flex gap-2">
            <Minus className="mt-1 size-3 shrink-0 text-faint" />
            Methodology v{r.methodologyVersion} · computed {formatDate(r.computedAt)} · {r.dataSource === 'demo' ? 'demo inputs' : 'on-chain inputs'}.
          </li>
        </ul>
      </Section>
    </div>
  )
}
