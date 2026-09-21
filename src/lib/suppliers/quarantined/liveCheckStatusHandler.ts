import { NextResponse } from "next/server";
import { pollLiveCheck } from "@/lib/suppliers/stayingApiRefresh";

// Public, unauthenticated on purpose - unlike the admin refresh routes,
// this is called by any real visitor's browser while /search is showing
// the "Checking real-time prices" state (see DECISIONS.md, "Live
// on-demand check on /search"). Safe to expose without a secret because it
// only ever checks the status of a job that ensureLiveCheckTriggered()
// already submitted - it never itself submits a new paid StayingAPI
// request, the same way collect-staying-api-jobs polling repeatedly costs
// nothing beyond the one original submit call.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hotelId = url.searchParams.get("hotel");
  const checkIn = url.searchParams.get("checkin");
  const checkOut = url.searchParams.get("checkout");
  // Occupancy added 2026-09-13 — threaded through to pollLiveCheck so it
  // looks up the correct five-column cache row. Defaults (2/0) match the
  // application-wide occupancy defaults and the stayingApiRefresh defaults.
  const adults = Number(url.searchParams.get("adults") ?? 2);
  const children = Number(url.searchParams.get("children") ?? 0);

  if (!hotelId || !checkIn || !checkOut) {
    return NextResponse.json({ error: "missing hotel/checkin/checkout" }, { status: 400 });
  }

  const result = await pollLiveCheck(hotelId, checkIn, checkOut, adults, children);
  return NextResponse.json(result);
}
