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
  // Real, computed from this hotel's own cached offers only (cheapest vs.
  // the average of every source checked for the SAME hotel/dates) - never
  // a cross-hotel or fabricated "market rate" comparison. Null whenever
  // there are fewer than two offers to average, since a "below average"
  // claim needs something to be below. See homepage "Top Hotels" card -
  // DECISIONS.md, "Homepage redesign: real savings badge, not a fabricated one."
  percentBelowAverage: number | null;
  // True only if at least one cached, available offer's own cancellations
  // row says isFreeCancellation - never assumed. StayingAPI itself doesn't
  // return real cancellation terms today (see stayingApiRefresh.ts), so
  // this is realistically only ever true for mock hotels until that
  // changes - which is the honest, current state, not a bug.
  hasFreeCancellationOffer: boolean;
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
type HotelRow = typeof schema.hotels.$inferSelect;

// Shared by browseCity() and browseHotel() (added 2026-09-03 for the free
// "Your Hotel" pre-analysis page - see DECISIONS.md, "The Analyse This
// Hotel gate") - the exact same read-only, zero-credit computation, pulled
// out so a single-hotel lookup doesn't have to fetch every hotel in a city
// just to throw the rest away.
async function computeBrowseHotel(hotel: HotelRow, checkIn: string, checkOut: string): Promise<BrowseHotelResult> {
  const settled = await Promise.allSettled(
    SUPPLIER_ADAPTERS.map((adapter) => adapter.getOffers({ hotelId: hotel.id, checkIn, checkOut }))
  );
  const offers = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const available = offers.filter((o) => !o.soldOut);
  const sourcesChecked = new Set(offers.map((o) => o.supplierSlug)).size;
  const cheapestTotal = available.length ? Math.min(...available.map((o) => o.totalPrice)) : null;

  let percentBelowAverage: number | null = null;
  if (available.length >= 2 && cheapestTotal != null) {
    const averageTotal = available.reduce((sum, o) => sum + o.totalPrice, 0) / available.length;
    if (averageTotal > 0) {
      const pct = Math.round(((averageTotal - cheapestTotal) / averageTotal) * 100);
      if (pct > 0) percentBelowAverage = pct; // never show "0% below" as if it were a finding
    }
  }
  const hasFreeCancellationOffer = available.some((o) => o.cancellation.isFreeCancellation);

  return {
    id: hotel.id,
    name: hotel.name,
    area: hotel.area,
    city: hotel.city,
    starRating: hotel.starRating,
    isMockData: hotel.isMockData,
    sourcesChecked,
    cheapestTotal,
    percentBelowAverage,
    hasFreeCancellationOffer,
  };
}

export async function browseCity(city: string, checkIn: string, checkOut: string): Promise<BrowseResult> {
  const hotels = await db.query.hotels.findMany({
    where: eq(schema.hotels.city, city),
    orderBy: [desc(schema.hotels.starRating), asc(schema.hotels.name)],
  });

  const results = await Promise.all(hotels.map((hotel) => computeBrowseHotel(hotel, checkIn, checkOut)));

  return { city, nights: nightsBetween(checkIn, checkOut), hotels: results };
}

/**
 * Single-hotel version of browseCity() - the data source for the free
 * "Your Hotel" page (src/app/hotel/page.tsx), which has to show something
 * real (whatever's already cached) before the visitor has spent anything
 * on an "Analyse This Hotel" click. Same zero-credit, cache-only reads -
 * never triggers a live StayingAPI call. Returns null only if the hotel
 * itself doesn't exist.
 */
export async function browseHotel(
  hotelId: string,
  checkIn: string,
  checkOut: string
): Promise<BrowseHotelResult | null> {
  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, hotelId) });
  if (!hotel) return null;
  return computeBrowseHotel(hotel, checkIn, checkOut);
}
