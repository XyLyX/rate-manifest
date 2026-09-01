import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { SearchParams, SupplierAdapter, SupplierOffer } from "./types";

// StayingAPI (stayingapi.com) - real cross-OTA price comparison, the
// replacement for the Travelpayouts/Hotellook integration after Hotellook
// shut down for good in October 2025 (see DECISIONS.md).
//
// This adapter is a pure database read - it NEVER calls the live API
// itself, and never waits on anything. A live, uncached StayingAPI call
// can take up to several minutes (their own docs: "tens of seconds but
// can run several minutes (240s+)"; confirmed live on 2026-09-01 against
// Sofitel Dubai The Palm at ~35s) - far too slow for a page a real
// visitor is waiting on, and longer than Netlify's own 60-second function
// limit could ever wait even if it tried. Instead, two admin routes -
// refresh-staying-api (submits the request) and collect-staying-api-jobs
// (checks pending jobs, called repeatedly) - do that slow work ahead of
// time via src/lib/suppliers/stayingApiRefresh.ts, and save the finished
// result into the staying_api_cache table. This file only ever reads rows
// with status = "ready" from that table.
//
// A hotel/date-range combination with no row, or one still "pending", both
// correctly return [] here, same as every other adapter's "nothing to
// show" case - it's a cache miss (or a job still in flight), not an
// error. In practice that means a live search only shows real StayingAPI
// offers when the visitor's chosen dates happen to match a window the
// refresh job has already finished for.
//
// Dynamic pricing window: within this many days of check-in, a real
// hotel's price genuinely moves with demand and is worth comparing across
// sellers. Further out, third-party OTA "live" prices for a date that far
// away aren't meaningfully more informative than the hotel's own listed
// price, and showing them as if freshly compared would overstate how real
// that comparison is - see DECISIONS.md, "Dynamic pricing window and the
// direct-rate fallback." So beyond this window, only the hotel's own
// direct listing survives the filter below - everything else this
// endpoint returned gets dropped, regardless of what was cached. This is
// evaluated against today's date at request time, not at refresh time, so
// a window cached 40 days out starts showing the full comparison on its
// own once today creeps within 30 days of it - no re-refresh needed.
const DYNAMIC_PRICING_WINDOW_DAYS = 30;

function daysUntil(dateIso: string): number {
  const target = new Date(dateIso);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  target.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export const stayingApiAdapter: SupplierAdapter = {
  slug: "stayingapi",
  displayName: "StayingAPI",

  async getOffers(params: SearchParams): Promise<SupplierOffer[]> {
    const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, params.hotelId) });
    // Only real hotels ever have cache rows - the mock hotels never get
    // refreshed, so this is a cheap early exit rather than a wasted query.
    if (!hotel || hotel.isMockData) return [];

    const cached = await db.query.stayingApiCache.findFirst({
      where: and(
        eq(schema.stayingApiCache.hotelId, hotel.id),
        eq(schema.stayingApiCache.checkIn, new Date(params.checkIn)),
        eq(schema.stayingApiCache.checkOut, new Date(params.checkOut))
      ),
    });
    if (!cached || cached.status !== "ready" || !cached.offersJson) return [];

    try {
      const offers = JSON.parse(cached.offersJson) as SupplierOffer[];
      if (!Array.isArray(offers)) return [];

      if (daysUntil(params.checkIn) > DYNAMIC_PRICING_WINDOW_DAYS) {
        // Too far out for a real cross-seller comparison to mean much -
        // only the hotel's own direct listing (if one came back) is shown.
        return offers.filter((o) => o.supplierSlug === "direct");
      }

      return offers;
    } catch (err) {
      // Should be unreachable - stayingApiRefresh.ts is the only writer,
      // and it always writes JSON.stringify(SupplierOffer[]) - but a
      // corrupt row must never take the results page down.
      console.error("stayingApiAdapter: cached offers_json failed to parse:", err);
      return [];
    }
  },
};