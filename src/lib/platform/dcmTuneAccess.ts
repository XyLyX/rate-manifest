import type { AccessAdapter, AccessOutcome, AccessRequest } from "./accessAdapter";
import { isOpaqueAttributionId } from "./attribution";
import { isValidHandoffUrl } from "./route";

// DCM / TUNE as a GENERIC access mechanism. DCM/TUNE is commercial
// infrastructure, never inventory. Agoda Hotels GCC (offer 252, affiliate
// 172905) is the first merchant it serves, but nothing here is Agoda specific.
//
// CONFIRMED, non-secret contract (shown by the DCM Agoda GCC UI itself):
// https://go.urtrackinglink.com/aff_c?offer_id=252&aff_id=172905 - tracking
// base, `offer_id`, `aff_id`, offer 252 and affiliate 172905 are all
// confirmed; the destination is passed as `url`. Constructing the link needs NO API
// credential; API credentials (if any) are separate, are never read here, and
// are never printed. The base URL is used exactly as configured: any query
// string or tracking macros already on it are preserved verbatim (parameters
// are appended, never re-serialised).
//
// The Sub-ID parameter NAME is not part of the recovered evidence, so none is
// assumed: the Sub-ID is only sent when a name is configured
// (DCM_TUNE_PARAM_SUBID). The opaque attribution id is still recorded on the
// route evidence either way.

export const DCM_TUNE_PROVEN: {
  trackingBaseUrl: string;
  offerId: number;
  affiliateId: number;
  paramNames: { offerId: string; affiliateId: string; destination: string };
} = {
  trackingBaseUrl: "https://go.urtrackinglink.com/aff_c",
  offerId: 252,
  affiliateId: 172905,
  // offer_id / aff_id confirmed by the DCM UI; `url` is the recovered destination parameter.
  paramNames: { offerId: "offer_id", affiliateId: "aff_id", destination: "url" },
};

export interface DcmTuneConfig {
  trackingBaseUrl?: string | null;
  offerId?: number | null;
  affiliateId?: number | null;
  // subId is optional: omitted = no Sub-ID parameter is sent.
  paramNames?: { offerId?: string; affiliateId?: string; destination?: string; subId?: string };
}

export function dcmTuneConfigFromEnv(env: Record<string, string | undefined> = process.env): DcmTuneConfig {
  const num = (v: string | undefined, fallback: number) => (v && Number.isInteger(Number(v)) ? Number(v) : fallback);
  return {
    trackingBaseUrl: env.DCM_TUNE_TRACKING_BASE_URL ?? DCM_TUNE_PROVEN.trackingBaseUrl,
    offerId: num(env.DCM_TUNE_OFFER_ID, DCM_TUNE_PROVEN.offerId),
    affiliateId: num(env.DCM_TUNE_AFFILIATE_ID, DCM_TUNE_PROVEN.affiliateId),
    paramNames: {
      offerId: env.DCM_TUNE_PARAM_OFFER ?? DCM_TUNE_PROVEN.paramNames.offerId,
      affiliateId: env.DCM_TUNE_PARAM_AFFILIATE ?? DCM_TUNE_PROVEN.paramNames.affiliateId,
      destination: env.DCM_TUNE_PARAM_DESTINATION ?? DCM_TUNE_PROVEN.paramNames.destination,
      subId: env.DCM_TUNE_PARAM_SUBID,
    },
  };
}

// Appends query parameters without re-serialising what is already there
// (preserves DCM-added macros such as {transaction_id}).
function appendParams(base: string, params: [string, string][]): string {
  let out = base;
  let sep = out.includes("?") ? (out.endsWith("?") || out.endsWith("&") ? "" : "&") : "?";
  for (const [k, v] of params) {
    out += `${sep}${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    sep = "&";
  }
  return out;
}

export function createDcmTuneAdapter(config: DcmTuneConfig, opts?: { now?: () => Date }): AccessAdapter {
  return {
    id: "dcm-tune",
    accessRouteSlug: "dcm",
    accessRouteName: "DCM/TUNE",
    async issue(req: AccessRequest): Promise<AccessOutcome> {
      const p = config.paramNames ?? {};
      let base: URL;
      try {
        base = new URL(config.trackingBaseUrl ?? "");
      } catch {
        return { ok: false, reason: "not_configured" };
      }
      if (base.protocol !== "https:" || !config.offerId || !config.affiliateId || !p.offerId || !p.affiliateId || !p.destination) {
        return { ok: false, reason: "not_configured" };
      }
      if (!req.expectedIdentity) return { ok: false, reason: "identity_missing" };
      if (req.expectedIdentity.offerId !== config.offerId || req.expectedIdentity.affiliateId !== config.affiliateId) {
        return { ok: false, reason: "identity_mismatch" };
      }
      if (!isValidHandoffUrl(req.destinationUrl)) return { ok: false, reason: "invalid_destination" };
      if (!isOpaqueAttributionId(req.attributionId)) return { ok: false, reason: "invalid_attribution_id" };

      const params: [string, string][] = [
        [p.offerId, String(config.offerId)],
        [p.affiliateId, String(config.affiliateId)],
        [p.destination, req.destinationUrl],
      ];
      if (p.subId) params.push([p.subId, req.attributionId]);
      return {
        ok: true,
        evidence: {
          method: "dcm_tune_tracking_link",
          trackedUrl: appendParams(config.trackingBaseUrl as string, params),
          verifiedAt: (opts?.now?.() ?? new Date()).toISOString(),
          campaignId: null,
          attributionId: req.attributionId,
        },
      };
    },
  };
}
