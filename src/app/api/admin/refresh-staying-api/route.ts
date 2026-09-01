import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { submitStayingApiJob } from "@/lib/suppliers/stayingApiRefresh";

// Phase 1 of 2 - see collect-staying-api-jobs/route.ts for phase 2, and
// DECISIONS.md, "Live StayingAPI calls and the refresh architecture," for
// why this is split into two fast routes instead of one that waits: a
// Netlify function has a hard, non-configurable 60-second limit, and a
// StayingAPI job can take several minutes, so nothing here can afford to
// wait for one. This route only ever makes one quick HTTP call per hotel
// (StayingAPI answers immediately if it already has this hotel/date-range
// cached on its own side - their cache TTL is 1 hour - and otherwise
// hands back a job to check later) and returns well within a few seconds.
//
// Manually triggered for now, via the "Refresh StayingAPI prices" GitHub
// Actions workflow (workflow_dispatch only, no schedule) - staying on the
// free 300-credit StayingAPI tier until there's a reason to pay for one.
// Protected by the same long-random-secret pattern as init-db.
//
// Submits a request for every real (isMockData: false) hotel, for ONE
// date window - defaults to 14 days out, 1 night (matches
// defaultCheckIn()/defaultCheckOut() in src/app/page.tsx exactly, on
// purpose: a blank-dates refresh should cover what a visitor sees by
// default when they land on the site and search, not some other window
// nobody's default search would ever hit), or pass ?checkIn=&checkOut=
// (both YYYY-MM-DD) to target a specific window instead, e.g. to match
// dates you're about to demo. A visitor's live search only shows real
// StayingAPI data if their chosen dates exactly match a window this has
// been run for - see stayingApiAdapter.ts. Was 21 days out/2 nights
// until 2026-09-01 - changed after that mismatch caused real confusion
// (a blank-dates refresh didn't cover the homepage's own default search
// window) - see DECISIONS.md, "Refresh default date window aligned to
// the site's own default."
//
// Pass ?city=Dubai (must match the `city` column exactly - one of Dubai,
// Abu Dhabi, Fujairah, Ras Al Khaimah, Sharjah, Ajman) to only refresh
// one emirate's hotels instead of all 30. Added specifically because 30
// hotels x ~30 credits/call is ~900 credits per full refresh - more than
// the entire 300-credit free tier in one run - see DECISIONS.md, "Credit
// cost at this catalog size, revised." Testing emirate-by-emirate keeps
// each run to ~150 credits or less.
//
// Pass ?hotel=rixos-premium-jbr,one-and-only-royal-mirage (comma-separated
// hotel ids, matching the `id` column) to target exactly those properties
// instead of a whole city - added 2026-09-01 once the free tier ran down
// to 120 credits (4 hotels' worth) and a 5-hotel Dubai refresh no longer
// fit. Takes priority over ?city= when both are present. See DECISIONS.md,
// "Per-hotel refresh, added once credits ran low."
//
// Refreshing a window more than 30 days out still costs the same credits
// (this endpoint always compares every seller) but stayingApiAdapter.ts
// only ever surfaces the hotel's own direct listing from a window that
// far out - see DYNAMIC_PRICING_WINDOW_DAYS there. Worth keeping in mind
// when deciding which windows are worth spending credits on.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.REFRESH_STAYINGAPI_SECRET || secret !== process.env.REFRESH_STAYINGAPI_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const checkInParam = url.searchParams.get("checkIn");
  const checkOutParam = url.searchParams.get("checkOut");

  let checkIn: string;
  let checkOut: string;
  if (checkInParam && checkOutParam) {
    checkIn = checkInParam;
    checkOut = checkOutParam;
  } else {
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    checkIn = start.toISOString().slice(0, 10);
    checkOut = end.toISOString().slice(0, 10);
  }

  const cityParam = url.searchParams.get("city");
  const hotelParam = url.searchParams.get("hotel");
  const hotelIds = hotelParam
    ? hotelParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : null;

  const realHotels = await db.query.hotels.findMany({
    where: hotelIds
      ? and(eq(schema.hotels.isMockData, false), inArray(schema.hotels.id, hotelIds))
      : cityParam
        ? and(eq(schema.hotels.isMockData, false), eq(schema.hotels.city, cityParam))
        : eq(schema.hotels.isMockData, false),
  });

  let notFoundHotelIds: string[] = [];
  if (hotelIds) {
    const foundIds = new Set(realHotels.map((h) => h.id));
    notFoundHotelIds = hotelIds.filter((id) => !foundIds.has(id));
    if (realHotels.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No real hotels matched any of: ${hotelIds.join(", ")}. Ids must match the hotels.id column exactly.` },
        { status: 400 }
      );
    }
    // A partial miss isn't fatal - proceed with whatever matched, but the
    // response below surfaces notFoundHotelIds plainly so a typo doesn't
    // silently under-spend credits without anyone noticing.
  } else if (cityParam && realHotels.length === 0) {
    const distinctCities = await db
      .selectDistinct({ city: schema.hotels.city })
      .from(schema.hotels)
      .where(eq(schema.hotels.isMockData, false));
    return NextResponse.json(
      {
        ok: false,
        error: `No real hotels found for city "${cityParam}" - city must match exactly.`,
        validCities: distinctCities.map((c) => c.city),
      },
      { status: 400 }
    );
  }

  const results: { hotelId: string; hotelName: string; status: string; detail?: string }[] = [];

  for (const hotel of realHotels) {
    const outcome = await submitStayingApiJob(hotel.id, checkIn, checkOut);

    const existing = await db.query.stayingApiCache.findFirst({
      where: and(
        eq(schema.stayingApiCache.hotelId, hotel.id),
        eq(schema.stayingApiCache.checkIn, new Date(checkIn)),
        eq(schema.stayingApiCache.checkOut, new Date(checkOut))
      ),
    });

    if (outcome.status === "ready") {
      const values = {
        status: "ready",
        offersJson: JSON.stringify(outcome.offers),
        jobId: null,
        pollUrl: null,
        refreshedAt: new Date(),
      };
      if (existing) {
        await db.update(schema.stayingApiCache).set(values).where(eq(schema.stayingApiCache.id, existing.id));
      } else {
        await db.insert(schema.stayingApiCache).values({
          id: newId(),
          hotelId: hotel.id,
          checkIn: new Date(checkIn),
          checkOut: new Date(checkOut),
          ...values,
        });
      }
      results.push({ hotelId: hotel.id, hotelName: hotel.name, status: "ready", detail: `${outcome.offers.length} offers` });
    } else if (outcome.status === "pending") {
      const values = {
        status: "pending",
        jobId: outcome.jobId,
        pollUrl: outcome.pollUrl,
        offersJson: null,
        refreshedAt: new Date(),
      };
      if (existing) {
        await db.update(schema.stayingApiCache).set(values).where(eq(schema.stayingApiCache.id, existing.id));
      } else {
        await db.insert(schema.stayingApiCache).values({
          id: newId(),
          hotelId: hotel.id,
          checkIn: new Date(checkIn),
          checkOut: new Date(checkOut),
          ...values,
        });
      }
      results.push({ hotelId: hotel.id, hotelName: hotel.name, status: "pending" });
    } else {
      results.push({ hotelId: hotel.id, hotelName: hotel.name, status: "error", detail: outcome.message });
    }
  }

  return NextResponse.json({
    ok: true,
    checkIn,
    checkOut,
    city: hotelIds ? null : (cityParam ?? "all"),
    hotel: hotelParam ?? null,
    notFoundHotelIds: hotelIds ? notFoundHotelIds : undefined,
    hotelsSubmitted: results.length,
    results,
  });
}
