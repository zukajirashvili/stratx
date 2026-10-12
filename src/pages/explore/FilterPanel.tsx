import { Chip } from '@/components/ui/misc'
import { ASSET_LABEL, ASSET_ORDER, AUCTION_STATUS_LABEL, RISK_LABEL, RISK_ORDER, TIER_CLASS_LABEL } from '@/lib/labels'
import { TIER_CLASS_ORDER, tierClass } from '@/reputation/display'
import type { AuctionFilter, ExploreFilters } from '@/lib/strategyQuery'
import type { Strategy } from '@/types/strategy'
import { auctionStatusOf } from '@/lib/strategyQuery'

type ListKey = 'tier' | 'risk' | 'asset' | 'auction'

interface Group {
  key: ListKey
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  count: (s: Strategy, value: string) => boolean
}

export function FilterPanel({
  filters,
  strategies,
  now,
  onchainLive,
  onChange,
}: {
  filters: ExploreFilters
  /** Full (unfiltered) list, used to show how many strategies each option matches. */
  strategies: Strategy[]
  now: number
  onchainLive?: ReadonlySet<string>
  onChange: (key: ListKey, values: string[]) => void
}) {
  const groups: Group[] = [
    {
      key: 'tier',
      label: 'Reputation tier',
      options: TIER_CLASS_ORDER.map((t) => ({ value: t, label: TIER_CLASS_LABEL[t] })),
      selected: filters.tiers,
      count: (s, v) => tierClass(s.reputation) === v,
    },
    {
      key: 'risk',
      label: 'Risk level',
      options: RISK_ORDER.map((r) => ({ value: r, label: RISK_LABEL[r].replace(' risk', '') })),
      selected: filters.risk,
      count: (s, v) => s.riskLevel === v,
    },
    {
      key: 'asset',
      label: 'Asset category',
      options: ASSET_ORDER.map((a) => ({ value: a, label: ASSET_LABEL[a] })),
      selected: filters.assets,
      count: (s, v) => s.assetCategories.includes(v as never),
    },
    {
      key: 'auction',
      label: 'Auction status',
      options: (['active', 'upcoming', 'ended', 'none'] as AuctionFilter[]).map((a) => ({
        value: a,
        label: AUCTION_STATUS_LABEL[a],
      })),
      selected: filters.auction,
      count: (s, v) => auctionStatusOf(s, now, onchainLive) === v,
    },
  ]

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <fieldset key={g.key}>
          <legend className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">{g.label}</legend>
          <div className="flex flex-wrap gap-1.5">
            {g.options.map((o) => {
              const selected = g.selected.includes(o.value)
              const n = strategies.filter((s) => g.count(s, o.value)).length
              return (
                <Chip
                  key={o.value}
                  selected={selected}
                  onClick={() =>
                    onChange(g.key, selected ? g.selected.filter((v) => v !== o.value) : [...g.selected, o.value])
                  }
                >
                  {o.label}
                  <span className="num text-[10px] opacity-60">{n}</span>
                </Chip>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
