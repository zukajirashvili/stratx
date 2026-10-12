import type { Auction, AuctionSnapshot } from '@/types/strategy'

/**
 * Demo offer-auction state at a moment in time. Offers "arrive" at their
 * scheduled times so the simulation feels live; nothing here moves money.
 */
export function getAuctionSnapshot(auction: Auction, now: number): AuctionSnapshot {
  const start = Date.parse(auction.startTime)
  const end = Date.parse(auction.endTime)
  const acceptedAt = auction.accepted ? Date.parse(auction.accepted.at) : null
  const visibleOffers = auction.offers.filter((o) => Date.parse(o.placedAt) <= now)

  if (now < start) return { status: 'upcoming', sold: false, bestOffer: null, visibleOffers: [], msRemaining: start - now }

  if (acceptedAt !== null && now >= acceptedAt) {
    const accepted = auction.offers[auction.accepted!.offerIndex]
    return { status: 'ended', sold: true, bestOffer: accepted?.amount ?? null, visibleOffers, msRemaining: 0 }
  }
  const best = visibleOffers.length ? Math.max(...visibleOffers.map((o) => o.amount)) : null
  if (now >= end) return { status: 'ended', sold: false, bestOffer: best, visibleOffers, msRemaining: 0 }
  return { status: 'active', sold: false, bestOffer: best, visibleOffers, msRemaining: end - now }
}

export function auctionDurationHours(auction: Auction) {
  return (Date.parse(auction.endTime) - Date.parse(auction.startTime)) / 3_600_000
}

export function formatUsd(value: number, opts: { compact?: boolean } = {}) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    notation: opts.compact ? 'compact' : 'standard',
  }).format(value)
}
