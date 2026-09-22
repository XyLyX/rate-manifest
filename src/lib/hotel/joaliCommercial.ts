import { ensureAccessRoute, ensureMerchant, linkMerchantToAccessRoute, type PlatformStore } from "../platform/service";
import type { AccessRoute, HotelInput, Merchant } from "../platform/types";
import { inquiryOnlyCta, previewHotelCta, type HotelCta } from "./commercial";
import { JOALI_VERIFIED_PROPERTIES } from "./joaliDestination";

// JOALI (GitHub Issue #3) commercial wiring, store-injected and DB-free - same
// split as decision.ts vs journey.ts: this file is the pure logic, directly
// testable with MemoryPlatformStore; journey.ts supplies the real
// drizzlePlatformStore for production use. Kept out of journey.ts itself so
// importing it (e.g. from a test) never pulls in the live @/db/client
// connection that journey.ts's other DB-wiring functions require at import
// time.

// Postgres' own unique_violation SQLSTATE - what the `pg` driver attaches to
// a real constraint violation (merchants.slug / access_routes.slug /
// merchant_access_routes' (merchant_id, access_route_id) pair - see
// src/db/schema.ts), and what memoryStore.ts's own duplicate-insert errors
// carry too, so this check behaves identically in tests and production.
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION;
}

/**
 * ensureMerchant/ensureAccessRoute/linkMerchantToAccessRoute (service.ts)
 * are each a plain check-then-insert with no database-level upsert, so two
 * genuinely simultaneous first-time calls can both pass the "not found"
 * read and both attempt an insert. The loser's insert hits the real unique
 * constraint (schema.ts) instead of corrupting data or creating a duplicate
 * row; this catches exactly that (and only that) error and re-reads the row
 * the winner already committed, rather than letting it surface as a failed
 * request. Any other error still propagates unchanged. Left generic/local to
 * this file rather than folded into service.ts's shared ensure* helpers,
 * which every other existing caller already relies on behaving exactly as
 * before.
 */
async function raceSafe<T>(insert: () => Promise<T>, reselect: () => Promise<T | null>): Promise<T> {
  try {
    return await insert();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await reselect();
    if (existing) return existing;
    throw err; // reselect found nothing - genuinely unexpected, surface the original error
  }
}

/**
 * Idempotent, concurrency-safe one-time registration of the JOALI merchant
 * and its Awin access route. Called explicitly from the isolated JOALI entry
 * flow at the moment a traveller chooses a JOALI property - never at module
 * import, and never implied by any other Hotel V1 path. Safe to call on
 * every JOALI selection, including two that race: see raceSafe above. Never
 * modifies an existing merchant, access route or link - only ever inserts a
 * fresh row by exact slug when none exists, or reads back an existing one;
 * nothing here can touch an unrelated merchant or access route.
 */
export async function ensureJoaliCommercialSetup(store: PlatformStore): Promise<void> {
  const merchant: Merchant = await raceSafe(
    () => ensureMerchant(store, { slug: "joali", name: "JOALI" }),
    () => store.getMerchantBySlug("joali")
  );
  const awin: AccessRoute = await raceSafe(
    () => ensureAccessRoute(store, { slug: "awin", name: "Awin", kind: "affiliate_network" }),
    () => store.getAccessRouteBySlug("awin")
  );
  await raceSafe(
    async () => {
      await linkMerchantToAccessRoute(store, { merchantId: merchant.id, accessRouteId: awin.id, status: "approved" });
      return true;
    },
    async () => {
      const links = await store.listMerchantAccessLinks(merchant.id);
      return links.some((l) => l.accessRouteId === awin.id) ? true : null;
    }
  );
}

/**
 * The real Awin booking CTA for a JOALI property choice, resolved via
 * previewHotelCta (no priced Check IQ decision required or expected - JOALI
 * carries no rate/availability data). Returns null for any propertyId that
 * isn't one of the two verified JOALI properties, so a caller can cleanly
 * fall back to its own default property CTA. Never throws.
 */
export async function joaliCtaForChoice(
  store: PlatformStore,
  propertyId: string,
  stay: Omit<HotelInput, "propertyId">
): Promise<HotelCta | null> {
  const property = JOALI_VERIFIED_PROPERTIES[propertyId];
  if (!property) return null;
  try {
    return await previewHotelCta(store, {
      merchantSlug: "joali",
      merchantName: property.name,
      propertyId,
      propertyName: property.name,
      stay,
    });
  } catch (err) {
    console.error("[joali] CTA resolution failed:", err instanceof Error ? err.message : err);
    return inquiryOnlyCta(property.name);
  }
}
