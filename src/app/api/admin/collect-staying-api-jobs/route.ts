import { NextResponse } from "next/server";

// QUARANTINED (StayingAPI full quarantine). This admin route used to poll
// pending StayingAPI jobs and write results to staying_api_cache. It is
// disabled: it makes no StayingAPI call. The original implementation is
// preserved, unmodified and unreachable, in
// src/lib/suppliers/quarantined/collectStayingApiJobsHandler.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "quarantined", detail: "StayingAPI job collection is disabled." }, { status: 410 });
}
