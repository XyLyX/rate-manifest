"use server";

import { redirect } from "next/navigation";
import { getTrip } from "@/lib/trip";
import { ensureJoaliCommercialSetup, recordPropertyChoicePersisted } from "@/lib/hotel/journey";
import { JOALI_VERIFIED_PROPERTIES } from "@/lib/hotel/joaliDestination";
import { isJoaliStagingEnabled } from "@/lib/hotel/joaliStagingGate";

// GitHub Issue #3 - isolated, staging-only JOALI entry point. A deliberately
// separate action from selectProperty (src/app/actions/trip.ts): JOALI
// properties are never seeded into the hotels catalogue, so the existing
// catalogue-driven action's `db.query.hotels.findFirst` lookup could never
// resolve them. This mirrors selectProperty's own shape - persist the trip's
// hotel component via the existing platform property-choice mechanism
// (recordPropertyChoicePersisted, unchanged), then continue into Complete
// Your Trip - using only the trip's own already-validated dates/party;
// nothing is re-entered, re-collected or invented here.
export async function chooseJoaliProperty(formData: FormData) {
  // Enforced independently here, before any trip read, property mutation or
  // commercial registration below - not relying on /joali being unreachable
  // (a direct POST to this action bypasses the page entirely). See
  // joaliStagingGate.ts.
  if (!isJoaliStagingEnabled()) throw new Error("JOALI staging is not enabled.");

  const tripId = String(formData.get("tripId") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!tripId) throw new Error("Missing trip.");

  const property = Object.prototype.hasOwnProperty.call(JOALI_VERIFIED_PROPERTIES, propertyId)
    ? JOALI_VERIFIED_PROPERTIES[propertyId]
    : undefined;
  if (!property) throw new Error("Unknown JOALI property.");

  const trip = await getTrip(tripId);
  if (!trip) throw new Error("Trip not found.");

  await ensureJoaliCommercialSetup();
  await recordPropertyChoicePersisted({
    tripId,
    propertyId,
    propertyName: property.name,
    stay: {
      destination: trip.destination,
      checkIn: trip.checkIn,
      checkOut: trip.checkOut,
      rooms: trip.rooms,
      adults: trip.adults,
      children: trip.children,
    },
  });

  redirect(`/complete-your-trip?trip=${tripId}`);
}
