import { NextResponse } from "next/server";

// QUARANTINED (StayingAPI full quarantine). This route used to poll a
// StayingAPI live-check job for Check IQ. Check IQ no longer calls StayingAPI,
// so there is nothing to poll. The original implementation is preserved,
// unmodified and unreachable, in
// src/lib/suppliers/quarantined/liveCheckStatusHandler.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "quarantined", detail: "Live rate checks are currently unavailable." }, { status: 410 });
}
