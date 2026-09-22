import type { AccessAdapter, AccessOutcome, AccessRequest } from "./accessAdapter";
import { isOpaqueAttributionId } from "./attribution";
import { isValidHandoffUrl } from "./route";

// Awin as a GENERIC access mechanism (pure URL construction, no API call -
// same shape as DCM/TUNE, not Cuelinks' API-verified conversion). JOALI
// (GitHub Issue #3) is the first merchant it serves, but nothing here is
// JOALI specific.
//
// CONFIRMED contract (owner tested both JOALI property redirects
// successfully): https://www.awin1.com/cread.php?awinmid=125626&awinaffid=
// 3076059&ued=<destination, URL-encoded once>. awinmid is the Awin
// advertiser id, awinaffid the Awin publisher id, ued the destination.
// No clickref/Sub-ID parameter is sent - the confirmed redirect test did
// not use one, so none is invented here. The opaque attribution id is
// still recorded on the returned evidence for Rate Manifest's own audit
// trail, exactly as dcmTuneAccess.ts does when no Sub-ID parameter name is
// configured (see that file's own comment).

export const AWIN_PROVEN: { trackingBaseUrl: string; advertiserId: number; publisherId: number } = {
  trackingBaseUrl: "https://www.awin1.com/cread.php",
  advertiserId: 125626,
  publisherId: 3076059,
};

export interface AwinConfig {
  trackingBaseUrl?: string | null;
  advertiserId?: number | null;
  publisherId?: number | null;
}

export function awinConfigFromEnv(env: Record<string, string | undefined> = process.env): AwinConfig {
  const num = (v: string | undefined, fallback: number) => (v && Number.isInteger(Number(v)) ? Number(v) : fallback);
  return {
    trackingBaseUrl: env.AWIN_TRACKING_BASE_URL ?? AWIN_PROVEN.trackingBaseUrl,
    advertiserId: num(env.AWIN_ADVERTISER_ID, AWIN_PROVEN.advertiserId),
    publisherId: num(env.AWIN_PUBLISHER_ID, AWIN_PROVEN.publisherId),
  };
}

export function createAwinAdapter(config: AwinConfig): AccessAdapter {
  return {
    id: "awin",
    accessRouteSlug: "awin",
    accessRouteName: "Awin",
    async issue(req: AccessRequest): Promise<AccessOutcome> {
      let base: URL;
      try {
        base = new URL(config.trackingBaseUrl ?? "");
      } catch {
        return { ok: false, reason: "not_configured" };
      }
      if (base.protocol !== "https:" || !config.advertiserId || !config.publisherId) {
        return { ok: false, reason: "not_configured" };
      }
      // expectedIdentity reuses AccessRequest's generic {offerId, affiliateId}
      // shape (see accessAdapter.ts) to carry Awin's own
      // {advertiserId, publisherId} pair - the field names are DCM/TUNE-
      // flavoured but the contract itself is network-agnostic.
      if (!req.expectedIdentity) return { ok: false, reason: "identity_missing" };
      if (req.expectedIdentity.offerId !== config.advertiserId || req.expectedIdentity.affiliateId !== config.publisherId) {
        return { ok: false, reason: "identity_mismatch" };
      }
      if (!isValidHandoffUrl(req.destinationUrl)) return { ok: false, reason: "invalid_destination" };
      if (!isOpaqueAttributionId(req.attributionId)) return { ok: false, reason: "invalid_attribution_id" };

      const trackedUrl =
        `${config.trackingBaseUrl}?awinmid=${config.advertiserId}&awinaffid=${config.publisherId}` +
        `&ued=${encodeURIComponent(req.destinationUrl)}`;

      return {
        ok: true,
        evidence: {
          method: "awin_cread_link",
          trackedUrl,
          verifiedAt: new Date().toISOString(),
          campaignId: null,
          attributionId: req.attributionId,
        },
      };
    },
  };
}
