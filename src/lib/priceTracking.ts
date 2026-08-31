import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";

export interface CreatePriceTrackingInput {
  hotelId: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  email: string;
  minDropAed: number;
  baselineTotal: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createPriceTracking(input: CreatePriceTrackingInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like a valid email address." };
  if (!Number.isFinite(input.minDropAed) || input.minDropAed <= 0) {
    return { ok: false, error: "Minimum drop amount must be a positive number." };
  }

  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, input.hotelId) });
  if (!hotel) return { ok: false, error: "Unknown property." };

  await db.insert(schema.priceTracking).values({
    id: newId(),
    hotelId: input.hotelId,
    checkIn: new Date(input.checkIn),
    checkOut: new Date(input.checkOut),
    email,
    minDropAed: input.minDropAed,
    baselineTotal: input.baselineTotal,
  });

  return { ok: true };
}

/**
 * Called from runSearch() every time a search happens. Opportunistic, not a
 * background poller — see the schema comment on priceTracking for why that's
 * an honest (if limited) MVP. Flips any active tracker for this exact
 * hotel/checkIn/checkOut whose stated threshold the new cheapest total has
 * now cleared into "triggered", so it shows up at /admin/price-alerts.
 */
export async function checkAndTriggerAlerts(
  hotelId: string,
  checkIn: string,
  checkOut: string,
  cheapestTotal: number
): Promise<void> {
  const active = await db.query.priceTracking.findMany({
    where: and(
      eq(schema.priceTracking.hotelId, hotelId),
      eq(schema.priceTracking.checkIn, new Date(checkIn)),
      eq(schema.priceTracking.checkOut, new Date(checkOut)),
      eq(schema.priceTracking.status, "active")
    ),
  });

  for (const tracker of active) {
    const drop = tracker.baselineTotal - cheapestTotal;
    if (drop >= tracker.minDropAed) {
      await db
        .update(schema.priceTracking)
        .set({ status: "triggered", triggeredAt: new Date(), triggeredTotal: cheapestTotal })
        .where(eq(schema.priceTracking.id, tracker.id));
    }
  }
}
