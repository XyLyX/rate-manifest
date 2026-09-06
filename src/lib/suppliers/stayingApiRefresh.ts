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
//
// "google_hotels" (2026-09-06, Navin's explicit call after live evidence -
// see stayingApiRefresh's diagnostic logging comment): for at least some
// real hotel/date pairs, StayingAPI's response doesn't break out into
// individual named OTAs at all - it returns exactly one blended offer
// attributed to "google_hotels" itself (Google's own aggregate/meta-search
// price, not a specific bookable site). Dropping it as "unrecognized"
// left genuinely-available real hotels showing "nothing available" - a
// worse dishonesty than showing an aggregator's price labeled as what it
// actually is. Mapped here as its own named source ("Google Hotels"),
// never conflated with a specific OTA - its outbound link is whatever
// comparison page StayingAPI/Google Hotels itself returned, and it starts
// with no reliability history like any other new supplier (see
// bestDealScore.ts's hasReliabilityData - unaffected by this addition,
// no special-casing needed).
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
  googlehotels: { slug: "google_hotels", name: "Google Hotels" },
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
    // 2026-09-06 - the price-compare request explicitly asks for
    // currency=AED (see submitStayingApiJob below), but nothing ever
    // verified StayingAPI actually honored that on the response. Caught
    // live: a "google_hotels" offer came back with totalPrice 407 for a
    // hotel whose real AED prices (confirmed directly against Google
    // Hotels' own page, Agoda, Booking.com, and the property's own site,
    // all for nearby dates) run AED 1,500-2,100 - 407 is not a plausible
    // AED figure for this property, and the gap is large enough to be a
    // currency mismatch (e.g. USD) rather than a genuine cheap rate. Every
    // display on this site hardcodes the "AED" label rather than reading
    // offer.currency (RateManifestVerdict.tsx, ResultsList.tsx, etc.), so
    // silently accepting a non-AED total would show a wrong price as if it
    // were AED - the misrepresentation this whole rebuild has been about
    // removing, not a new one to introduce. Dropping the offer is the
    // honest move until this app either confirms StayingAPI always honors
    // the currency param or the display layer is rebuilt to show a real,
    // per-offer currency instead of assuming AED everywhere.
    if (offer.currency && offer.currency.toUpperCase() !== "AED") {
      console.warn(
        `[stayingApiRefresh] ${hotelName} ${checkIn}->${checkOut}: dropping offer from "${offer.ota}" - currency mismatch (got "${offer.currency}", requested AED), totalPrice=${offer.totalPrice}`
      );
      continue;
    }

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
      // than reconstructed from an assumed nightly rate. taxesConfidence:
      // "unknown" is what keeps that placeholder 0 from ever being shown
      // or scored as a confirmed "$0 tax" - see types.ts.
      taxesFeesPerNight: 0,
      taxesConfidence: "unknown",
      totalPrice: offer.totalPrice,
      cancellation: {
        // Not returned by this endpoint - defaulting to "not confirmed
        // free" rather than fabricating a deadline/penalty this app was
        // never actually told. See DECISIONS.md. confidence: "unknown" is
        // what keeps isFreeCancellation: false here from ever being shown
        // or scored as a confirmed "non-refundable" - see types.ts.
        isFreeCancellation: false,
        deadlineIso: null,
        penaltyPercentage: null,
        confidence: "unknown",
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
      logMappingDiagnostics(hotel.name, checkIn, checkOut, json.data.offers, offers.length);
      return { status: "ready", offers };
    }
    return { status: "error", message: `unexpected response: ${JSON.stringify(json).slice(0, 500)}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stayingApiRefresh] submitStayingApiJob failed for hotel=${hotelId} ${checkIn}->${checkOut}:`, message);
    return { status: "error", message };
  }
}

// 2026-09-06 diagnostic logging - added after a real hotel/date pair came
// back with zero mapped offers right after StayingAPI credits were topped
// up, with no way to tell "genuinely sold out" from "the OTA_TO_SUPPLIER
// mapping silently dropped everything StayingAPI actually returned" (both
// look identical downstream: an empty array). Logs the raw, pre-mapping ota
// strings so a real seller name that doesn't match this file's mapping
// shows up in Netlify's function logs on the very next live check, real or
// test - no extra credit spend needed to see it. Safe to leave in
// permanently: one or two short lines per live check, not per request.
function logMappingDiagnostics(
  hotelName: string,
  checkIn: string,
  checkOut: string,
  rawOffers: Array<{ ota?: string; totalPrice?: number; currency?: string }>,
  mappedCount: number
): void {
  // currency included from 2026-09-06 - a first live "google_hotels" offer
  // came back at a total (407) that looked suspiciously low for the
  // property, raising the question of whether StayingAPI ever ignores the
  // requested `currency=AED` param. Logging it here means the next
  // occurrence answers that directly instead of requiring a guess from the
  // number alone.
  console.log(
    `[stayingApiRefresh] ${hotelName} ${checkIn}->${checkOut}: StayingAPI returned ${rawOffers.length} raw offer(s):`,
    JSON.stringify(rawOffers.map((o) => ({ ota: o.ota, totalPrice: o.totalPrice, currency: o.currency })))
  );
  if (mappedCount < rawOffers.length) {
    console.log(
      `[stayingApiRefresh] ${hotelName} ${checkIn}->${checkOut}: ${rawOffers.length - mappedCount} of those raw offer(s) were dropped (unrecognized seller not in OTA_TO_SUPPLIER, or a currency mismatch - see the warning above if it's the latter).`
    );
  }
}

export type LiveCheckState =
  | { kind: "not-applicable" } // mock hotel - nothing real to check
  | { kind: "ready" } // a cache row already exists and is ready (0 or more offers - both are a real answer)
  | { kind: "checking" } // a live check is in flight (just triggered, or someone else already triggered it)
  | { kind: "error"; message: string };

// 2026-09-06 - a failed attempt (the submit call erroring, or the poll
// discovering StayingAPI's own job failed) is stored as its own "failed"
// status, distinct from "ready." Previously this either got deleted (submit
// path) or silently rewritten to "ready" with offersJson "[]" (poll path,
// pollLiveCheck below) - the second one is a real bug: it permanently
// records a transient failure as a confirmed "checked, no availability"
// answer indistinguishable from a real one, with no way for a future
// visitor to ever trigger a fresh attempt (see stayingApiAdapter.ts - a
// "ready" row never expires or gets rechecked). Caught live 2026-09-06: a
// real 5-star Dubai hotel, 14 days out, showed "nothing available" here
// while its own direct booking site had multiple bookable rooms that same
// night - proof this wasn't a genuine zero-availability answer.
//
// The retry itself is deliberately cooled down rather than immediate,
// because "immediate" is dangerous here specifically: LiveCheckStatus.tsx's
// client-side poller calls router.refresh() the moment a live check reaches
// any terminal state (ready OR error), which re-runs this exact function.
// Without a cooldown, a single visitor whose one browser tab hits a
// persistent failure (a genuinely broken hotel/date pair, not just a blip)
// would silently re-trigger a brand-new PAID StayingAPI call every time
// their own tab auto-refreshes - a real, unbounded credit-burn loop within
// one visit, not just "the next visitor retries once." The cooldown bounds
// that to at most one paid attempt per triple per window, while still
// self-healing across real visits without any admin action.
const FAILED_CHECK_RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

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
 * and only the winner's insert reports a returned id. A "failed" row is
 * re-claimed the same atomic way (a conditional UPDATE instead of an
 * INSERT) once the cooldown above has elapsed - see the existing.status
 * === "failed" branch below.
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

  let placeholderId: string;

  if (existing) {
    if (existing.status === "ready") return { kind: "ready" };
    if (existing.status === "pending") return { kind: "checking" }; // already in flight, ours or someone else's

    // status === "failed" - eligible for exactly one fresh attempt per
    // cooldown window. Still within cooldown: report the failure honestly
    // rather than spending another credit on it right away.
    const ageMs = Date.now() - existing.refreshedAt.getTime();
    if (ageMs < FAILED_CHECK_RETRY_COOLDOWN_MS) {
      return { kind: "error", message: "A live check for these dates failed recently - retrying shortly." };
    }

    // Cooldown elapsed - claim this specific row back to "pending" with a
    // conditional update (only succeeds if it's still "failed"), the same
    // race-safety onConflictDoNothing gives the fresh-insert path below.
    const reclaimed = await db
      .update(schema.stayingApiCache)
      .set({ status: "pending", jobId: null, pollUrl: null, offersJson: null, refreshedAt: new Date() })
      .where(and(eq(schema.stayingApiCache.id, existing.id), eq(schema.stayingApiCache.status, "failed")))
      .returning({ id: schema.stayingApiCache.id });

    if (reclaimed.length === 0) {
      // Lost the race - another request already reclaimed and is retrying it.
      return { kind: "checking" };
    }
    placeholderId = existing.id;
  } else {
    const freshId = newId();
    const inserted = await db
      .insert(schema.stayingApiCache)
      .values({
        id: freshId,
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
    placeholderId = freshId;
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
  // Marked "failed" (not deleted, not "ready") so the next attempt goes
  // through the cooldown-gated reclaim path above instead of either being
  // lost forever or retried immediately - see the type comment above.
  console.error(`[stayingApiRefresh] ensureLiveCheckTriggered: submit failed for ${hotel.name} ${checkIn}->${checkOut}:`, outcome.message);
  await db
    .update(schema.stayingApiCache)
    .set({ status: "failed", jobId: null, pollUrl: null, offersJson: null, refreshedAt: new Date() })
    .where(eq(schema.stayingApiCache.id, placeholderId));
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
  // A "failed" row has no pollUrl (cleared when it was marked failed - see
  // ensureLiveCheckTriggered) - without this check it would fall into the
  // "no pollUrl yet" branch below and report "pending" forever, since
  // nothing here ever gives it one. Reporting "error" is what lets the
  // client's LiveCheckStatus widget treat this as terminal and
  // router.refresh(), which re-enters ensureLiveCheckTriggered's
  // cooldown-gated retry logic on the next server render.
  if (row.status === "failed") return { status: "error" };
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
    // Was `status: "ready", offersJson: "[]"` - a real bug, caught
    // 2026-09-06: that permanently recorded a poll-time failure (the
    // StayingAPI job itself failing, or our own status-check request
    // erroring) as an indistinguishable, confirmed "checked, zero offers"
    // answer forever (see stayingApiAdapter.ts - a "ready" row never
    // expires or gets rechecked). "failed" instead goes through
    // ensureLiveCheckTriggered's cooldown-gated retry on the next real
    // visit, rather than lying that this property has no availability.
    await db
      .update(schema.stayingApiCache)
      .set({ status: "failed", offersJson: null, jobId: null, pollUrl: null, refreshedAt: new Date() })
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
      logMappingDiagnostics(hotel.name, checkIn, checkOut, result?.offers ?? [], offers.length);
      return { status: "ready", offers };
    }
    if (jobStatus === "failed") {
      const message = json?.data?.error?.message ?? "job failed";
      console.error(`[stayingApiRefresh] pollStayingApiJob: job failed for ${hotel.name} ${checkIn}->${checkOut}:`, message);
      return { status: "error", message };
    }
    return { status: "pending" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stayingApiRefresh] pollStayingApiJob failed for hotel=${hotelId} ${checkIn}->${checkOut}:`, message);
    return { status: "error", message };
  }
}
