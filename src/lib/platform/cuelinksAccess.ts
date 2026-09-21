import { convertCuelinksUrl, type CuelinksConversionResult } from "../commercial/cuelinks";
import { isValidHandoffUrl } from "./route";
import type { TrackingEvidence } from "./types";

// Cuelinks as an ACCESS ROUTE for the shared platform. Reuses the existing,
// tested convertCuelinksUrl primitive unchanged; this only turns its result
// into platform TrackingEvidence under one rule:
//
//   `affiliated === true` is the only signal of monetisability.
//   A tracking_url on its own is never evidence.
//
// The merchant stays a merchant (a separate record); Cuelinks stays an
// access_route; the resulting evidence becomes the route's attribution.

export type CuelinksEvidenceOutcome =
  | { evidence: TrackingEvidence; reason: "ok"; campaignId: number | null; campaignName: string | null }
  | {
      evidence: null;
      reason: "not_affiliated" | "no_tracking_url" | "campaign_mismatch" | "conversion_failed";
      campaignId: number | null;
      campaignName: string | null;
      error?: string;
    };

export async function cuelinksEvidenceFor(
  landingUrl: string,
  opts?: {
    // Injectable for tests; defaults to the real primitive.
    convert?: (url: string) => Promise<CuelinksConversionResult>;
    // If set, the converting campaign must match (guards against a different campaign claiming the route).
    expectedCampaignId?: number | null;
    now?: () => Date;
  }
): Promise<CuelinksEvidenceOutcome> {
  const convert = opts?.convert ?? convertCuelinksUrl;
  let result: CuelinksConversionResult;
  try {
    result = await convert(landingUrl);
  } catch (err) {
    return { evidence: null, reason: "conversion_failed", campaignId: null, campaignName: null, error: err instanceof Error ? err.message : String(err) };
  }

  const detail = { campaignId: result.campaignId, campaignName: result.campaignName };
  if (result.affiliated !== true) return { evidence: null, reason: "not_affiliated", ...detail };
  if (!isValidHandoffUrl(result.trackingUrl)) return { evidence: null, reason: "no_tracking_url", ...detail };
  if (opts?.expectedCampaignId != null && result.campaignId !== opts.expectedCampaignId) {
    return { evidence: null, reason: "campaign_mismatch", ...detail };
  }

  return {
    evidence: {
      method: "cuelinks_v3_convert",
      trackedUrl: result.trackingUrl,
      verifiedAt: (opts?.now?.() ?? new Date()).toISOString(),
      campaignId: result.campaignId,
    },
    reason: "ok",
    ...detail,
  };
}
