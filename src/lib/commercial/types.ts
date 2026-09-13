// Track D: Commercial Router — type contract.
// See claude/phase1.1-architecture-decisions.md and the Track D implementation
// brief. This file is the single source of truth for the CommercialRoute
// shape — router.ts produces it, /confirm (Track F) consumes it.
//
// RouteType reflects the actual booking mechanic available for this selection:
//   "affiliate_outbound"  — booking goes through a real affiliate link with a
//                           tracked affiliate ID (hasAffiliateId must be true)
//   "direct_outbound"     — booking goes directly to the supplier (api_partner
//                           with supportsCommercialBooking = true, no affiliate
//                           programme)
//   "inquiry_only"        — supplier provides rates/rate-verification but has no
//                           confirmed commercial booking path
//                           (supportsCommercialBooking = false on a non-mock
//                           integration — StayingAPI today)
//   "unavailable"         — no valid booking path exists (mock stub URL, inactive
//                           supplier, property not mappable, etc.).
//                           unavailableReason is always set when
//                           routeType = "unavailable".
//
// RouteEligibility is the router's assessment of whether this particular
// selection can proceed to a real booking right now:
//   "eligible"    — all required capability flags are true and a valid URL exists
//   "ineligible"  — required flags are true but something is missing (e.g. no
//                   affiliate ID in env) or the route is definitively blocked
//   "unknown"     — capability is not confirmed (inquiry_only lands here)

export type RouteType = "affiliate_outbound" | "direct_outbound" | "inquiry_only" | "unavailable";
export type RouteEligibility = "eligible" | "ineligible" | "unknown";

export interface CommercialRoute {
  routeType: RouteType;
  eligibility: RouteEligibility;
  supplierSlug: string;
  supplierName: string;
  // Human-readable label for the booking CTA — Track F reads this to label
  // its primary action button rather than constructing its own string.
  displayLabel: string;
  // The URL Track F should send the visitor to. Null when routeType is
  // "inquiry_only" or "unavailable" — Track F must never render a booking
  // button with a null URL.
  bookingUrl: string | null;
  attribution: {
    hasAffiliateId: boolean;
    affiliateId: string | null;
    // Any tracking params appended to the booking URL (e.g. campaign codes).
    // Empty object when none; never null.
    trackingParams: Record<string, string>;
    // True only when a real affiliate ID was resolved from an env var at
    // route-resolution time. False for every supplier today.
    attributionConfirmed: boolean;
  };
  // The verdictId that was showing when the customer selected this deal —
  // carried forward from tripSelections.verdictId for Track F's "why we
  // recommended this" panel. Null if no verdict existed (direct Check IQ
  // visit that never ran a search).
  verdictId: string | null;
  // Snapshot of the selection — preserved from tripSelections so Track F
  // can display "you selected X at AED Y" without re-querying.
  supplierSlug_atSelection: string;
  priceAtSelection: number;
  currencyAtSelection: string;
  // Only set when routeType = "unavailable". Describes why no route exists:
  //   "supplier_rates_only"   — mock supplier; only rate data, never a real URL
  //   "no_booking_url"        — deepLink is missing, a stub, or unparseable as
  //                             an absolute http/https URL
  //   "property_not_mappable" — hotel cannot be resolved to a bookable supplier
  //                             page (reserved for future use)
  //   "affiliate_unavailable" — hasAffiliateProgram = true but affiliateIdEnvKey
  //                             is unset or the env var is empty
  //   "supplier_inactive"     — supplier row has isActive = false, or slug is
  //                             not found in the suppliers table
  unavailableReason?:
    | "supplier_rates_only"
    | "no_booking_url"
    | "property_not_mappable"
    | "affiliate_unavailable"
    | "supplier_inactive";
}
