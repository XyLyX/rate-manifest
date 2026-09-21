import { NextResponse } from "next/server";

// QUARANTINED (StayingAPI full quarantine). This admin route used to submit
// paid StayingAPI refresh jobs. It is disabled: it makes no StayingAPI call
// and spends no credits. The original implementation is preserved, unmodified
// and unreachable, in src/lib/suppliers/quarantined/refreshStayingApiHandler.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "quarantined", detail: "StayingAPI refresh is disabled." }, { status: 410 });
}
