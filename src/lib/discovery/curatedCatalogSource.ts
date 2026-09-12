// The first (and, until Track B lands a real vendor, only) DiscoverySource:
// RateManifest's own hand-picked `hotels` table, wrapped in the generic
// discovery interface rather than queried directly from Page 1 components -
// see types.ts's own module comment for why. This adapter does no identity
// matching at all (its "source identity" already IS the RateManifest
// canonical id - every row here was entered directly under that id), which
// is exactly what makes it a safe Test 1 smoke test (claude/discovery-
// property-graph-architecture.md, "FROZEN 2026-09-12," Section 14): it
// isolates the Page 1/Page 2 selection-and-comparison problem from any real
// vendor-identity-matching problem, on purpose.

import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { PropertyState } from "@/lib/constants";
import type { DiscoveredHotel, DiscoverySearchParams, DiscoverySource } from "./types";

export const CURATED_CATALOG_SOURCE_ID = "curated-catalog";

export const curatedCatalogSource: DiscoverySource = {
  id: CURATED_CATALOG_SOURCE_ID,

  // No StayingAPI contact, no rate lookup - a plain catalog read, same
  // "zero contact with StayingAPI or its cache" rule page.tsx's own
  // pre-2026-09-12 comment already documented for this exact query.
  async search({ destination, limit }: DiscoverySearchParams): Promise<DiscoveredHotel[]> {
    const rows = await db.query.hotels.findMany({
      where: eq(schema.hotels.city, destination),
      orderBy: [asc(schema.hotels.starRating), asc(schema.hotels.name)],
    });

    // Sorted star-rating-desc/name-asc to match the pre-2026-09-12 Top
    // Hotels ordering (best first) - `orderBy` above is ascending only
    // because Drizzle's query API needs an explicit direction per column;
    // reversing star rating here is cheaper than a second DB round trip.
    const sorted = rows.slice().sort((a, b) => b.starRating - a.starRating || a.name.localeCompare(b.name));
    const limited = typeof limit === "number" ? sorted.slice(0, limit) : sorted;

    return limited.map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      area: hotel.area,
      city: hotel.city,
      starRating: hotel.starRating,
      imageUrl: null,
      state: hotel.state as PropertyState,
      sourceId: CURATED_CATALOG_SOURCE_ID,
      sourcePropertyId: hotel.id,
      isMockData: hotel.isMockData,
    }));
  },
};
