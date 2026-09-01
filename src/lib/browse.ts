import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { SUPPLIER_ADAPTERS } from "@/lib/suppliers";

export interface BrowseHotelResult {
  id: string;
  name: string;
  area: string;
  city: string;
  starRating: number;
  isMockData: boolean;
  sourcesChecked: number;
  cheapestTotal: number | null;
}

export interface BrowseResult {
  city: string;
  nights: number;
  hotels: BrowseHotelResult[];
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

/**
 * Lists every hotel in one emirate with whatever price data already
 * exists for the given dates - "browse hotels first, then check one
 * property's full rate," requested 2026-09-01 (see DECISIONS.md, "Browse
 * by emirate"). Distinct from runSearch() (src/lib/search.ts), which is
 * the single-hotel flow that persists Rate/Cancellation/PriceHistory rows
 * and computes Rate Signal for one specific hotel a visitor actually
 * chose. This is deliberately read-only: it calls the same adapters (so a
 * real hotel only ever shows StayingAPI data already sitting in
 * staying_api_cache - never a live call, zero extra credits, same
 * "cache-only reads" rule as the freshness badge above it in
 * DECISIONS.md) but writes nothing to the database. Persisting a Rate row
 * for every hotel in a city every time someone merely browses would
 * pollute price history and booking-outcome tracking with "searches"
 * nobody actually made - only clicking through to a specific property's
 * own page counts as a real search.
 */
export async function browseCity(city: string, checkIn: string, checkOut: string): Promise<BrowseResult> {
  const hotels = await db.query.hotels.findMany({
    where: eq(schema.hotels.city, city),
    orderBy: [desc(schema.hotels.starRating), asc(schema.hotels.name)],
  });

  const results = await Promise.all(
    hotels.map(async (hotel): Promise<BrowseHotelResult> => {
      const settled = await Promise.allSettled(
        SUPPLIER_ADAPTERS.map((adapter) => adapter.getOffers({ hotelId: hotel.id, checkIn, checkOut }))
      );
      const offers = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const available = offers.filter((o) => !o.soldOut);
      const sourcesChecked = new Set(offers.map((o) => o.supplierSlug)).size;
      const cheapestTotal = available.length ? Math.min(...available.map((o) => o.totalPrice)) : null;

      return {
        id: hotel.id,
        name: hotel.name,
        area: hotel.area,
        city: hotel.city,
        starRating: hotel.starRating,
        isMockData: hotel.isMockData,
        sourcesChecked,
        cheapestTotal,
      };
    })
  );

  return { city, nights: nightsBetween(checkIn, checkOut), hotels: results };
}
