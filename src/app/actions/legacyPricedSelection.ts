"use server";

import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { getSessionId } from "@/lib/session";

// QUARANTINED: the legacy SELLER-PRICED selection ("Select this deal"),
// preserved unchanged for a future independent rate-verification source. It is
// imported only by the dormant ResultsList component; no active journey page
// reaches it (see src/lib/hotel/stayingApiQuarantine.test.ts). The active
// journey chooses a HOTEL via selectProperty() in ./trip.ts, which needs no
// seller, price, currency or deep link.
//
// (H1's platform dual-write was removed from this legacy path: a rate-source
// seller must never become a platform merchant merely by appearing here.)

/**
 * Check IQ's old "Select this deal" primary action - persists exactly what
 * was on screen (hotel, the Verdict that was showing, the chosen supplier and
 * price, and a snapshot of the deep link), lazily creating a trip for a
 * visitor who reached Check IQ without one. Then moves on to Complete Your Trip.
 */
export async function selectDeal(formData: FormData) {
  let tripId = String(formData.get("tripId") ?? "");
  const hotelId = String(formData.get("hotelId") ?? "");
  const supplierSlug = String(formData.get("supplierSlug") ?? "");
  const supplierName = String(formData.get("supplierName") ?? "");
  const totalPrice = Number(formData.get("totalPrice"));
  const deepLink = String(formData.get("deepLink") ?? "");
  if (!hotelId || !supplierSlug || !deepLink || !Number.isFinite(totalPrice)) {
    throw new Error("Missing deal details.");
  }
  const verdictIdRaw = formData.get("verdictId");
  const verdictId = verdictIdRaw ? String(verdictIdRaw) : null;
  const currency = String(formData.get("currency") ?? "AED");

  if (!tripId) {
    const hotelCity = String(formData.get("hotelCity") ?? "");
    const checkIn = String(formData.get("checkIn") ?? "");
    const checkOut = String(formData.get("checkOut") ?? "");
    if (!hotelCity || !checkIn || !checkOut) throw new Error("Missing trip context for a direct Check IQ visit.");

    const sessionId = await getSessionId();
    tripId = newId();
    await db.insert(schema.trips).values({
      id: tripId,
      sessionId,
      destination: hotelCity,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
    });
  }

  await db.insert(schema.tripSelections).values({
    id: newId(),
    tripId,
    hotelId,
    verdictId,
    supplierSlug,
    supplierName,
    totalPrice,
    currency,
    deepLink,
  });

  redirect(`/complete-your-trip?trip=${tripId}`);
}
