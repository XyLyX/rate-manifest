import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { CommercialRoute } from "./types";

// Stub URLs produced by the mock adapter — never a valid commercial route.
// The mock adapter constructs "/stub-booking?hotel=...&supplier=...", which
// is an internal Next.js path, not an affiliate or direct booking URL.
// Any relative URL, bare fragment (#), empty string, or non-http(s) absolute
// URL is likewise invalid as a commercial booking destination.
function isStubUrl(url: string | null | undefined): boolean {
  if (!url || url === "#") return true;
  if (url.startsWith("/stub-booking")) return true;
  try {
    const parsed = new URL(url);
    // Only http: and https: are valid commercial booking protocols.
    return parsed.protocol !== "http:" && parsed.protocol !== "https:";
  } catch {
    // URL constructor throws on relative paths and malformed strings.
    // Every relative path (internal Next.js route) lands here.
    return true;
  }
}

/**
 * Resolves the commercial booking route for the most recent deal selection
 * in a trip. This is the Track D entry point — called by the /confirm page
 * (Track F) to determine what booking mechanic, URL, and attribution apply.
 *
 * VERDICT BOUNDARY — read-only. This function never calls runSearch(),
 * scoreOffers(), or recordVerdict(). It reads only tripSelections and
 * suppliers, and carries forward the verdictId that was already written
 * by a prior search. The Verdict is immutable; this function is not allowed
 * to produce a new one.
 *
 * MULTIPLE SELECTIONS — a visitor who re-searches and selects again produces
 * a second tripSelections row for the same tripId (selectDeal() uses plain
 * db.insert() with no onConflictDoNothing — see src/app/actions/trip.ts).
 * This function always resolves the latest row by selectedAt, which
 * represents the customer's most recent deliberate choice.
 *
 * Returns null if no tripSelection exists for this tripId — the caller
 * (Track F) must handle this case (e.g. redirect back to Check IQ).
 */
export async function resolveCommercialRoute(tripId: string): Promise<CommercialRoute | null> {
  // 1. Latest selection for this trip.
  const selections = await db
    .select()
    .from(schema.tripSelections)
    .where(eq(schema.tripSelections.tripId, tripId))
    .orderBy(desc(schema.tripSelections.selectedAt))
    .limit(1);

  const selection = selections[0] ?? null;
  if (!selection) return null;

  const { supplierSlug, supplierName, totalPrice, currency, deepLink, verdictId } = selection;

  // Snapshot fields carried through to every returned route — Track F uses
  // these to render "you selected X at AED Y" without a second DB query.
  const snapshot = {
    supplierSlug_atSelection: supplierSlug,
    priceAtSelection: totalPrice,
    currencyAtSelection: currency,
    verdictId: verdictId ?? null,
  };

  // 2. Stub URL check — evaluated before the supplier DB lookup so that a
  // mock adapter's "/stub-booking?..." URL always produces "unavailable"
  // without touching the suppliers table. This is the primary guard against
  // the mock suppliers (booking, expedia, agoda, hotelscom, tripcom, direct)
  // leaking into a commercial route.
  if (isStubUrl(deepLink)) {
    return {
      routeType: "unavailable",
      eligibility: "ineligible",
      supplierSlug,
      supplierName,
      displayLabel: "Booking unavailable",
      bookingUrl: null,
      attribution: {
        hasAffiliateId: false,
        affiliateId: null,
        trackingParams: {},
        attributionConfirmed: false,
      },
      unavailableReason: "no_booking_url",
      ...snapshot,
    };
  }

  // 3. Supplier capability lookup.
  const supplierRows = await db
    .select()
    .from(schema.suppliers)
    .where(eq(schema.suppliers.slug, supplierSlug))
    .limit(1);

  const supplier = supplierRows[0] ?? null;

  // Unknown slug or explicitly inactive supplier.
  if (!supplier || !supplier.isActive) {
    return {
      routeType: "unavailable",
      eligibility: "ineligible",
      supplierSlug,
      supplierName,
      displayLabel: "Booking unavailable",
      bookingUrl: null,
      attribution: {
        hasAffiliateId: false,
        affiliateId: null,
        trackingParams: {},
        attributionConfirmed: false,
      },
      unavailableReason: "supplier_inactive",
      ...snapshot,
    };
  }

  // 4. Mock integration type — belt-and-suspenders guard. A mock supplier
  // whose deepLink somehow passed the stub check (e.g. a future mock adapter
  // variant) still cannot become a commercial route. integration_type='mock'
  // means simulated prices only; there is no real supplier relationship.
  if (supplier.integrationType === "mock") {
    return {
      routeType: "unavailable",
      eligibility: "ineligible",
      supplierSlug,
      supplierName,
      displayLabel: "Booking unavailable",
      bookingUrl: null,
      attribution: {
        hasAffiliateId: false,
        affiliateId: null,
        trackingParams: {},
        attributionConfirmed: false,
      },
      unavailableReason: "supplier_rates_only",
      ...snapshot,
    };
  }

  // 5. Commercial booking capability check.
  // supportsCommercialBooking defaults to false for every supplier.
  // Being integration_type='api_partner' does NOT imply this capability —
  // StayingAPI (the only api_partner today) supplies outboundUrls for rate
  // verification only; its commercial booking path is unconfirmed.
  // A supplier with supportsCommercialBooking = false returns inquiry_only,
  // not unavailable, because it does provide genuine rate intelligence —
  // Track F can still show the verified rate and a "check availability"
  // prompt, just not a direct booking CTA.
  if (!supplier.supportsCommercialBooking) {
    return {
      routeType: "inquiry_only",
      eligibility: "unknown",
      supplierSlug,
      supplierName,
      displayLabel: "Check availability",
      bookingUrl: null,
      attribution: {
        hasAffiliateId: false,
        affiliateId: null,
        trackingParams: {},
        attributionConfirmed: false,
      },
      ...snapshot,
    };
  }

  // 6. Affiliate attribution resolution.
  // Only reached for suppliers with supportsCommercialBooking = true —
  // none today. This is the wiring for a future real affiliate partner.
  if (supplier.hasAffiliateProgram) {
    const envKey = supplier.affiliateIdEnvKey ?? null;
    const affiliateId = envKey ? (process.env[envKey] ?? null) : null;

    if (!affiliateId) {
      // Affiliate programme is declared but the ID is not available in env.
      // The booking URL exists but attribution cannot be confirmed — route
      // type is still affiliate_outbound (the mechanic), but eligibility is
      // ineligible (the ID is missing).
      return {
        routeType: "affiliate_outbound",
        eligibility: "ineligible",
        supplierSlug,
        supplierName,
        displayLabel: `Book on ${supplierName}`,
        bookingUrl: deepLink,
        attribution: {
          hasAffiliateId: false,
          affiliateId: null,
          trackingParams: {},
          attributionConfirmed: false,
        },
        unavailableReason: "affiliate_unavailable",
        ...snapshot,
      };
    }

    return {
      routeType: "affiliate_outbound",
      eligibility: "eligible",
      supplierSlug,
      supplierName,
      displayLabel: `Book on ${supplierName}`,
      bookingUrl: deepLink,
      attribution: {
        hasAffiliateId: true,
        affiliateId,
        trackingParams: {},
        attributionConfirmed: true,
      },
      ...snapshot,
    };
  }

  // 7. Direct outbound — supportsCommercialBooking = true, no affiliate
  // programme. The deepLink is the booking URL as-is (already validated as
  // an absolute https URL by the stub check above).
  return {
    routeType: "direct_outbound",
    eligibility: "eligible",
    supplierSlug,
    supplierName,
    displayLabel: `Book on ${supplierName}`,
    bookingUrl: deepLink,
    attribution: {
      hasAffiliateId: false,
      affiliateId: null,
      trackingParams: {},
      attributionConfirmed: false,
    },
    ...snapshot,
  };
}
