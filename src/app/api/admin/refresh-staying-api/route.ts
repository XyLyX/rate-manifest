import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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
// date window - defaults to 21 days out, 2 nights, or pass
// ?checkIn=&checkOut= (both YYYY-MM-DD) to target a specific window, e.g.
// to match dates you're about to demo. A visitor's live search only shows
// real StayingAPI data if their chosen dates exactly match a window this
// has been run for - see stayingApiAdapter.ts.
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
    start.setDate(start.getDate() + 21);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    checkIn = start.toISOString().slice(0, 10);
    checkOut = end.toISOString().slice(0, 10);
  }

  const realHotels = await db.query.hotels.findMany({ where: eq(schema.hotels.isMockData, false) });

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

  return NextResponse.json({ ok: true, checkIn, checkOut, hotelsSubmitted: results.length, results });
}