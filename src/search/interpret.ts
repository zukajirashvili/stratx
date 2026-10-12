import { getAuctionSnapshot } from '@/lib/auction'
import { ASSET_LABEL, RISK_LABEL, STYLE_LABEL, VERIFICATION_LABEL } from '@/lib/labels'
import { TIER_LABEL, TIER_ORDER, tierClass } from '@/reputation/display'
import type { TierKey } from '@/reputation/types'
import type { Criterion, SearchIntent, SearchSortKey, UnsupportedRequest } from '@/search/types'
import type { AssetCategory, RiskLevel, Strategy, StrategyStyle } from '@/types/strategy'

/**
 * Deterministic natural-language interpreter (no external AI service).
 *
 * Rules run in order over the query. Each matched span is consumed so later
 * rules cannot double-count it. Thresholds for qualitative words ("strong",
 * "low", "long") are defined once in QUALITATIVE and shown to the user.
 */

/** What qualitative words mean, in the units of the data model. */
export const QUALITATIVE = {
  strongSharpe: 1.5,
  lowDrawdownPct: 10,
  highDrawdownWarnPct: 20,
  lowVolatilityPct: 20,
  highVolatilityWarnPct: 35,
  longTrackRecordDays: 730,
  highReturnCagrPct: 20,
} as const

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, eighteen: 18,
}
const NUM = String.raw`(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen)`
const toNum = (s: string) => (s.toLowerCase() in NUMBER_WORDS ? NUMBER_WORDS[s.toLowerCase()] : Number(s))

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const VERIFIED_STATES = ['attested', 'exchange-linked'] as const

/* ------------------------------------------------------------ criterion builders */

const minSharpe = (v: number, source: string): Criterion => ({
  id: `sharpe>=${v}`,
  label: `Sharpe ≥ ${v}`,
  source,
  kind: 'filter',
  test: (s) => ({ pass: s.metrics.sharpe >= v, detail: `Sharpe ${s.metrics.sharpe.toFixed(2)} ≥ ${v}` }),
})

const maxDrawdown = (pctLimit: number, source: string): Criterion => ({
  id: `dd<=${pctLimit}`,
  label: `Max drawdown ≤ ${pctLimit}%`,
  source,
  kind: 'filter',
  test: (s) => ({
    pass: Math.abs(s.metrics.maxDrawdown) * 100 <= pctLimit,
    detail: `Max drawdown ${pct(Math.abs(s.metrics.maxDrawdown))} ≤ ${pctLimit}%`,
  }),
})

const maxVolatility = (pctLimit: number, source: string): Criterion => ({
  id: `vol<=${pctLimit}`,
  label: `Volatility ≤ ${pctLimit}%`,
  source,
  kind: 'filter',
  test: (s) => ({
    pass: s.metrics.annualizedVolatility * 100 <= pctLimit,
    detail: `Volatility ${pct(s.metrics.annualizedVolatility)} ≤ ${pctLimit}%`,
  }),
})

const minTrack = (days: number, label: string, source: string): Criterion => ({
  id: `track>=${days}`,
  label: `Track record ≥ ${label}`,
  source,
  kind: 'filter',
  test: (s) => ({ pass: s.metrics.trackRecordDays >= days, detail: `Track record ${s.metrics.trackRecordDays} days ≥ ${days}` }),
})

const minCagr = (pctMin: number, source: string): Criterion => ({
  id: `cagr>=${pctMin}`,
  label: `CAGR ≥ ${pctMin}%`,
  source,
  kind: 'filter',
  test: (s) => ({ pass: s.metrics.cagr * 100 >= pctMin, detail: `CAGR ${pct(s.metrics.cagr)} ≥ ${pctMin}%` }),
})

const tiers = (keys: TierKey[], label: string, source: string): Criterion => ({
  id: `tier:${keys.join(',')}`,
  label,
  source,
  kind: 'filter',
  test: (s) => {
    const t = tierClass(s.reputation)
    return { pass: (keys as string[]).includes(t), detail: `Reputation tier: ${t === 'unrated' ? 'Unrated' : TIER_LABEL[t as TierKey] ?? t}` }
  },
})

const verified = (source: string): Criterion => ({
  id: 'verified',
  label: 'Verified status (demo labels)',
  source,
  kind: 'filter',
  test: (s) => ({
    pass: (VERIFIED_STATES as readonly string[]).includes(s.verification.state),
    detail: `Verification: ${VERIFICATION_LABEL[s.verification.state]}${s.verification.source === 'demo' ? ' (demo status, not a real verification)' : ''}`,
  }),
})

const activeAuction = (onchainOnly: boolean, source: string): Criterion => ({
  id: onchainOnly ? 'auction:onchain' : 'auction:active',
  label: onchainOnly ? 'Live on-chain auction (Devnet)' : 'Active auction',
  source,
  kind: 'filter',
  test: (s, ctx) => {
    const onchain = ctx.onchainLive.has(s.id)
    const demo = !!s.auction && getAuctionSnapshot(s.auction, ctx.now).status === 'active'
    if (onchainOnly) return { pass: onchain, detail: 'Live Devnet auction found on-chain' }
    return {
      pass: onchain || demo,
      detail: onchain ? 'Live Devnet auction found on-chain' : 'Active demo auction (simulation only)',
    }
  },
})

const risk = (levels: RiskLevel[], source: string): Criterion => ({
  id: `risk:${levels.join(',')}`,
  label: levels.map((l) => RISK_LABEL[l]).join(' or '),
  source,
  kind: 'filter',
  test: (s) => ({ pass: levels.includes(s.riskLevel), detail: RISK_LABEL[s.riskLevel] }),
})

const asset = (a: AssetCategory, source: string): Criterion => ({
  id: `asset:${a}`,
  label: ASSET_LABEL[a],
  source,
  kind: 'filter',
  test: (s) => ({ pass: s.assetCategories.includes(a), detail: `Trades ${ASSET_LABEL[a]}` }),
})

const style = (st: StrategyStyle, source: string): Criterion => ({
  id: `style:${st}`,
  label: STYLE_LABEL[st],
  source,
  kind: 'filter',
  test: (s) => ({ pass: s.style === st, detail: STYLE_LABEL[st] }),
})

const maxLeverage = (x: number, source: string): Criterion => ({
  id: `lev<=${x}`,
  label: `Gross exposure ≤ ${x}x`,
  source,
  kind: 'filter',
  test: (s) => {
    const g = s.reputationInputs.risk.grossExposureRatio
    if (g === null || g === undefined) return { pass: false, detail: 'Gross exposure not reported' }
    return { pass: g <= x, detail: `Gross exposure ${g}x ≤ ${x}x` }
  },
})

const warnDrawdown = (pctLimit: number, source: string): Criterion => ({
  id: `warn:dd>${pctLimit}`,
  label: `Flag max drawdown > ${pctLimit}%`,
  source,
  kind: 'warn',
  test: (s) => {
    const dd = Math.abs(s.metrics.maxDrawdown) * 100
    return { pass: dd > pctLimit, detail: `High drawdown: ${dd.toFixed(1)}% (> ${pctLimit}%)` }
  },
})

const warnVolatility = (pctLimit: number, source: string): Criterion => ({
  id: `warn:vol>${pctLimit}`,
  label: `Flag volatility > ${pctLimit}%`,
  source,
  kind: 'warn',
  test: (s) => {
    const v = s.metrics.annualizedVolatility * 100
    return { pass: v > pctLimit, detail: `High volatility: ${v.toFixed(1)}% (> ${pctLimit}%)` }
  },
})

/* ------------------------------------------------------------ rules */

interface Ctx {
  criteria: Criterion[]
  sorts: { key: SearchSortKey; label: string; source: string; at: number }[]
  unsupported: UnsupportedRequest[]
}

interface Rule {
  re: RegExp
  apply: (m: RegExpExecArray, c: Ctx) => void
}

const sort = (key: SearchSortKey, label: string) => (m: RegExpExecArray, c: Ctx) =>
  c.sorts.push({ key, label, source: m[0], at: m.index })

const tiersAtOrAbove = (t: TierKey) => TIER_ORDER.slice(TIER_ORDER.indexOf(t))
const TIER_ALT = TIER_ORDER.join('|')

const UNSUPPORTED: [RegExp, string, string][] = [
  [/\balpha\b/i, 'alpha', 'Alpha is not in the data model. Try "excess return" via the reputation breakdown, or Sharpe.'],
  [/\bbeta\b/i, 'beta', 'Beta is not in the data model.'],
  [/\bcorrelat\w*/i, 'correlation', 'Correlation is not in the data model.'],
  [/\b(?:aum|assets under management)\b/i, 'AUM', 'Assets under management are not recorded. Stated capacity is shown on each strategy.'],
  [/\b(?:management|performance|subscription)?\s*fees?\b/i, 'fees', 'Strategy fees are not in the data model. The only fee is the 3% protocol fee on auction purchases.'],
  [/\bwin[- ]?rate\b/i, 'win rate', 'Trade win rate is not recorded; only the share of positive days is available.'],
  [/\b(?:value at risk|var)\b/i, 'VaR', 'Value at Risk is not in the data model.'],
  [/\b(?:turnover)\b/i, 'turnover', 'Turnover is not in the data model.'],
  [/\b(?:skew(?:ness)?|kurtosis)\b/i, 'skew/kurtosis', 'Return skew/kurtosis are not in the data model.'],
  [/\binformation ratio\b/i, 'information ratio', 'Information ratio is not in the data model.'],
]

const RULES: Rule[] = [
  // Warnings first: "…but warn me about high drawdown" must not become a filter.
  {
    re: /\b(?:warn|flag|alert|highlight)(?:\s+me)?\s+(?:about|on|if|of)?\s*(?:a\s+)?(?:high|large|big|deep)?\s*(?:max(?:imum)?\s+)?drawdowns?\b/i,
    apply: (m, c) => c.criteria.push(warnDrawdown(QUALITATIVE.highDrawdownWarnPct, m[0])),
  },
  {
    re: /\b(?:warn|flag|alert|highlight)(?:\s+me)?\s+(?:about|on|if|of)?\s*(?:high\s+)?volatility\b/i,
    apply: (m, c) => c.criteria.push(warnVolatility(QUALITATIVE.highVolatilityWarnPct, m[0])),
  },

  // Explicit numeric thresholds.
  {
    re: /(?:max(?:imum)?\s+)?(?:drawdowns?|dd)\s*(?:of\s+)?(?:under|below|less than|<|<=|at most|max(?:imum)?(?: of)?)\s*(\d+(?:\.\d+)?)\s*%?/i,
    apply: (m, c) => c.criteria.push(maxDrawdown(Number(m[1]), m[0])),
  },
  {
    re: /(?:under|below|less than|<)\s*(\d+(?:\.\d+)?)\s*%\s*(?:max(?:imum)?\s+)?(?:drawdowns?|dd)/i,
    apply: (m, c) => c.criteria.push(maxDrawdown(Number(m[1]), m[0])),
  },
  {
    re: /(?:volatility|vol)\s*(?:of\s+)?(?:under|below|less than|<|<=|at most)\s*(\d+(?:\.\d+)?)\s*%?/i,
    apply: (m, c) => c.criteria.push(maxVolatility(Number(m[1]), m[0])),
  },
  {
    re: /sharpe\s*(?:ratio\s*)?(?:of\s+)?(?:above|over|greater than|more than|at least|>=|>)\s*(\d+(?:\.\d+)?)/i,
    apply: (m, c) => {
      c.criteria.push(minSharpe(Number(m[1]), m[0]))
      sort('risk-adjusted', 'Highest Sharpe first')(m, c)
    },
  },
  {
    re: /(?:cagr|annual(?:ised|ized)? returns?)\s*(?:above|over|greater than|of at least|at least|>)\s*(\d+(?:\.\d+)?)\s*%?/i,
    apply: (m, c) => c.criteria.push(minCagr(Number(m[1]), m[0])),
  },
  {
    // "under $20,000", "below 15k", "less than 9000 usdc"
    // Requires a currency marker ($ before, or k/usd/usdc/dollars after) so "under 2 years" or "under 10%" never match.
    re: /(?:under|below|less than|cheaper than|<|max|at most|up to)\s*(?:\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?|(\d[\d,]*(?:\.\d+)?)\s*(k|usdc|usd|dollars?)\b)/i,
    apply: (m, c) => {
      const num = m[1] ?? m[3]
      const thousands = (m[2] ?? (m[4]?.toLowerCase() === 'k' ? 'k' : undefined)) === 'k'
      const v = Number(num.replace(/,/g, '')) * (thousands ? 1000 : 1)
      const label = v.toLocaleString('en-US')
      c.criteria.push({
        id: `price<=${v}`,
        label: `Asking price ≤ $${label}`,
        source: m[0],
        kind: 'filter',
        test: (s, ctx) => {
          const onchain = ctx.onchainAskUsd?.get(s.id)
          if (onchain !== undefined) return { pass: onchain <= v, detail: `Live auction asking $${onchain.toLocaleString('en-US')} ≤ $${label}` }
          const snap = s.auction ? getAuctionSnapshot(s.auction, ctx.now) : null
          if (!snap || snap.status === 'ended') return { pass: false, detail: 'No open auction' }
          return { pass: s.auction!.askPrice <= v, detail: `Demo auction asking $${s.auction!.askPrice.toLocaleString('en-US')} ≤ $${label}` }
        },
      })
      sort('auction-price', 'Lowest asking price first')(m, c)
    },
  },
  {
    // "longer than one year", "more than 2 years", "at least 18 months", "over a year", "3+ years"
    re: new RegExp(String.raw`(?:(?:longer|more|greater|older)\s+than|over|at\s+least|minimum(?:\s+of)?|>=?)?\s*\b${NUM}\+?\s*(years?|yrs?|months?)\b(?:\s+(?:of\s+)?(?:track[- ]record|history))?`, 'i'),
    apply: (m, c) => {
      const n = toNum(m[1])
      const isYear = /^y/i.test(m[2])
      const days = Math.round(isYear ? n * 365 : n * 30)
      c.criteria.push(minTrack(days, `${n} ${isYear ? (n === 1 ? 'year' : 'years') : n === 1 ? 'month' : 'months'}`, m[0]))
    },
  },

  // Tiers: "Gold-tier or higher", "at least platinum", "gold+", "gold or platinum", "gold".
  {
    re: new RegExp(String.raw`\b(?:at\s+least\s+)?(${TIER_ALT})(?:[- ]tier)?\s*(?:or\s+(?:higher|above|better)|and\s+(?:up|above)|\+)`, 'i'),
    apply: (m, c) => {
      const t = m[1].toLowerCase() as TierKey
      c.criteria.push(tiers(tiersAtOrAbove(t), `${TIER_LABEL[t]} tier or higher`, m[0]))
    },
  },
  {
    re: new RegExp(String.raw`\bat\s+least\s+(${TIER_ALT})(?:[- ]tier)?\b`, 'i'),
    apply: (m, c) => {
      const t = m[1].toLowerCase() as TierKey
      c.criteria.push(tiers(tiersAtOrAbove(t), `${TIER_LABEL[t]} tier or higher`, m[0]))
    },
  },
  {
    re: new RegExp(String.raw`\b(${TIER_ALT})(?:[- ]tier)?(?:\s*(?:,|or|and|\/)\s*(${TIER_ALT})(?:[- ]tier)?)*\b`, 'i'),
    apply: (m, c) => {
      const found = [...m[0].matchAll(new RegExp(TIER_ALT, 'gi'))].map((x) => x[0].toLowerCase() as TierKey)
      const uniq = [...new Set(found)]
      c.criteria.push(tiers(uniq, `${uniq.map((t) => TIER_LABEL[t]).join(' or ')} tier`, m[0]))
    },
  },
  {
    re: /\b(?:top[- ]rated|highly[- ]rated|top reputation|best reputation|reputable|elite|high reputation)\b/i,
    apply: (m, c) => {
      c.criteria.push(tiers(tiersAtOrAbove('gold'), 'Gold tier or higher', m[0]))
      sort('reputation', 'Highest reputation first')(m, c)
    },
  },

  // Qualitative performance & risk.
  {
    re: /\b(?:strong|high|good|great|excellent|top|best|superior|solid)\s+(?:risk[- ]adjusted\s+(?:returns?|performance)|sharpe(?:\s+ratios?)?)\b/i,
    apply: (m, c) => {
      c.criteria.push(minSharpe(QUALITATIVE.strongSharpe, m[0]))
      sort('risk-adjusted', 'Highest Sharpe first')(m, c)
    },
  },
  {
    re: /\brisk[- ]adjusted\s+(?:returns?|performance)\b/i,
    apply: sort('risk-adjusted', 'Highest Sharpe first'),
  },
  {
    re: /\b(?:low|lower|lowest|small|smaller|limited|minimal|shallow|controlled)\s+(?:max(?:imum)?\s+)?drawdowns?\b/i,
    apply: (m, c) => {
      c.criteria.push(maxDrawdown(QUALITATIVE.lowDrawdownPct, m[0]))
      sort('drawdown', 'Smallest drawdown first')(m, c)
    },
  },
  {
    re: /\b(?:low|lower|lowest|reduced|minimal)\s+(?:volatility|vol)\b|\bless\s+volatile\b|\bsteady\b|\bstable returns?\b/i,
    apply: (m, c) => {
      c.criteria.push(maxVolatility(QUALITATIVE.lowVolatilityPct, m[0]))
      sort('volatility', 'Lowest volatility first')(m, c)
    },
  },
  {
    re: /\b(?:long|longer|longest|lengthy|established|proven|extensive|multi[- ]year)\s+(?:track[- ]records?|histor(?:y|ies))\b/i,
    apply: (m, c) => {
      c.criteria.push(minTrack(QUALITATIVE.longTrackRecordDays, '2 years', m[0]))
      sort('track-record', 'Longest track record first')(m, c)
    },
  },
  {
    re: /\btrack[- ]records?\b/i,
    apply: sort('track-record', 'Longest track record first'),
  },
  {
    re: /\b(?:high|strong|big|best|top)\s+(?:returns?|cagr|growth|performance)\b/i,
    apply: (m, c) => {
      c.criteria.push(minCagr(QUALITATIVE.highReturnCagrPct, m[0]))
      sort('cagr', 'Highest CAGR first')(m, c)
    },
  },
  {
    re: /\b(?:low|lower|limited|no|minimal)\s+leverage\b|\bunlevered\b/i,
    apply: (m, c) => c.criteria.push(maxLeverage(2, m[0])),
  },

  // Verification.
  {
    re: /\b(?:verified|attested|audited|independently\s+(?:verified|checked)|on-?chain\s+verified)\b/i,
    apply: (m, c) => c.criteria.push(verified(m[0])),
  },

  // Auctions.
  {
    re: /\b(?:on-?chain|devnet|real)\s+(?:dutch\s+)?auctions?\b/i,
    apply: (m, c) => c.criteria.push(activeAuction(true, m[0])),
  },
  {
    re: /\b(?:active|live|open|ongoing|current|running)\s+(?:dutch\s+)?auctions?\b|\bdutch\s+auctions?\b|\bon\s+auction\b|\bauctions?\b/i,
    apply: (m, c) => c.criteria.push(activeAuction(false, m[0])),
  },

  // Risk levels.
  {
    re: /\b(?:low[- ]risk|lower[- ]risk|conservative|defensive|safe)\b/i,
    apply: (m, c) => c.criteria.push(risk(['low'], m[0])),
  },
  {
    re: /\b(?:moderate|medium[- ]risk|balanced)\b/i,
    apply: (m, c) => c.criteria.push(risk(['moderate'], m[0])),
  },
  {
    re: /\b(?:high[- ]risk|aggressive|degen)\b/i,
    apply: (m, c) => c.criteria.push(risk(['high'], m[0])),
  },

  // Styles.
  ...(
    [
      [/\btrend(?:[- ]following)?s?\b/i, 'trend'],
      [/\bmean[- ]revers(?:ion|ing)\b/i, 'mean-reversion'],
      [/\bmarket[- ]mak(?:ing|ers?)\b/i, 'market-making'],
      [/\bbasis\b|\bfunding(?:[- ]rate)?\b|\bcarry\b/i, 'basis'],
      [/\bstat(?:istical)?[- ]arb(?:itrage)?\b|\barb(?:itrage)?\b|\bpairs\b/i, 'stat-arb'],
      [/\bmomentum\b/i, 'momentum'],
      [/\b(?:delta|market)[- ]neutral\b|\bhedged\b/i, 'delta-neutral'],
    ] as [RegExp, StrategyStyle][]
  ).map<Rule>(([re, st]) => ({ re, apply: (m, c) => c.criteria.push(style(st, m[0])) })),

  // Assets.
  ...(
    [
      [/\bperp(?:etual)?s?\b|\bfutures\b/i, 'perps'],
      [/\bmeme(?:coin)?s?\b/i, 'memecoins'],
      [/\bstable(?:coin)?s?\b|\busdc\b/i, 'stablecoins'],
      [/\byield\b|\blending\b|\blp\b|\bdefi\b/i, 'defi-yield'],
      [/\bbtc\b|\bbitcoin\b|\beth\b|\bethereum\b|\bmajors\b/i, 'majors'],
      [/\bsol\b|\bsolana\b/i, 'sol-ecosystem'],
    ] as [RegExp, AssetCategory][]
  ).map<Rule>(([re, a]) => ({ re, apply: (m, c) => c.criteria.push(asset(a, m[0])) })),
]

const STOPWORDS = new Set(
  `a an and or the with without for of in on to that which who is are be by from into find show me give get list want
  looking look i my some any all strategies strategy strats strat trade trades trading based using use good great best top
  high low higher lower risk returns return performance performing perform under over above below less more than at least
  most max min recent new please something like similar quant quantitative sharpe ratio drawdown dd sol but warn about
  also only just have has their them it its strong long longer track record history verified tier tiers dutch auction
  auctions active live years year months month`.split(/\s+/),
)

export function interpretQuery(raw: string): SearchIntent {
  const c: Ctx = { criteria: [], sorts: [], unsupported: [] }
  let rest = raw

  for (const [re, term, message] of UNSUPPORTED) {
    const m = re.exec(rest)
    if (m) {
      c.unsupported.push({ term, message })
      rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length)
    }
  }

  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.replace('g', ''))
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = re.exec(rest)) && m[0].trim() && guard++ < 6) {
      rule.apply(m, c)
      rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length)
    }
  }

  // De-duplicate identical criteria (e.g. "gold" matched twice).
  const seen = new Set<string>()
  const criteria = c.criteria.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
  // The earliest sort phrase in the query wins.
  const first = [...c.sorts].sort((a, b) => a.at - b.at)[0]

  const terms = rest
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+(\.\d+)?$/.test(t))

  return {
    raw,
    criteria,
    sort: first ? { key: first.key, label: first.label, source: first.source } : null,
    unsupported: c.unsupported,
    terms,
  }
}

/** Removes a phrase from the query (used when a chip is dismissed). */
export function removeFromQuery(raw: string, source: string) {
  const idx = raw.toLowerCase().indexOf(source.toLowerCase())
  if (idx === -1) return raw
  return (raw.slice(0, idx) + raw.slice(idx + source.length))
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()
}

export function searchableText(s: Strategy) {
  return [s.name, s.tagline, s.description, s.creator.displayName, STYLE_LABEL[s.style], ...s.assetCategories.map((a) => ASSET_LABEL[a]), ...s.primaryAssets, ...s.tags]
    .join(' ')
    .toLowerCase()
}

export const EXAMPLE_QUERIES = [
  'Find strategies with strong risk-adjusted returns and low drawdown',
  'Show verified strategies with a track record longer than one year',
  'Find Gold-tier or higher strategies with active auctions',
  'Show strategies with lower volatility and a long track record',
  'Find strategies with a strong Sharpe ratio but warn me about high drawdown',
]
