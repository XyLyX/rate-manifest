// Market price discovery runner — provider-neutral fan-out over
// DISCOVERY_ADAPTERS for the Compare stage. No database access, no
// caching, no network calls of its own. No StayingAPI contact of any kind.
//
// Created 2026-09-14 (Track F / Phase 1). See
// claude/discovery-property-graph-architecture.md, "FROZEN 2026-09-12."
//
// Separate from src/lib/discovery/ (hotel/property catalog discovery for
// the Discover page) and src/lib/suppliers/ (SUPPLIER_ADAPTERS, runSearch).
import type { DiscoveryAdapter, DiscoveryParams, DiscoveryResult } from "./types";

export type { DiscoveryResultKind, DiscoveryParams, DiscoveryResult, DiscoveryAdapter } from "./types";

// Empty until a real discovery provider is integrated (Phase 3).
// CREDIT RULE: viewing Compare must NEVER spend a StayingAPI credit.
// StayingAPI belongs in SUPPLIER_ADAPTERS (Check IQ / runSearch), never here.
export const DISCOVERY_ADAPTERS: DiscoveryAdapter[] = [];

export async function runDiscovery(params: DiscoveryParams): Promise<DiscoveryResult[]> {
  if (DISCOVERY_ADAPTERS.length === 0) return [];

  const results = await Promise.allSettled(
    DISCOVERY_ADAPTERS.map((adapter) => adapter.getPriceRange(params))
  );

  return results.flatMap((r, i): DiscoveryResult[] => {
    const adapter = DISCOVERY_ADAPTERS[i];
    if (!adapter) return [];
    if (r.status === "fulfilled") {
      return [r.value];
    }
    // Adapter contract says never throw, but guard anyway — a broken adapter
    // must not take down the Compare page or prevent the user from proceeding.
    console.error(`Discovery adapter "${adapter.slug}" threw unexpectedly:`, r.reason);
    return [
      {
        kind: "error",
        sourceSlug: adapter.slug,
        sourceName: adapter.displayName,
        priceFloor: null,
        priceCeiling: null,
        currency: null,
        deepLink: null,
        fetchedAt: new Date().toISOString(),
        fromCache: false,
      },
    ];
  });
}
