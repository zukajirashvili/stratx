import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileUp, Gavel, Info, Sparkles, TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from '@/auth/account'
import { EquityChart } from '@/components/charts/PerformanceCharts'
import { BondForm } from '@/components/onchain/BondForm'
import { StartAuctionForm } from '@/components/onchain/StartAuctionForm'
import { ReputationReport } from '@/components/reputation/ReputationReport'
import { TierLabel } from '@/components/reputation/TierLabel'
import { Metric, toneFor } from '@/components/strategy/Metric'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Chip, Panel } from '@/components/ui/misc'
import { analyzeNavCsv, exampleNavCsv, MIN_POINTS } from '@/creator/analyze'
import { saveCreatorRecord } from '@/creator/store'
import { creatorRecordToStrategy, newStrategyId } from '@/creator/toStrategy'
import type { CreatorStrategyRecord } from '@/creator/types'
import { formatDuration, formatPercent, formatRatio } from '@/lib/format'
import { ASSET_LABEL, ASSET_ORDER, STYLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { DISCLOSURE_OPTIONS } from '@/pages/creator/CreatorDisclosurePreview'
import { usePreferences } from '@/providers/preferences'
import { CATEGORICAL } from '@/reputation/config'
import { tierClass } from '@/reputation/display'
import type { CostCompleteness } from '@/reputation/types'
import type { AssetCategory, StrategyStyle } from '@/types/strategy'

const STEPS = ['Basics', 'Performance data', 'What investors see', 'Review & publish'] as const
const input = 'h-12 w-full rounded-xl border border-line-strong bg-bg px-3 text-base text-fg placeholder:text-faint focus:border-accent focus:outline-none'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function CreateStrategyPage() {
  const navigate = useNavigate()
  const account = useAccount()
  const { profile } = usePreferences()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [style, setStyle] = useState<StrategyStyle>('trend')
  const [assets, setAssets] = useState<AssetCategory[]>(['sol-ecosystem'])
  const [primaryAssets, setPrimaryAssets] = useState('SOL')
  const [navCsv, setNavCsv] = useState('')
  const [isExample, setIsExample] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [disclosed, setDisclosed] = useState<string[]>(['Daily NAV series', 'Aggregate risk metrics', 'Monthly returns'])
  const [cost, setCost] = useState<CostCompleteness>('major-included')
  const [capacity, setCapacity] = useState('')
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null)
  const [dialogStep, setDialogStep] = useState<'bond' | 'auction'>('bond')
  const [draftCreatedAt] = useState(() => new Date().toISOString())

  const analysis = useMemo(() => (navCsv ? analyzeNavCsv(navCsv) : null), [navCsv])
  const record: CreatorStrategyRecord = {
    id: 'preview',
    name: name.trim() || 'Your strategy',
    tagline: tagline.trim(),
    description: description.trim(),
    style,
    assetCategories: assets,
    primaryAssets: primaryAssets.split(',').map((s) => s.trim()).filter(Boolean),
    disclosed,
    costCompleteness: cost,
    capacityUsd: capacity ? Number(capacity) : null,
    navCsv,
    isExampleData: isExample,
    creatorName: profile.creator?.displayName || account.label || 'Independent quant',
    ownerWallet: account.publicKey?.toBase58() ?? null,
    createdAt: draftCreatedAt,
  }
  const preview = useMemo(() => (analysis?.metrics ? creatorRecordToStrategy(record) : null), [analysis, name, tagline, description, style, assets, primaryAssets, disclosed, cost, capacity, isExample]) // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = [
    name.trim().length >= 3 && tagline.trim().length >= 5 && assets.length > 0,
    !!analysis?.metrics,
    disclosed.length > 0,
    !!preview,
  ][step]

  const loadFile = async (f: File) => {
    setFileName(f.name)
    setIsExample(false)
    setNavCsv(await f.text())
  }

  const publish = () => {
    if (!preview) return
    const id = newStrategyId(name)
    saveCreatorRecord({ ...record, id, createdAt: new Date().toISOString() })
    setSaved({ id, name: record.name })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">Create a strategy</h1>
        <p className="mt-1 text-fg-2">Describe your strategy, upload its daily performance, and we’ll analyse it and give it a reputation tier. Your code and positions never leave your hands.</p>
      </div>

      <ol className="grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn('w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors', i === step ? 'border-accent bg-accent/10 text-fg' : i < step ? 'border-green-strong/60 bg-green/25 text-fg-2' : 'border-line text-muted')}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="block font-bold">Step {i + 1}</span>
              <span className="hidden sm:block">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <Panel className="p-5 sm:p-7">
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Strategy name">
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Momentum Alpha" />
            </Field>
            <Field label="One-line summary" hint="Shown on cards. Plain language works best.">
              <input className={input} value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} placeholder="e.g. Follows strong trends in SOL perpetuals" />
            </Field>
            <Field label="Description" hint="What it trades and how it manages risk — no secret parameters needed.">
              <textarea className={`${input} h-28 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={800} />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-fg">Style</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STYLE_LABEL) as StrategyStyle[]).map((st) => (
                  <Chip key={st} selected={style === st} onClick={() => setStyle(st)}>{STYLE_LABEL[st]}</Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-fg">Markets</legend>
              <div className="flex flex-wrap gap-2">
                {ASSET_ORDER.map((a) => (
                  <Chip key={a} selected={assets.includes(a)} onClick={() => setAssets(assets.includes(a) ? assets.filter((x) => x !== a) : [...assets, a])}>{ASSET_LABEL[a]}</Chip>
                ))}
              </div>
            </fieldset>
            <Field label="Main assets" hint="Comma separated, e.g. SOL, BTC, JUP">
              <input className={input} value={primaryAssets} onChange={(e) => setPrimaryAssets(e.target.value)} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-white/[0.03] p-4 text-sm text-fg-2">
              <div className="mb-1 flex items-center gap-2 font-semibold text-fg"><Info className="size-4 text-accent" /> How your strategy is analysed</div>
              Upload a CSV of your strategy’s <b>daily net asset value</b> (after fees): two columns, <code className="text-accent">date,nav</code>. We check every row, then calculate returns, volatility, Sharpe, Sortino and drawdowns, and run the seven-factor reputation engine. Uploaded files count as <b>self-reported</b>, so the tier is capped until your record is verified on-chain or via an exchange.
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
              <Button variant="primary" onClick={() => fileRef.current?.click()}><FileUp /> Upload CSV</Button>
              <Button variant="outline" onClick={() => { setNavCsv(exampleNavCsv()); setIsExample(true); setFileName('example-nav.csv') }}><Sparkles /> Use example data</Button>
              <Button variant="ghost" onClick={() => { const blob = new Blob(['date,nav\n2025-01-01,10000\n2025-01-02,10012.5\n2025-01-03,10008.1\n'], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stratx-nav-template.csv'; a.click(); URL.revokeObjectURL(a.href) }}>
                <Download /> Template
              </Button>
            </div>
            <Field label="…or paste it here">
              <textarea className={`${input} num h-32 py-2 text-xs`} value={navCsv} onChange={(e) => { setNavCsv(e.target.value); setIsExample(false); setFileName(null) }} placeholder={'date,nav\n2025-01-01,10000\n2025-01-02,10012.50'} />
            </Field>
            {isExample && <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">Using example data — it will be labelled as example data, not real performance.</p>}
            {analysis && (
              <div className={cn('rounded-2xl border p-4 text-sm', analysis.metrics ? 'border-green-strong/60 bg-green/20' : 'border-warn/40 bg-warn/[0.06]')}>
                <div className="flex items-center gap-2 font-semibold text-fg">
                  {analysis.metrics ? <CheckCircle2 className="size-4 text-pos" /> : <TriangleAlert className="size-4 text-warn" />}
                  {fileName ?? 'Pasted data'}: {analysis.rows} rows, {analysis.passed} passed checks
                </div>
                {analysis.blocker && <p className="mt-1 text-warn">{analysis.blocker}</p>}
                {analysis.issues.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-fg-2">
                    {analysis.issues.slice(0, 5).map((i) => <li key={`${i.line}-${i.message}`}>Line {i.line}: {i.message}</li>)}
                    {analysis.issues.length > 5 && <li>…and {analysis.issues.length - 5} more</li>}
                  </ul>
                )}
              </div>
            )}
            {analysis?.metrics && <EquityChart series={analysis.metrics.series} height={220} benchmarkLabel="Cash (0%)" />}
            {!analysis && <p className="text-xs text-muted">Minimum {MIN_POINTS} daily rows. Longer histories earn higher Track Record scores.</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-fg">What investors can see</legend>
              <p className="mb-2 text-xs text-muted">Source code, signal logic and live positions are always private.</p>
              <div className="flex flex-wrap gap-2">
                {DISCLOSURE_OPTIONS.map((d) => (
                  <Chip key={d} selected={disclosed.includes(d)} onClick={() => setDisclosed(disclosed.includes(d) ? disclosed.filter((x) => x !== d) : [...disclosed, d])}>{d}</Chip>
                ))}
              </div>
            </fieldset>
            <Field label="Are trading costs included in your NAV?" hint="Fees, funding and slippage — this affects the robustness score.">
              <select className={input} value={cost} onChange={(e) => setCost(e.target.value as CostCompleteness)}>
                {(Object.keys(CATEGORICAL.costCompleteness) as CostCompleteness[]).map((k) => (
                  <option key={k} value={k}>{CATEGORICAL.costCompleteness[k].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Capacity in USD (optional)" hint="Roughly how much capital the strategy can handle before performance degrades.">
              <input className={`${input} num`} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ''))} placeholder="e.g. 2000000" />
            </Field>
          </div>
        )}

        {step === 3 && preview && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <TierLabel tier={tierClass(preview.reputation)} size="md" />
              <span className="text-sm text-fg-2">
                {preview.reputation.score === null ? 'Not enough verified data for a score yet.' : `Reputation score ${preview.reputation.score.toFixed(1)} / 100 (provisional, self-reported).`}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric size="lg" label="CAGR" value={formatPercent(preview.metrics.cagr)} tone={toneFor(preview.metrics.cagr)} />
              <Metric size="lg" label="Sharpe" value={formatRatio(preview.metrics.sharpe)} />
              <Metric size="lg" label="Max drawdown" value={formatPercent(preview.metrics.maxDrawdown)} tone="neg" />
              <Metric size="lg" label="Track record" value={formatDuration(preview.metrics.trackRecordDays)} />
            </dl>
            <details className="rounded-2xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold text-fg">See the full reputation breakdown</summary>
              <div className="mt-4"><ReputationReport reputation={preview.reputation} /></div>
            </details>
            <p className="rounded-xl bg-white/[0.03] px-4 py-3 text-xs text-fg-2">
              Saved in this browser for the MVP. The auction (title, prices, offers) is public on Solana Devnet; your performance file is not uploaded anywhere.
            </p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          <Button variant="ghost" onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}><ArrowLeft /> Back</Button>
          {step < 3 ? (
            <Button variant="primary" size="lg" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue <ArrowRight /></Button>
          ) : (
            <Button variant="primary" size="lg" disabled={!canNext} onClick={publish}><CheckCircle2 /> Create strategy</Button>
          )}
        </div>
      </Panel>

      <Dialog open={!!saved} onOpenChange={(o) => !o && saved && navigate(`/strategy/${saved.id}`)}>
        <DialogContent
          title={dialogStep === 'bond' ? '🎉 Strategy created!' : 'Start an auction?'}
          description={dialogStep === 'bond' ? 'Step 1 of 2 (optional): put money behind your results.' : 'Step 2 of 2: sell access to your strategy.'}
          className="max-w-xl"
        >
          {saved && dialogStep === 'bond' && (
            <div className="space-y-4">
              <BondForm strategyId={saved.id} onDone={() => setDialogStep('auction')} />
              <Button variant="ghost" className="w-full" onClick={() => setDialogStep('auction')}>
                Skip the bond for now
              </Button>
            </div>
          )}
          {saved && dialogStep === 'auction' && (
            <div className="space-y-4">
              <StartAuctionForm strategyId={saved.id} title={saved.name} onDone={() => navigate(`/strategy/${saved.id}?tab=auction`)} />
              <Button variant="ghost" className="w-full" onClick={() => navigate(`/strategy/${saved.id}`)}>
                <Gavel /> Not now — view my strategy
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
