import type { AccessRoute, Attribution, CommercialRoute, Merchant, TrackingEvidence } from "./types";

// Pure commercial-route construction. No I/O.
//
// Attribution is only ever claimed ("tracked") when concrete TrackingEvidence
// with a valid absolute URL is present. A source URL existing is not evidence
// of attribution, and a generated URL is not assumed valid.

export function isValidHandoffUrl(url: string | null | undefined): url is string {
  if (!url || url === "#") return false;
  try {
    const p = new URL(url); // relative paths (an internal stub route, say) throw
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

export const NO_ATTRIBUTION: Attribution = { status: "none", evidence: null };

export function isValidTrackingEvidence(e: TrackingEvidence | null | undefined): e is TrackingEvidence {
  return !!e && typeof e.method === "string" && e.method.length > 0 && isValidHandoffUrl(e.trackedUrl) && !!e.verifiedAt;
}

// Invariants every CommercialRoute must satisfy. Throws on violation so a
// route claiming tracked attribution without evidence can never be persisted.
export function assertRouteInvariants(
  r: Pick<CommercialRoute, "routeType" | "eligibility" | "destinationUrl" | "attribution">
): void {
  if (r.attribution.status === "tracked" && !isValidTrackingEvidence(r.attribution.evidence)) {
    throw new Error("Route claims tracked attribution without valid tracking evidence");
  }
  if (r.routeType === "affiliate_outbound" && r.eligibility === "eligible") {
    if (r.attribution.status !== "tracked") throw new Error("Eligible affiliate route requires tracked attribution");
    if (r.destinationUrl !== r.attribution.evidence?.trackedUrl) throw new Error("Eligible affiliate route must use the tracked URL");
  }
  if ((r.routeType === "inquiry_only" || r.routeType === "unavailable") && r.destinationUrl !== null) {
    throw new Error(`${r.routeType} route must not carry a destination URL`);
  }
  if ((r.routeType === "direct_outbound" || r.eligibility === "eligible") && !isValidHandoffUrl(r.destinationUrl)) {
    throw new Error("Bookable route requires a valid absolute http(s) destination URL");
  }
  if (r.routeType === "direct_outbound" && r.attribution.status === "tracked") {
    throw new Error("Direct route must not claim tracked attribution");
  }
  if (r.routeType === "affiliate_outbound" && r.eligibility !== "eligible" && r.destinationUrl !== null) {
    throw new Error("Ineligible affiliate route must not carry a destination URL");
  }
}

export interface RouteInputs {
  id: string;
  // Exactly one of these identifies what is being routed.
  selectionId?: string;
  handoffId?: string;
  componentId: string;
  // The merchant URL to route: an offer's sourceUrl, or a handoff's landingUrl.
  sourceUrl: string | null;
  merchant: Merchant;
  // The approved access route chosen for this merchant, or null if none.
  accessRoute: AccessRoute | null;
  trackingEvidence?: TrackingEvidence | null;
  now: Date;
}

export function buildCommercialRoute(i: RouteInputs): CommercialRoute {
  if (!!i.selectionId === !!i.handoffId) throw new Error("Route needs exactly one of selectionId or handoffId");
  const base = {
    id: i.id,
    selectionId: i.selectionId ?? null,
    handoffId: i.handoffId ?? null,
    componentId: i.componentId,
    merchantId: i.merchant.id,
    accessRouteId: i.accessRoute?.id ?? null,
    resolvedAt: i.now,
  };

  let route: CommercialRoute;

  if (!i.accessRoute) {
    // No approved access route: nothing to hand off through, whatever URL exists.
    route = { ...base, routeType: "inquiry_only", eligibility: "unknown", destinationUrl: null, attribution: NO_ATTRIBUTION, reason: "no_access_route" };
  } else if (!isValidHandoffUrl(i.sourceUrl)) {
    route = { ...base, routeType: "unavailable", eligibility: "ineligible", destinationUrl: null, attribution: NO_ATTRIBUTION, reason: "no_booking_url" };
  } else if (i.accessRoute.kind === "direct") {
    route = { ...base, routeType: "direct_outbound", eligibility: "eligible", destinationUrl: i.sourceUrl, attribution: NO_ATTRIBUTION, reason: null };
  } else if (isValidTrackingEvidence(i.trackingEvidence)) {
    route = {
      ...base,
      routeType: "affiliate_outbound",
      eligibility: "eligible",
      destinationUrl: i.trackingEvidence.trackedUrl,
      attribution: { status: "tracked", evidence: i.trackingEvidence },
      reason: null,
    };
  } else {
    // Affiliate access exists but tracking was not evidenced: no CTA URL, no claim.
    route = { ...base, routeType: "affiliate_outbound", eligibility: "ineligible", destinationUrl: null, attribution: NO_ATTRIBUTION, reason: "attribution_unverified" };
  }

  assertRouteInvariants(route);
  return route;
}
