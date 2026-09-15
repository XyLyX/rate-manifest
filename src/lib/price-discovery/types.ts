// Market price discovery contract — provider-neutral price-range types for
// the Compare stage. This layer sits BEFORE Check IQ and BEFORE any
// StayingAPI credit is spent. It is structurally separate from
// src/lib/suppliers/ (SupplierAdapter, runSearch, SUPPLIER_ADAPTERS) and
// must never import from it, write to price_history, rates, or
// cancellations, or call ensureLiveCheckTriggered().
//
// Created 2026-09-14 (Track F / Phase 1). See
// claude/discovery-property-graph-architecture.md, "FROZEN 2026-09-12,"
// Section 3.
//
// Separate from src/lib/discovery/ (hotel/property catalog discovery for
// the Discover page).

// Eight result kinds — no reduction possible without losing UI-relevant
// distinctions (see architecture audit, 2026-09-13):
//   price       — a single confirmed total/nightly figure is available
//   floor       — only a lower bound is known (e.g. "from AED X")
//   range       — a spread (floor..ceiling) is available but not a single point
//   unavailable — source confirmed no availability for these dates
//   no-match    — source has no listing for this property at all
//   stale       — cached result exists but is too old to display with confidence
//   error       — adapter threw or timed out (should be rare; contract is never throw)
//   excluded    — adapter declined to run (e.g. outside its supported region)
export type DiscoveryResultKind =
  | "price"
  | "floor"
  | "range"
  | "unavailable"
  | "no-match"
  | "stale"
  | "error"
  | "excluded";

export interface DiscoveryParams {
  hotelId: string;
  hotelName: string;
  checkIn: string;   // ISO date string "YYYY-MM-DD"
  checkOut: string;  // ISO date string "YYYY-MM-DD"
  adults: number;
  children: number;
  currency: string;
}

export interface DiscoveryResult {
  kind: DiscoveryResultKind;
  sourceSlug: string;
  sourceName: string;
  // Both null when kind is unavailable / no-match / stale / error / excluded
  priceFloor: number | null;
  priceCeiling: number | null;
  currency: string | null;
  deepLink: string | null;
  fetchedAt: string;   // ISO timestamp
  fromCache: boolean;
}

export interface DiscoveryAdapter {
  slug: string;
  displayName: string;
  // Contract: never throw — return kind="error" instead. Adapters are
  // responsible for their own error handling and timeout logic.
  getPriceRange(params: DiscoveryParams): Promise<DiscoveryResult>;
}
