import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { TripPurpose } from "@/lib/constants";

// Read-only helpers over the trips/trip_selections/trip_experiences tables
// (see src/db/schema.ts's own comment on those three for the full
// rationale) - the four-page journey's Customer/Trip Graph. Kept separate
// from src/app/actions/trip.ts (the "use server" mutations) because a
// "use server" file may only export async functions - these plain reads
// are called directly from server components (page.tsx files), not
// invoked as form actions.

export interface Trip {
  id: string;
  sessionId: string;
  destination: string;
  checkIn: string; // ISO date (YYYY-MM-DD) - re-sliced from the stored timestamp for the same reason every page here already carries dates as plain ISO strings, not Date objects, through query params
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  purpose: TripPurpose;
  createdAt: Date;
}

function toTrip(row: typeof schema.trips.$inferSelect): Trip {
  return {
    id: row.id,
    sessionId: row.sessionId,
    destination: row.destination,
    checkIn: row.checkIn.toISOString().slice(0, 10),
    checkOut: row.checkOut.toISOString().slice(0, 10),
    adults: row.adults,
    children: row.children,
    rooms: row.rooms,
    purpose: row.purpose as TripPurpose,
    createdAt: row.createdAt,
  };
}

/** Looks up one trip by id. Returns null if it doesn't exist - a stale or hand-edited ?trip= param is not an error, just a "start over" state every page here already knows how to render. */
export async function getTrip(tripId: string): Promise<Trip | null> {
  const row = await db.query.trips.findFirst({ where: eq(schema.trips.id, tripId) });
  return row ? toTrip(row) : null;
}

export interface TripSelection {
  id: string;
  tripId: string;
  hotelId: string;
  verdictId: string | null;
  supplierSlug: string;
  supplierName: string;
  totalPrice: number;
  currency: string;
  deepLink: string;
  selectedAt: Date;
}

/**
 * The deal a customer chose on Page 2 (Check IQ), if any - what Page 3 and
 * Page 4 build on. A trip can only ever have one "current" selection in
 * this app's scope (picking a different hotel/rate is a new Check IQ visit,
 * not a change to an existing choice) - selecting again simply inserts a
 * new row, so this reads the most recent one by selectedAt rather than
 * assuming there's exactly one.
 */
export async function getLatestTripSelection(tripId: string): Promise<TripSelection | null> {
  const row = await db.query.tripSelections.findFirst({
    where: eq(schema.tripSelections.tripId, tripId),
    orderBy: [desc(schema.tripSelections.selectedAt)],
  });
  return row ?? null;
}

export interface TripExperience {
  id: string;
  tripId: string;
  supplierSlug: string;
  supplierProductId: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  bookingUrl: string;
  addedAt: Date;
}

/** Every experience a customer explicitly added on Page 3 - see trip_experiences' own schema comment for why this is a snapshot, not a live re-fetch. */
export async function getTripExperiences(tripId: string): Promise<TripExperience[]> {
  const rows = await db.query.tripExperiences.findMany({
    where: eq(schema.tripExperiences.tripId, tripId),
    orderBy: [desc(schema.tripExperiences.addedAt)],
  });
  return rows;
}
