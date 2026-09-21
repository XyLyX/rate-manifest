import { cuelinksEvidenceFor } from "../platform/cuelinksAccess";
import { assertRouteInvariants, buildCommercialRoute, isValidHandoffUrl } from "../platform/route";
import { pickAccessRoute, type PlatformStore } from "../platform/service";
import type { CommercialRoute, HotelInput, Merchant, TrackingEvidence } from "../platform/types";
import type { CuelinksConversionResult } from "../commercial/cuelinks";
import { getHotelDecision, type HotelDecision } from "./decision";
import { newId } from "../id";

// Hotel V1 commercial action: ONE policy used by Check IQ (preview, per
// seller) and Confirm (persisted, for the trip's decision).
//
//   merchant -> approved access route -> verified contextual destination ->
//   attribution evidence -> eligible route -> CTA
//
// A rate-verification URL/rate never becomes a route by itself. No CTA is
// enabled unless the route is BOTH eligible AND has a valid destination URL.

export interface HotelRouteContext {
  merchantSlug: string;
  merchantName: string;
  propertyId: string;
  propertyName?: string | null;
  stay: Omit<HotelInput, "propertyId">;
}

export interface HotelRouteBuild {
  url: string;
  // Campaign the source evidence says should confirm this route (optional).
  expectedCampaignId?: number | null;
}

// Builds a CONTEXTUAL merchant destination (property + dates + party) from an
// already-proven builder/path. Returns null when none is known.
export type HotelRouteBuilder = (ctx: HotelRouteContext) => HotelRouteBuild | null;

// Production registry of verified contextual builders. INTENTIONALLY EMPTY in
// H1: the generic merchant landing URLs from the Phase 2 proof are fixture
// evidence, not production deeplinks. H2 adds a builder here only where a
// contextual builder is separately verified. Until then every merchant
// resolves honestly to "no attributable route".
export const HOTEL_ROUTE_BUILDERS: Record<string, HotelRouteBuilder> = {};

export interface HotelCta {
  enabled: boolean;
  label: string;
  url: string | null; // non-null only when enabled
  routeType: CommercialRoute["routeType"];
  eligibility: CommercialRoute["eligibility"];
  reason: CommercialRoute["reason"];
  note: string; // customer-facing, honest explanation
}

/** THE policy: a booking CTA exists only for an eligible bookable route with a valid URL. */
export function ctaFromRoute(route: CommercialRoute, merchantName: string): HotelCta {
  const bookable = route.routeType === "affiliate_outbound" || route.routeType === "direct_outbound";
  const enabled = bookable && route.eligibility === "eligible" && isValidHandoffUrl(route.destinationUrl);
  const base = { routeType: route.routeType, eligibility: route.eligibility, reason: route.reason };

  if (enabled) {
    return {
      ...base,
      enabled: true,
      label: `Book on ${merchantName}`,
      url: route.destinationUrl,
      note:
        route.routeType === "affiliate_outbound"
          ? `RateManifest doesn't process payment or hold your reservation — this takes you to ${merchantName} to complete the booking. RateManifest may earn a commission.`
          : `RateManifest doesn't process payment or hold your reservation — this takes you to ${merchantName} to complete the booking. No affiliate link is involved.`,
    };
  }
  if (route.routeType === "inquiry_only") {
    return {
      ...base,
      enabled: false,
      label: `Check availability at ${merchantName}`,
      url: null,
      note: `RateManifest verified the rate at ${merchantName}, but has no attributable booking route for it yet. Visit ${merchantName}'s website directly and use the details above.`,
    };
  }
  return {
    ...base,
    enabled: false,
    label: "Booking route unavailable",
    url: null,
    note:
      route.reason === "attribution_unverified"
        ? `A booking route via ${merchantName} couldn't be confirmed as attributable right now. Visit ${merchantName}'s website directly.`
        : `A verified booking destination for this rate isn't available. Visit ${merchantName}'s website directly.`,
  };
}

export interface HotelCommercialOpts {
  builders?: Record<string, HotelRouteBuilder>;
  // Injectable Cuelinks conversion (tests); defaults to the real primitive.
  convert?: (url: string) => Promise<CuelinksConversionResult>;
}

function unregistered(ctx: HotelRouteContext): Merchant {
  return { id: `unregistered:${ctx.merchantSlug}`, slug: ctx.merchantSlug, name: ctx.merchantName, createdAt: new Date(0) };
}

/** Evaluates (does not persist) the commercial route for a merchant + property + stay. */
async function evaluateHotelRoute(
  store: PlatformStore,
  ctx: HotelRouteContext,
  subject: { selectionId: string } | { handoffId: string },
  componentId: string,
  opts?: HotelCommercialOpts
): Promise<CommercialRoute> {
  const registered = await store.getMerchantBySlug(ctx.merchantSlug);
  const merchant = registered ?? unregistered(ctx);
  const accessRoute = registered ? await pickAccessRoute(store, registered.id) : null;
  const build = accessRoute ? ((opts?.builders ?? HOTEL_ROUTE_BUILDERS)[ctx.merchantSlug]?.(ctx) ?? null) : null;

  let evidence: TrackingEvidence | null = null;
  if (accessRoute && build && accessRoute.kind === "affiliate_network" && accessRoute.slug === "cuelinks") {
    evidence = (await cuelinksEvidenceFor(build.url, { convert: opts?.convert, expectedCampaignId: build.expectedCampaignId })).evidence;
  }
  // Other network kinds have no evidence producer yet: they stay honestly ineligible.

  const route = buildCommercialRoute({
    id: newId(),
    ...subject,
    componentId,
    sourceUrl: build?.url ?? null,
    merchant,
    accessRoute,
    trackingEvidence: evidence,
    now: new Date(),
  });
  assertRouteInvariants(route);
  return route;
}

/** Check IQ: the CTA policy result for one verified seller row. Not persisted. */
export async function previewHotelCta(store: PlatformStore, ctx: HotelRouteContext, opts?: HotelCommercialOpts): Promise<HotelCta> {
  const route = await evaluateHotelRoute(store, ctx, { handoffId: "preview" }, "preview", opts);
  return ctaFromRoute(route, ctx.merchantName);
}

export interface HotelCommercialAction {
  decision: HotelDecision;
  route: CommercialRoute;
  cta: HotelCta;
}

export function routeContextFromDecision(d: HotelDecision): HotelRouteContext {
  const { propertyId, ...stay } = d.component.input;
  return {
    merchantSlug: d.merchant.slug,
    merchantName: d.merchant.name,
    propertyId: propertyId ?? String(d.offer.payload.propertyId ?? ""),
    propertyName: (d.offer.payload.propertyName as string | null | undefined) ?? null,
    stay,
  };
}

/**
 * Can a previously persisted route be reused for this decision without
 * calling the access network again? Only an ELIGIBLE, bookable route that
 *  - belongs to the decision's current selection and was resolved AFTER that
 *    selection was made (re-selecting, or changing the stay and re-selecting,
 *    updates selectedAt, so an older route is never reused),
 *  - is for the same merchant and the merchant's currently approved access
 *    route (a revoked/changed link invalidates it),
 *  - still satisfies the route invariants and has a valid destination.
 * Ineligible / unavailable / inquiry outcomes are never reused, so a
 * transient attribution failure or a newly added builder is retried.
 * No TTL: route age is not judged here (see H2A report).
 */
async function reusableRoute(store: PlatformStore, d: HotelDecision, latest: CommercialRoute | null): Promise<CommercialRoute | null> {
  if (!latest) return null;
  if (latest.selectionId !== d.selection.id) return null;
  if (latest.resolvedAt.getTime() < d.selection.selectedAt.getTime()) return null;
  if (latest.eligibility !== "eligible" || !(latest.routeType === "affiliate_outbound" || latest.routeType === "direct_outbound")) return null;
  if (latest.merchantId !== d.merchant.id) return null;
  const current = await pickAccessRoute(store, d.merchant.id);
  if (!current || latest.accessRouteId !== current.id) return null;
  if (!isValidHandoffUrl(latest.destinationUrl)) return null;
  try {
    assertRouteInvariants(latest);
  } catch {
    return null;
  }
  return latest;
}

// Same outcome = same non-bookable state; used only to avoid appending an
// identical row on every page view.
function sameOutcome(a: CommercialRoute | null, b: CommercialRoute): boolean {
  return (
    !!a &&
    a.selectionId === b.selectionId &&
    a.routeType === b.routeType &&
    a.eligibility === b.eligibility &&
    a.reason === b.reason &&
    a.accessRouteId === b.accessRouteId &&
    a.destinationUrl === b.destinationUrl
  );
}

/**
 * Confirm (and Check IQ, for the already-selected seller): resolves the route
 * for the trip's hotel decision, reusing a persisted eligible route where safe
 * (no second access-network call), otherwise resolving and persisting.
 * null if there is no current decision.
 */
export async function resolveHotelActionForTrip(store: PlatformStore, tripId: string, opts?: HotelCommercialOpts): Promise<HotelCommercialAction | null> {
  const decision = await getHotelDecision(store, tripId);
  if (!decision) return null;

  const latest = await store.getLatestRouteForComponent(decision.component.id);
  const reused = await reusableRoute(store, decision, latest);
  if (reused) return { decision, route: reused, cta: ctaFromRoute(reused, decision.merchant.name) };

  const route = await evaluateHotelRoute(store, routeContextFromDecision(decision), { selectionId: decision.selection.id }, decision.component.id, opts);
  const bookable = route.eligibility === "eligible";
  // Persist every eligible result (so it can be reused) but do not append
  // duplicate non-bookable rows on each view.
  if (bookable || !sameOutcome(latest, route)) await store.insertRoute(route);
  return { decision, route, cta: ctaFromRoute(route, decision.merchant.name) };
}

function sameContext(a: HotelRouteContext, b: HotelRouteContext): boolean {
  return (
    a.merchantSlug === b.merchantSlug &&
    a.propertyId === b.propertyId &&
    a.stay.destination === b.stay.destination &&
    a.stay.checkIn === b.stay.checkIn &&
    a.stay.checkOut === b.stay.checkOut &&
    a.stay.rooms === b.stay.rooms &&
    a.stay.adults === b.stay.adults &&
    a.stay.children === b.stay.children
  );
}

/**
 * Check IQ CTA for one seller. If the trip already has a hotel decision for
 * exactly this merchant + property + stay (e.g. returning from Confirm), use
 * the decision's route (reused if valid); otherwise preview. Same policy either way.
 */
export async function previewHotelCtaForTrip(
  store: PlatformStore,
  tripId: string | null,
  ctx: HotelRouteContext,
  opts?: HotelCommercialOpts
): Promise<HotelCta> {
  const decision = tripId ? await getHotelDecision(store, tripId) : null;
  if (decision && sameContext(routeContextFromDecision(decision), ctx)) {
    const action = await resolveHotelActionForTrip(store, tripId as string, opts);
    if (action) return action.cta;
  }
  return previewHotelCta(store, ctx, opts);
}

/** Honest fallback when the platform layer is unavailable: no route, same CTA policy (never enabled). */
export function inquiryOnlyCta(merchantName: string): HotelCta {
  const route = buildCommercialRoute({
    id: "fallback",
    handoffId: "fallback",
    componentId: "fallback",
    sourceUrl: null,
    merchant: { id: "fallback", slug: "fallback", name: merchantName, createdAt: new Date(0) },
    accessRoute: null,
    now: new Date(),
  });
  return ctaFromRoute(route, merchantName);
}

/**
 * CTA state for a hotel PROPERTY choice with no seller/rate (StayingAPI
 * quarantine). There is no merchant or access-route evidence for the property,
 * so there is honestly no booking route: never enabled, no URL.
 */
export function propertyBookingUnavailableCta(propertyName: string): HotelCta {
  return {
    enabled: false,
    label: "Booking route unavailable",
    url: null,
    routeType: "inquiry_only",
    eligibility: "unknown",
    reason: "no_access_route",
    note: `RateManifest has no verified booking route for ${propertyName} yet. You can look for it directly with the hotel or on the booking site you prefer.`,
  };
}
