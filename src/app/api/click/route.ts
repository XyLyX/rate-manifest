import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { logEvent } from "@/lib/events";
import { getSessionId } from "@/lib/session";

// Every outbound click — the moment someone leaves Rate Manifest for a
// supplier — gets logged as an Event (feeds D4) AND opens a BookingOutcome
// row at status "clicked". That row is what the post-booking WhatsApp
// check-in (not yet built — see DECISIONS.md) later updates to
// "confirmed_via_followup" or "issue_reported". Without this row existing
// at click time, there would be nothing for that follow-up to update.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const hotelId = url.searchParams.get("hotel");
  const supplierSlug = url.searchParams.get("supplier");
  const rateId = url.searchParams.get("rate");

  const sessionId = await getSessionId();
  const supplier = supplierSlug
    ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.slug, supplierSlug) })
    : null;

  await logEvent({
    type: "outbound_click",
    sessionId,
    hotelId: hotelId ?? undefined,
    supplierId: supplier?.id,
    metadata: { rateId },
  });

  let outcomeId: string | null = null;
  if (rateId && hotelId && supplier) {
    outcomeId = newId();
    try {
      await db.insert(schema.bookingOutcomes).values({
        id: outcomeId,
        rateId,
        hotelId,
        supplierId: supplier.id,
        status: "clicked",
        source: "outbound_click",
      });
    } catch {
      // Non-fatal — the click itself is already logged via the Event above.
      outcomeId = null;
    }
  }

  // Demo mode has nowhere real to send this click — a real adapter would
  // return a real affiliate deep-link in outboundUrl instead of this stub
  // path, and this route would redirect there.
  const stubUrl = new URL("/stub-booking", url.origin);
  if (hotelId) stubUrl.searchParams.set("hotel", hotelId);
  if (supplierSlug) stubUrl.searchParams.set("supplier", supplierSlug);
  // Carries the BookingOutcome row's own id (not the rate id) so the stub
  // page can build a WhatsApp check-in message referencing it, and the
  // /admin/checkins page can match a reply back to this specific click.
  if (outcomeId) stubUrl.searchParams.set("outcome", outcomeId);
  return NextResponse.redirect(stubUrl);
}
