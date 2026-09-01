import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";
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

export type LiveCheckState =
  | { kind: "not-applicable" } // mock hotel - nothing real to check
  | { kind: "ready" } // a cache row already exists and is ready (0 or more offers - both are a real answer)
  | { kind: "checking" } // a live check is in flight (just triggered, or someone else already triggered it)
  | { kind: "error"; message: string };

/**
 * The visitor-facing entry point for live on-demand checking on /search -
 * see DECISIONS.md, "Live on-demand check on /search." Unlike the admin
 * refresh routes (secret-protected, run deliberately), this can be called
 * by any real page load, so it has to be safe to call repeatedly and safe
 * under concurrent requests for the exact same (hotel, checkIn, checkOut)
 * triple - two visitors opening the same never-before-seen search within
 * the same second must never both trigger a paid StayingAPI call for it.
 *
 * The fix is to CLAIM the triple with an atomic insert before spending any
 * credits, using the same unique index (staying_api_cache_hotel_checkin_idx)
 * the admin refresh routes already rely on. onConflictDoNothing() means the
 * losing request's insert is a silent no-op - its .returning() comes back
 * empty - rather than an error, so only the request that actually landed
 * the row goes on to call the paid API. Verified locally: two inserts for
 * the same triple in quick succession leave exactly one row in the table,
 * and only the winner's insert reports a returned id.
 */
export async function ensureLiveCheckTriggered(hotelId: string, checkIn: string, checkOut: string): Promise<LiveCheckState> {
  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, hotelId) });
  if (!hotel || hotel.isMockData) return { kind: "not-applicable" };

  const existing = await db.query.stayingApiCache.findFirst({
    where: and(
      eq(schema.stayingApiCache.hotelId, hotelId),
      eq(schema.stayingApiCache.checkIn, new Date(checkIn)),
      eq(schema.stayingApiCache.checkOut, new Date(checkOut))
    ),
  });
  if (existing) {
    // Already checked (however long ago - see stayingApiAdapter.ts, offers
    // never expire) or already in flight either way. Zero offers on a
    // "ready" row is a real, final answer - not a reason to check again.
    return existing.status === "ready" ? { kind: "ready" } : { kind: "checking" };
  }

  const placeholderId = newId();
  const inserted = await db
    .insert(schema.stayingApiCache)
    .values({
      id: placeholderId,
      hotelId,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      status: "pending",
      jobId: null,
      pollUrl: null,
      offersJson: null,
      refreshedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [schema.stayingApiCache.hotelId, schema.stayingApiCache.checkIn, schema.stayingApiCache.checkOut],
    })
    .returning({ id: schema.stayingApiCache.id });

  if (inserted.length === 0) {
    // Lost the race - another request claimed this triple a moment ago.
    // Don't submit a second paid request for the same thing.
    return { kind: "checking" };
  }

  const outcome = await submitStayingApiJob(hotelId, checkIn, checkOut);

  if (outcome.status === "ready") {
    await db
      .update(schema.stayingApiCache)
      .set({ status: "ready", offersJson: JSON.stringify(outcome.offers), jobId: null, pollUrl: null, refreshedAt: new Date() })
      .where(eq(schema.stayingApiCache.id, placeholderId));
    return { kind: "ready" };
  }
  if (outcome.status === "pending") {
    await db
      .update(schema.stayingApiCache)
      .set({ jobId: outcome.jobId, pollUrl: outcome.pollUrl, refreshedAt: new Date() })
      .where(eq(schema.stayingApiCache.id, placeholderId));
    return { kind: "checking" };
  }
  // The submit call itself failed (bad key, network blip, StayingAPI down).
  // Delete the placeholder instead of leaving a permanently stuck "pending"
  // row with no jobId/pollUrl for anyone to poll - the next visitor for
  // this exact pair gets a clean retry instead of a dead end forever.
  await db.delete(schema.stayingApiCache).where(eq(schema.stayingApiCache.id, placeholderId));
  return { kind: "error", message: outcome.message };
}

/**
 * The visitor-facing poll, called by the client-side "Checking real-time
 * prices" widget on /search while ensureLiveCheckTriggered() above left a
 * row "pending" - the per-triple equivalent of collect-staying-api-jobs,
 * which polls every pending row for the admin-triggered batch refresh.
 * Never submits a new paid request - only checks the status of a job that
 * was already submitted, exactly like the admin route's own polling.
 */
export async function pollLiveCheck(
  hotelId: string,
  checkIn: string,
  checkOut: string
): Promise<{ status: "ready" | "pending" | "error" | "no-pending-job" }> {
  const row = await db.query.stayingApiCache.findFirst({
    where: and(
      eq(schema.stayingApiCache.hotelId, hotelId),
      eq(schema.stayingApiCache.checkIn, new Date(checkIn)),
      eq(schema.stayingApiCache.checkOut, new Date(checkOut))
    ),
  });
  if (!row) return { status: "no-pending-job" };
  if (row.status === "ready") return { status: "ready" };
  if (!row.pollUrl) return { status: "pending" }; // claimed but the submit call hasn't finished writing a pollUrl yet

  const outcome = await pollStayingApiJob(hotelId, row.pollUrl, checkIn, checkOut);

  if (outcome.status === "ready") {
    await db
      .update(schema.stayingApiCache)
      .set({ status: "ready", offersJson: JSON.stringify(outcome.offers), jobId: null, pollUrl: null, refreshedAt: new Date() })
      .where(eq(schema.stayingApiCache.id, row.id));
    return { status: "ready" };
  }
  if (outcome.status === "error") {
    await db
      .update(schema.stayingApiCache)
      .set({ status: "ready", offersJson: "[]", jobId: null, pollUrl: null, refreshedAt: new Date() })
      .where(eq(schema.stayingApiCache.id, row.id));
    return { status: "error" };
  }
  return { status: "pending" };
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
