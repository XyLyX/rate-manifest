import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { pollStayingApiJob } from "@/lib/suppliers/stayingApiRefresh";

// Phase 2 of 2 - see refresh-staying-api/route.ts for phase 1, and
// DECISIONS.md, "Live StayingAPI calls and the refresh architecture," for
// the full reasoning. This route checks every staying_api_cache row still
// marked "pending" and, for each, makes exactly ONE quick status check
// against StayingAPI - it never waits for a job itself. The GitHub Actions
// workflow is what waits, by calling this route repeatedly a short delay
// apart until every row reads "ready" (or it gives up after its own
// attempt budget). Safe to call as many times as needed; a hotel with no
// pending row is simply skipped.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.REFRESH_STAYINGAPI_SECRET || secret !== process.env.REFRESH_STAYINGAPI_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const pendingRows = await db.query.stayingApiCache.findMany({ where: eq(schema.stayingApiCache.status, "pending") });

  const results: { hotelId: string; status: string; detail?: string }[] = [];

  for (const row of pendingRows) {
    if (!row.pollUrl) {
      // Shouldn't happen - a "pending" row always got a pollUrl when it was
      // written - but never leave a row stuck pending forever over it.
      await db
        .update(schema.stayingApiCache)
        .set({ status: "ready", offersJson: "[]", jobId: null, pollUrl: null, refreshedAt: new Date() })
        .where(eq(schema.stayingApiCache.id, row.id));
      results.push({ hotelId: row.hotelId, status: "error", detail: "pending row had no pollUrl - marked ready with 0 offers" });
      continue;
    }

    const checkIn = row.checkIn.toISOString().slice(0, 10);
    const checkOut = row.checkOut.toISOString().slice(0, 10);
    const outcome = await pollStayingApiJob(row.hotelId, row.pollUrl, checkIn, checkOut);

    if (outcome.status === "ready") {
      await db
        .update(schema.stayingApiCache)
        .set({
          status: "ready",
          offersJson: JSON.stringify(outcome.offers),
          jobId: null,
          pollUrl: null,
          refreshedAt: new Date(),
        })
        .where(eq(schema.stayingApiCache.id, row.id));
      results.push({ hotelId: row.hotelId, status: "ready", detail: `${outcome.offers.length} offers` });
    } else if (outcome.status === "pending") {
      results.push({ hotelId: row.hotelId, status: "pending" });
    } else {
      // The job itself failed on StayingAPI's side - mark ready with 0
      // offers rather than polling a dead job forever. A later refresh run
      // will overwrite this row and try again.
      await db
        .update(schema.stayingApiCache)
        .set({ status: "ready", offersJson: "[]", jobId: null, pollUrl: null, refreshedAt: new Date() })
        .where(eq(schema.stayingApiCache.id, row.id));
      results.push({ hotelId: row.hotelId, status: "error", detail: outcome.message });
    }
  }

  const stillPending = results.filter((r) => r.status === "pending").length;
  return NextResponse.json({ ok: true, checked: results.length, stillPending, results });
}