import type { TrackingEvidence } from "./types";

// Generic commercial ACCESS adapter contract.
//
//   product/inventory source != merchant != access network != commercial route
//                            != verification source
//
// An access adapter only turns "merchant destination URL + opaque attribution
// id" into tracking evidence for ONE network mechanism. It knows nothing about
// towers, merchants, inventory, prices or the decision tournament, and it
// cannot decide eligibility: the handoff resolver decides that from the
// merchant register. It never fabricates: if it is not fully configured or
// the input is invalid it refuses with a reason and returns no URL.

export interface AccessRequest {
  // The merchant destination exactly as a verified builder/landing evidence produced it.
  destinationUrl: string;
  // Opaque Rate Manifest attribution id (see attribution.ts). Used as the publisher Sub-ID.
  attributionId: string;
  // Merchant campaign the register expects (informational for redirect mechanisms).
  expectedCampaignId?: number | null;
  // Commercial identity the register expects (DCM/TUNE offer + affiliate ids).
  expectedIdentity?: { offerId: number; affiliateId: number };
}

export type AccessRefusal =
  | "not_configured"
  | "invalid_destination"
  | "invalid_attribution_id"
  | "identity_mismatch"
  | "identity_missing";

export type AccessOutcome = { ok: true; evidence: TrackingEvidence } | { ok: false; reason: AccessRefusal };

export interface AccessAdapter {
  // Mechanism id, for provenance/diagnostics only.
  id: string;
  // The platform access-route slug this adapter serves (e.g. "cuelinks", "dcm").
  accessRouteSlug: string;
  accessRouteName: string;
  issue(request: AccessRequest): Promise<AccessOutcome>;
}
