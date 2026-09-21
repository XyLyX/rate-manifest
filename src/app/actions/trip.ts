"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { getSessionId } from "@/lib/session";
import { TRIP_PURPOSES, type TripPurpose } from "@/lib/constants";
import { getTrip } from "@/lib/trip";
import { recordPropertyChoicePersisted } from "@/lib/hotel/journey";

// The three mutations behind the four-page journey (see
// claude/travel-decision-platform-assessment.md, "RateManifest — Final
// Customer Journey," and src/db/schema.ts's own comment on trips/
// trip_selections/trip_experiences). Same "use server" + FormData pattern
// as src/app/admin/price-alerts/actions.ts's markAlertSent - a "use
// server" file may only export async functions, so the plain reads that
// pair with these live separately in src/lib/trip.ts.

function parsePurpose(raw: FormDataEntryValue | null): TripPurpose {
  const value = String(raw ?? "UNSPECIFIED");
  return (TRIP_PURPOSES as readonly string[]).includes(value) ? (value as TripPurpose) : "UNSPECIFIED";
}

function parseIntOr(raw: FormDataEntryValue | null, fallback: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Page 1 (Discover)'s submit action. Creates the lightweight trip record
 * that carries destination/dates/guests/intent forward through the rest of
 * the journey via its id (see trips' own schema comment for why this is
 * deliberately leaner than the original blueprint's full `trip` table) and
 * sends the visitor back to the homepage's results for that destination.
 *
 * Guests/rooms are stored as trip context only, not as a working filter -
 * see the technical blueprint, Section 10: rooms.occupancy is a single
 * fixed value per hotel today, and neither the mock adapter nor StayingAPI
 * accepts a guest count, so nothing downstream can honestly vary results
 * by it yet. Recorded now so it's already in place once that changes,
 * exactly the "document the interface, don't fake the machinery" rule the
 * Sprint 1 Customer/Trip Graph followed everywhere else.
 */
export async function createTrip(formData: FormData) {
  const destination = String(formData.get("destination") ?? "").trim();
  const checkin = String(formData.get("checkin") ?? "");
  const checkout = String(formData.get("checkout") ?? "");
  if (!destination || !checkin || !checkout) throw new Error("Missing destination or dates.");

  const sessionId = await getSessionId();
  const id = newId();

  await db.insert(schema.trips).values({
    id,
    sessionId,
    destination,
    checkIn: new Date(checkin),
    checkOut: new Date(checkout),
    adults: parseIntOr(formData.get("adults"), 2),
    children: parseIntOr(formData.get("children"), 0),
    rooms: parseIntOr(formData.get("rooms"), 1),
    purpose: parsePurpose(formData.get("purpose")),
  });

  redirect(`/?trip=${id}#shortlist`);
}

/**
 * Check IQ's primary action: the traveller explicitly chooses a HOTEL.
 * A property decision only - no seller, rate, price, currency or deep link is
 * required or recorded (rate verification is currently unavailable, and a
 * priced seller selection is a different concept; see
 * ./legacyPricedSelection.ts). Persists the trip's hotel component (chosen
 * property + the trip's own stay/traveller context) on the shared platform,
 * lazily creating a trip for a visitor who reached Check IQ without one.
 */
export async function selectProperty(formData: FormData) {
  let tripId = String(formData.get("tripId") ?? "");
  const hotelId = String(formData.get("hotelId") ?? "");
  if (!hotelId) throw new Error("Missing hotel.");

  const property = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, hotelId) });
  if (!property) throw new Error("Unknown hotel.");

  if (!tripId) {
    const checkIn = String(formData.get("checkIn") ?? "");
    const checkOut = String(formData.get("checkOut") ?? "");
    if (!checkIn || !checkOut) throw new Error("Missing trip context for a direct Check IQ visit.");

    const sessionId = await getSessionId();
    tripId = newId();
    await db.insert(schema.trips).values({
      id: tripId,
      sessionId,
      destination: property.city,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
    });
  }

  const trip = await getTrip(tripId);
  if (!trip) throw new Error("Trip not found.");
  await recordPropertyChoicePersisted({
    tripId,
    propertyId: property.id,
    propertyName: property.name,
    stay: { destination: trip.destination, checkIn: trip.checkIn, checkOut: trip.checkOut, rooms: trip.rooms, adults: trip.adults, children: trip.children },
  });

  redirect(`/complete-your-trip?trip=${tripId}`);
}


/**
 * Page 3 (Complete Your Trip)'s "Add to My Trip" - deliberately additive
 * and multi-select (per the final spec: a customer can add several
 * experiences, not pick exactly one the way Page 2's deal selection
 * works). Stays on the same page rather than redirecting, since adding one
 * experience doesn't mean the customer is done browsing others.
 * onConflictDoNothing on (tripId, supplierProductId) - see
 * trip_experiences' own unique index - so clicking an already-added
 * product's button twice is a harmless no-op, not a duplicate row.
 */
export async function addTripExperience(formData: FormData) {
  const tripId = String(formData.get("tripId") ?? "");
  const supplierSlug = String(formData.get("supplierSlug") ?? "");
  const supplierProductId = String(formData.get("supplierProductId") ?? "");
  const title = String(formData.get("title") ?? "");
  const bookingUrl = String(formData.get("bookingUrl") ?? "");
  if (!tripId || !supplierSlug || !supplierProductId || !title || !bookingUrl) {
    throw new Error("Missing experience details.");
  }
  const imageUrl = formData.get("imageUrl") ? String(formData.get("imageUrl")) : null;
  const priceRaw = formData.get("price");
  const price = priceRaw != null && priceRaw !== "" ? Number(priceRaw) : null;
  const currency = String(formData.get("currency") ?? "AED");

  await db
    .insert(schema.tripExperiences)
    .values({
      id: newId(),
      tripId,
      supplierSlug,
      supplierProductId,
      title,
      imageUrl,
      price: Number.isFinite(price) ? price : null,
      currency,
      bookingUrl,
    })
    .onConflictDoNothing({
      target: [schema.tripExperiences.tripId, schema.tripExperiences.supplierProductId],
    });

  revalidatePath("/complete-your-trip", "page");
}

/**
 * The inverse of addTripExperience - lets a customer change their mind on
 * Page 3 without starting the trip over. Matched on (tripId,
 * supplierProductId), the same pair addTripExperience's own unique index
 * enforces, rather than the row's internal id - the caller (ThingsToDoSection)
 * already has the product id on hand for every card and would otherwise
 * need an extra lookup just to find the row id to delete.
 */
export async function removeTripExperience(formData: FormData) {
  const tripId = String(formData.get("tripId") ?? "");
  const supplierProductId = String(formData.get("supplierProductId") ?? "");
  if (!tripId || !supplierProductId) throw new Error("Missing experience details.");

  await db
    .delete(schema.tripExperiences)
    .where(and(eq(schema.tripExperiences.tripId, tripId), eq(schema.tripExperiences.supplierProductId, supplierProductId)));

  revalidatePath("/complete-your-trip", "page");
}
