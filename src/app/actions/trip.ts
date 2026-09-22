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
import { parseTripCoreFields, parseTripPreferencesFields, serializeTripPreferences, type CreateTripState } from "@/lib/tripIntent";
import { isJoaliEligibleDestination } from "@/lib/hotel/joaliStagingGate";

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

// FormData.get/getAll return FormDataEntryValue (string | File). Every field
// this action reads is a plain text/hidden input, so a File here can only
// mean a tampered request - normalised to a value the validator will itself
// reject (a stray File never silently becomes a legitimate string).
function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}
function strAll(values: FormDataEntryValue[]): string[] {
  return values.map(str);
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
 *
 * V2A Build 1: both the core fields (destination/dates/adults/children/
 * rooms) and the optional "Personalise your stay" preferences go through
 * the SAME shared validation contract (src/lib/tripIntent.ts) before
 * anything is written. A present-but-invalid value (a tampered adults/
 * children/rooms count, an unknown priority, a budget with no currency,
 * ...) is never silently coerced into a default - see that module's own
 * comment for why that used to be exactly the bug here.
 *
 * Bound to DiscoverForm via React's useActionState rather than a bare
 * `<form action={createTrip}>`, specifically so an invalid submission can
 * return `{ ok: false, errors }` for the form to render inline - a thrown
 * Error here would otherwise surface Next.js's generic, unhandled error
 * boundary instead of a clear, accessible, in-page message, and the
 * traveller's already-entered values would have no obvious path back. No
 * trip is written when validation fails, tampered or not.
 */
interface CreatedTrip {
  id: string;
  destination: string;
}

/**
 * The validated parse + insert both createTrip and exploreJoaliFromDiscover
 * (below) share verbatim - same core-field/preferences validation, same
 * trips row shape. Not exported: a "use server" file may only export async
 * functions, so this stays a private helper, not a server action itself.
 */
async function createTripFromFormData(formData: FormData): Promise<{ ok: true; trip: CreatedTrip } | { ok: false; errors: string[] }> {
  const core = parseTripCoreFields({
    destination: str(formData.get("destination")),
    checkin: str(formData.get("checkin")),
    checkout: str(formData.get("checkout")),
    adults: str(formData.get("adults")),
    children: str(formData.get("children")),
    rooms: str(formData.get("rooms")),
  });
  const preferences = parseTripPreferencesFields({
    budgetAmount: str(formData.get("budgetAmount")),
    budgetCurrency: str(formData.get("budgetCurrency")),
    preferredLocation: str(formData.get("preferredLocation")),
    priorities: strAll(formData.getAll("priorities")),
    essentialRequirements: strAll(formData.getAll("essentialRequirements")),
  });

  const errors = [...(core.ok ? [] : core.errors), ...(preferences.ok ? [] : preferences.errors)];
  if (errors.length > 0 || !core.ok || !preferences.ok) {
    return { ok: false, errors: errors.length > 0 ? errors : ["Invalid trip details."] };
  }

  const sessionId = await getSessionId();
  const id = newId();

  await db.insert(schema.trips).values({
    id,
    sessionId,
    destination: core.value.destination,
    checkIn: new Date(core.value.checkIn),
    checkOut: new Date(core.value.checkOut),
    adults: core.value.adults,
    children: core.value.children,
    rooms: core.value.rooms,
    purpose: parsePurpose(formData.get("purpose")),
    preferencesJson: serializeTripPreferences(preferences.value),
  });

  return { ok: true, trip: { id, destination: core.value.destination } };
}

export async function createTrip(_prevState: CreateTripState, formData: FormData): Promise<CreateTripState> {
  const result = await createTripFromFormData(formData);
  if (!result.ok) return { ok: false, errors: result.errors };
  redirect(`/?trip=${result.trip.id}#shortlist`); // never returns; CreateTripState is only observed on failure
}

/**
 * DiscoverForm's "Explore JOALI resorts" button (GitHub Issue #3 follow-up,
 * 2026-09-23): a Maldives search previously created a trip exactly like any
 * other destination but had no path from it to /joali - the visitor only
 * ever saw the generic "we're curating this destination" notice, with no
 * visible trip id and no JOALI link. This is a second submit target on the
 * SAME Discover form (via the button's own formAction, not a separate form),
 * reusing createTripFromFormData's identical validated parsing/insert - the
 * created trip is indistinguishable from one made through the normal
 * "Explore this destination" button.
 *
 * The JOALI redirect is independently re-validated here, server-side: the
 * button's visibility in DiscoverForm.tsx (gate + "maldives" match) is a UI
 * hint only, never trusted. If the gate is off or the validated destination
 * isn't exactly "maldives" (a tampered request, e.g. a direct POST with a
 * different destination and this action's formAction spoofed), this falls
 * back to the exact same outcome the normal Explore button would produce -
 * never a JOALI redirect, never a rejected/lost search.
 */
export async function exploreJoaliFromDiscover(formData: FormData): Promise<void> {
  const result = await createTripFromFormData(formData);
  if (!result.ok) {
    redirect("/"); // invalid input - no bound useActionState here to render field errors for this button; fail safe to a fresh start
  }
  if (isJoaliEligibleDestination(result.trip.destination)) {
    redirect(`/joali?trip=${result.trip.id}`);
  }
  redirect(`/?trip=${result.trip.id}#shortlist`); // gate off or not Maldives - identical outcome to createTrip
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
