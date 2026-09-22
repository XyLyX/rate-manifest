import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getTrip } from "@/lib/trip";
import { drizzlePlatformStore } from "@/lib/platform/drizzleStore";
import { inquiryOnlyCta, previewHotelCtaForTrip, propertyBookingUnavailableCta, resolveHotelActionForTrip, type HotelCta } from "./commercial";
import { getPropertyChoice, propertyChoiceWithLegacyFallback, recordHotelDecision, recordPropertyChoice, type HotelDecisionInput, type PropertyChoice, type PropertyChoiceInput } from "./decision";
import { ensureJoaliCommercialSetup as ensureJoaliCommercialSetupPure, joaliCtaForChoice as joaliCtaForChoicePure } from "./joaliCommercial";


// DB-backed wiring of the Hotel V1 decision/commercial layer into the live
// journey. Every function here is FAIL-SAFE: the platform tables are additive
// and may not exist yet in an environment (init-db is manual), and a failure
// here must never break the working Hotel journey - it degrades to the honest
// "no attributable route" state instead.

/** Records the platform hotel decision for a legacy trip selection. Never throws. */
export async function recordHotelDecisionSafe(input: HotelDecisionInput): Promise<boolean> {
  try {
    await recordHotelDecision(drizzlePlatformStore, input);
    return true;
  } catch (err) {
    console.error("[hotel-v1] platform decision not recorded:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Trip stay context for a legacy trip, if the trip exists. */
export async function stayForTrip(tripId: string) {
  const trip = tripId ? await getTrip(tripId) : null;
  if (!trip) return null;
  return { destination: trip.destination, checkIn: trip.checkIn, checkOut: trip.checkOut, rooms: trip.rooms, adults: trip.adults, children: trip.children };
}

/** Check IQ: the CTA policy result per verified seller (keyed by supplier slug). Never throws. */
export async function previewCtasForSellers(args: {
  tripId?: string | null;
  sellers: { slug: string; name: string }[];
  propertyId: string;
  propertyName: string;
  stay: { destination: string; checkIn: string; checkOut: string; rooms: number; adults: number; children: number };
}): Promise<Record<string, HotelCta>> {
  const out: Record<string, HotelCta> = {};
  for (const s of args.sellers) {
    try {
      out[s.slug] = await previewHotelCtaForTrip(drizzlePlatformStore, args.tripId ?? null, {
        merchantSlug: s.slug,
        merchantName: s.name,
        propertyId: args.propertyId,
        propertyName: args.propertyName,
        stay: args.stay,
      });
    } catch (err) {
      console.error("[hotel-v1] CTA preview failed:", err instanceof Error ? err.message : err);
      out[s.slug] = inquiryOnlyCta(s.name);
    }
  }
  return out;
}

/** Confirm: the CTA for the trip's hotel decision. Falls back to the honest no-route state. Never throws. */
export async function hotelCtaForTrip(tripId: string, fallbackMerchantName: string): Promise<HotelCta> {
  try {
    const action = await resolveHotelActionForTrip(drizzlePlatformStore, tripId);
    if (action) return action.cta;
  } catch (err) {
    console.error("[hotel-v1] hotel action not resolved:", err instanceof Error ? err.message : err);
  }
  return inquiryOnlyCta(fallbackMerchantName);
}

/**
 * Persists the traveller's explicit hotel (property) choice on the platform.
 * Deliberately NOT fail-safe: a chosen hotel that silently was not saved would
 * break Complete Your Trip and Confirm. Requires the additive platform tables.
 */
export async function recordPropertyChoicePersisted(input: PropertyChoiceInput): Promise<void> {
  await recordPropertyChoice(drizzlePlatformStore, input);
}

/**
 * Legacy compatibility, READ-ONLY and identity-only: the hotelId of the trip's
 * most recent pre-quarantine trip_selections row. Selects that single column
 * only - no seller, price, currency, deep link or verdict is read.
 */
async function legacyHotelIdForTrip(tripId: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ hotelId: schema.tripSelections.hotelId })
      .from(schema.tripSelections)
      .where(eq(schema.tripSelections.tripId, tripId))
      .orderBy(desc(schema.tripSelections.selectedAt))
      .limit(1);
    return rows[0]?.hotelId ?? null;
  } catch (err) {
    console.error("[hotel-v1] legacy hotel identity not readable:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The trip's chosen hotel (no rate/seller needed), or null. A platform
 * property choice wins; otherwise a legacy selection's hotel identity is used
 * (see propertyChoiceWithLegacyFallback). Never throws.
 */
export async function propertyChoiceForTrip(tripId: string): Promise<PropertyChoice | null> {
  let platform: PropertyChoice | null = null;
  try {
    platform = await getPropertyChoice(drizzlePlatformStore, tripId);
  } catch (err) {
    console.error("[hotel-v1] property choice not readable:", err instanceof Error ? err.message : err);
  }
  if (platform) return platform;
  const legacyHotelId = await legacyHotelIdForTrip(tripId);
  return propertyChoiceWithLegacyFallback(platform, legacyHotelId, legacyHotelId ? await stayForTrip(tripId) : null);
}

/** Confirm CTA for a property-only choice: no merchant/route evidence exists, so honestly no booking CTA. */
export function propertyCta(propertyName: string): HotelCta {
  return propertyBookingUnavailableCta(propertyName);
}

/**
 * Idempotent one-time registration of the JOALI merchant and its Awin access
 * route (GitHub Issue #3). Called explicitly from the isolated JOALI entry
 * flow (src/app/actions/joali.ts) at the moment a traveller chooses a JOALI
 * property - never at module import, and never implied by any other Hotel V1
 * path. Thin DB-bound wrapper; the actual (store-injected, directly
 * testable) logic lives in joaliCommercial.ts.
 */
export async function ensureJoaliCommercialSetup(): Promise<void> {
  await ensureJoaliCommercialSetupPure(drizzlePlatformStore);
}

/**
 * Confirm CTA for a JOALI property choice - real Awin booking route, or null
 * for a non-JOALI property so the caller falls back to propertyCta. Thin
 * DB-bound wrapper; see joaliCommercial.ts for the store-injected logic.
 */
export async function joaliCtaForChoice(propertyId: string, stay: PropertyChoiceInput["stay"]): Promise<HotelCta | null> {
  return joaliCtaForChoicePure(drizzlePlatformStore, propertyId, stay);
}
