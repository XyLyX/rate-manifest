import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { SearchParams, SupplierAdapter, SupplierOffer } from "./types";

// StayingAPI (stayingapi.com) - real cross-OTA price comparison, the
// replacement for the Travelpayouts/Hotellook integration after Hotellook
// shut down for good in October 2025 (see DECISIONS.md, "Travelpayouts:
// account created, but Hotels Data API isn't live yet" and "Real hotel
// data: evaluating options beyond Travelpayouts"). One call to their
// price-compare endpoint returns several real named sellers' prices for a
// single property at once - verified directly against their live API
// before this was written, not assumed from docs.
//
// Endpoint shape verified live on 2026-09-01 with a stay_test_ key:
//   GET https://api.stayingapi.com/v1/price-compare
//     ?name=<hotel name>&location=<city, region>
//     &checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&currency=AED
//     Authorization: Bearer <key>
//   -> { data: { property, checkIn, checkOut, currency, min, median,
//                offers: [{ ota, totalPrice, currency, url }, ...] },
//        meta: { environment, sandbox, creditsCharged, warnings, ... } }
//
// IMPORTANT: a stay_test_ key returns the SAME deterministic sandbox
// fixture ("D-Resort Sibenik") for every query, regardless of what hotel
// was actually asked for - confirmed directly, not a bug in this file.
// Real results require a stay_live_ key, which StayingAPI only issues
// once the account's email is verified. See DECISIONS.md.
//
// This only returns real data for hotels that actually exist (StayingAPI
// resolves against Google Hotels/real OTA listings) - none of Rate
// Manifest's current seed hotels are real, so this adapter will correctly
// return [] for all of them until real hotels are added to the `hotels`
// table with `isMockData: false`. That's expected, not a bug - see
// DECISIONS.md for the next step once a live key is in hand.

const STAYINGAPI_BASE_URL = "https://api.stayingapi.com/v1/price-compare";

// StayingAPI's `ota` field identifies the real named seller. Only sellers
// already in the Supply Ledger (src/db/seed.ts's suppliers) are mapped -
// anything else (e.g. "google_hotels", which is itself a metasearch
// aggregator, not a bookable seller) is intentionally skipped rather than
// invented as a new supplier here. Keyed on a normalized (lowercased,
// alphanumeric-only) form of the ota string so "Booking.com", "booking",
// and "booking_com" all match the same entry.
const OTA_TO_SUPPLIER: Record<string, { slug: string; name: string }> = {
  bookingcom: { slug: "booking", name: "Booking.com" },
  booking: { slug: "booking", name: "Booking.com" },
  expedia: { slug: "expedia", name: "Expedia" },
  expediacom: { slug: "expedia", name: "Expedia" },
  agoda: { slug: "agoda", name: "Agoda" },
  agodacom: { slug: "agoda", name: "Agoda" },
  hotelscom: { slug: "hotelscom", name: "Hotels.com" },
  tripcom: { slug: "tripcom", name: "Trip.com" },
  direct: { slug: "direct", name: "Direct - hotel website" },
  official: { slug: "direct", name: "Direct - hotel website" },
};

function normalizeOta(ota: string): string {
  return ota.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface StayingApiOffer {
  ota: string;
  totalPrice: number;
  currency: string;
  url: string;
}

interface StayingApiResponse {
  data?: {
    property: string;
    checkIn: string;
    checkOut: string;
    currency: string;
    min: number;
    median: number;
    offers: StayingApiOffer[];
  };
  meta?: {
    environment?: string;
    sandbox?: boolean;
    warnings?: { code: string; message: string }[];
  };
  error?: { message?: string };
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

export const stayingApiAdapter: SupplierAdapter = {
  slug: "stayingapi",
  displayName: "StayingAPI",

  async getOffers(params: SearchParams): Promise<SupplierOffer[]> {
    const apiKey = process.env.STAYINGAPI_KEY;
    if (!apiKey) {
      // No credentials configured - same convention as every other
      // adapter here: return no offers rather than throwing, so one
      // missing/unconfigured source just means one fewer source checked.
      return [];
    }

    const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, params.hotelId) });
    // Only worth calling for a hotel that actually exists in the real
    // world - StayingAPI resolves against Google Hotels/real listings, so
    // asking it about a fictional demo property just wastes a credit.
    if (!hotel || hotel.isMockData) return [];

    const room = await db.query.rooms.findFirst({ where: eq(schema.rooms.hotelId, hotel.id) });
    if (!room) return [];

    const url = new URL(STAYINGAPI_BASE_URL);
    url.searchParams.set("name", hotel.name);
    url.searchParams.set("location", `${hotel.area}, ${hotel.city}`);
    url.searchParams.set("checkIn", params.checkIn);
    url.searchParams.set("checkOut", params.checkOut);
    url.searchParams.set("currency", "AED");

    let json: StayingApiResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
        // Keep one slow/unreachable supplier from stalling the whole
        // search - the other adapters (and the results page) should
        // never wait on this indefinitely.
        signal: AbortSignal.timeout(8000),
      });
      json = (await res.json()) as StayingApiResponse;
      if (!res.ok) {
        console.error(`stayingApiAdapter: HTTP ${res.status}`, json?.error?.message ?? json);
        return [];
      }
    } catch (err) {
      console.error("stayingApiAdapter: request failed:", err);
      return [];
    }

    if (json.meta?.sandbox) {
      // A stay_test_ key was used - the response above is fixture data
      // for a property that isn't the one that was actually asked about.
      // Never persist that as if it were a real quote.
      console.warn(
        "stayingApiAdapter: sandbox key in use, ignoring fixture response.",
        json.meta.warnings?.map((w) => w.message).join(" ")
      );
      return [];
    }

    const offers = json.data?.offers ?? [];
    if (offers.length === 0) return [];

    const nights = nightsBetween(params.checkIn, params.checkOut);

    const result: SupplierOffer[] = [];
    for (const offer of offers) {
      const supplier = OTA_TO_SUPPLIER[normalizeOta(offer.ota)];
      if (!supplier) {
        // Not a named seller in the Supply Ledger (e.g. Google Hotels
        // itself, which redirects rather than sells) - skip rather than
        // inventing a new supplier row on the fly.
        continue;
      }

      const nightlyPrice = Math.round(offer.totalPrice / nights);
      result.push({
        supplierSlug: supplier.slug,
        supplierName: supplier.name,
        roomNormalizedType: room.normalizedType,
        soldOut: false,
        currency: offer.currency,
        nightlyPrice,
        // StayingAPI's price-compare endpoint returns one all-in total per
        // OTA, not a nightly/taxes breakdown - taxesFeesPerNight is left
        // at 0 and totalPrice (the authoritative real figure) is used
        // as-is rather than reconstructed from an assumed nightly rate.
        taxesFeesPerNight: 0,
        totalPrice: offer.totalPrice,
        cancellation: {
          // Not returned by this endpoint. Defaulting to "not confirmed
          // free" rather than fabricating a specific deadline/penalty -
          // see DECISIONS.md on never fabricating a fact this app hasn't
          // actually been told.
          isFreeCancellation: false,
          deadlineIso: null,
          penaltyPercentage: null,
        },
        // A real deep link straight to that OTA's own listing - no
        // marker/token needed for this one, unlike Travelpayouts.
        outboundUrl: offer.url,
      });
    }

    return result;
  },
};