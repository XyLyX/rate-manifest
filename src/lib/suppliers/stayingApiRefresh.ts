import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { SupplierOffer } from "./types";

// The slow, live-calling half of the StayingAPI integration - the
// counterpart to stayingApiAdapter.ts, which only ever reads what this
// file writes. ONLY ever called from the two refresh admin routes:
// submitStayingApiJob from refresh-staying-api (fast: one HTTP call, never
// waits), and pollStayingApiJob from collect-staying-api-jobs (also fast:
// one HTTP call, checks status once and returns). Neither function loops
// or sleeps - see DECISIONS.md, "Live StayingAPI calls and the refresh
// architecture," for why: Netlify's synchronous functions have a hard,
// non-configurable 60-second limit, and StayingAPI's own docs say a job
// "usually finishes in tens of seconds but can run several minutes
// (240s+)" - so nothing on Netlify's side can wait a job out in one
// request. The GitHub Actions workflow is what actually waits, by calling
// collect-staying-api-jobs repeatedly a few seconds apart.

const STAYINGAPI_PRICE_COMPARE_URL = "https://api.stayingapi.com/v1/price-compare";
const STAYINGAPI_ORIGIN = "https://api.stayingapi.com";

// Only the sellers a "we compared trustworthy real sellers" platform should
// actually show. StayingAPI's Google-Hotels-backed results also include a
// long tail of small resale/metasearch sites (EaseMyTrip, Traveloka,
// Billabook, Reserving, eDreams, Orbitz, Travelocity, CheapTickets,
// Hotelscombined, momondo, Bluepillow, Evendo, Kiwi.com, and others,
// confirmed directly against a real hotel on 2026-09-01 - see
// DECISIONS.md) - those are intentionally left unmapped and get dropped,
// same as any other unrecognized ota string, rather than inventing new
// Supply Ledger entries for sites this platform hasn't vetted.
const OTA_TO_SUPPLIER: Record<string, { slug: string; name: string }> = {
  bookingcom: { slug: "booking", name: "Booking.com" },
  booking: { slug: "booking", name: "Booking.com" },
  expedia: { slug: "expedia", name: "Expedia" },
  expediacom: { slug: "expedia", name: "Expedia" },
  agoda: { slug: "agoda", name: "Agoda" },
  agodacom: { slug: "agoda", name: "Agoda" },
  hotelscom: { slug: "hotelscom", name: "Hotels.com" },
  tripcom: { slug: "tripcom", name: "Trip.com" },
  priceline: { slug: "priceline", name: "Priceline" },
};

function normalizeOta(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

interface StayingApiOffer {
  ota: string;
  totalPrice: number;
  currency: string;
  url: string;
}

interface StayingApiResult {
  property: string;
  offers: StayingApiOffer[];
}

/** Maps StayingAPI's raw offers onto this app's curated Supply Ledger. */
function mapOffers(
  result: StayingApiResult,
  hotelName: string,
  roomNormalizedType: string,
  checkIn: string,
  checkOut: string
): SupplierOffer[] {
  if (!result.offers || result.offers.length === 0) return [];

  const nights = nightsBetween(checkIn, checkOut);
  const hotelNameNormalized = normalizeOta(hotelName);

  const offers: SupplierOffer[] = [];
  for (const offer of result.offers) {
    const normalizedOta = normalizeOta(offer.ota);
    // StayingAPI labels a hotel's own direct listing with the hotel's own
    // name as the "ota" string (confirmed live: "Sofitel Dubai The Palm"
    // appeared as its own seller) rather than a literal "direct" - detect
    // it by comparing against the hotel's own name instead.
    const isDirect = normalizedOta === hotelNameNormalized;
    const supplier = isDirect ? { slug: "direct", name: "Direct - hotel website" } : OTA_TO_SUPPLIER[normalizedOta];
    if (!supplier) continue; // not a seller in the curated Supply Ledger - skip

    const nightlyPrice = Math.round(offer.totalPrice / nights);
    offers.push({
      supplierSlug: supplier.slug,
      supplierName: supplier.name,
      roomNormalizedType,
      soldOut: false,
      currency: offer.currency,
      nightlyPrice,
      // price-compare returns one all-in total per seller, not a
      // nightly/taxes breakdown - taxesFeesPerNight is left at 0 and
      // totalPrice (the authoritative real figure) is used as-is rather
      // than reconstructed from an assumed nightly rate.
      taxesFeesPerNight: 0,
      totalPrice: offer.totalPrice,
      cancellation: {
        // Not returned by this endpoint - defaulting to "not confirmed
        // free" rather than fabricating a deadline/penalty this app was
        // never actually told. See DECISIONS.md.
        isFreeCancellation: false,
        deadlineIso: null,
        penaltyPercentage: null,
      },
      outboundUrl: offer.url,
    });
  }

  return offers;
}

export type SubmitOutcome =
  | { status: "ready"; offers: SupplierOffer[] }
  | { status: "pending"; jobId: string; pollUrl: string }
  | { status: "error"; message: string };

/**
 * ONE HTTP call: asks StayingAPI to price-compare a hotel. If it's cached
 * on their side (their own cache TTL is 1 hour, per their docs), this
 * returns "ready" with mapped offers immediately. Otherwise it returns
 * "pending" with the jobId/pollUrl to check later via pollStayingApiJob -
 * this function never waits for that job itself.
 */
export async function submitStayingApiJob(
  hotelId: string,
  checkIn: string,
  checkOut: string
): Promise<SubmitOutcome> {
  const apiKey = process.env.STAYINGAPI_KEY;
  if (!apiKey) return { status: "error", message: "STAYINGAPI_KEY not configured" };

  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, hotelId) });
  if (!hotel || hotel.isMockData) return { status: "error", message: "not a real hotel" };

  const room = await db.query.rooms.findFirst({ where: eq(schema.rooms.hotelId, hotel.id) });
  if (!room) return { status: "error", message: "hotel has no room row" };

  const url = new URL(STAYINGAPI_PRICE_COMPARE_URL);
  url.searchParams.set("name", hotel.name);
  url.searchParams.set("location", `${hotel.area}, ${hotel.city}`);
  url.searchParams.set("checkIn", checkIn);
  url.searchParams.set("checkOut", checkOut);
  url.searchParams.set("currency", "AED");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();

    if (res.status === 202 && json?.data?.jobId && json?.data?.pollUrl) {
      return { status: "pending", jobId: json.data.jobId, pollUrl: `${STAYINGAPI_ORIGIN}${json.data.pollUrl}` };
    }
    if (res.ok && json?.data?.offers) {
      const offers = mapOffers(json.data, hotel.name, room.normalizedType, checkIn, checkOut);
      return { status: "ready", offers };
    }
    return { status: "error", message: `unexpected response: ${JSON.stringify(json).slice(0, 500)}` };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export type PollOutcome =
  | { status: "ready"; offers: SupplierOffer[] }
  | { status: "pending" }
  | { status: "error"; message: string };

/**
 * ONE HTTP call: checks a job's current status. Never sleeps or loops -
 * a caller (collect-staying-api-jobs, driven by the GitHub Actions
 * workflow) is what calls this repeatedly, seconds to minutes apart.
 */
export async function pollStayingApiJob(
  hotelId: string,
  pollUrl: string,
  checkIn: string,
  checkOut: string
): Promise<PollOutcome> {
  const apiKey = process.env.STAYINGAPI_KEY;
  if (!apiKey) return { status: "error", message: "STAYINGAPI_KEY not configured" };

  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, hotelId) });
  if (!hotel) return { status: "error", message: "hotel not found" };

  const room = await db.query.rooms.findFirst({ where: eq(schema.rooms.hotelId, hotel.id) });
  if (!room) return { status: "error", message: "hotel has no room row" };

  try {
    const res = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const jobStatus = json?.data?.status;

    if (jobStatus === "completed") {
      const result = json.data.result;
      const offers = result ? mapOffers(result, hotel.name, room.normalizedType, checkIn, checkOut) : [];
      return { status: "ready", offers };
    }
    if (jobStatus === "failed") {
      return { status: "error", message: json?.data?.error?.message ?? "job failed" };
    }
    return { status: "pending" };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}