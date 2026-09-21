import type { AccessAdapter, AccessOutcome, AccessRequest } from "./accessAdapter";
import { isOpaqueAttributionId } from "./attribution";
import { isValidHandoffUrl } from "./route";

// Cuelinks LinkKit as a GENERIC access mechanism (any Cuelinks merchant).
//
// Proven contract (manually proven, non-secret): HTTPS redirect base
// https://linksredirect.com/, CID 319721, source=linkkit, the merchant
// destination as an encoded `url`, and a publisher-controlled `subid`. The
// base is application configuration with the proven value as default
// (CUELINKS_LINKKIT_BASE_URL may override it). CID 319721 is the LinkKit
// publisher routing identity; it is NOT a merchant campaign id (a merchant's
// campaign, e.g. Anantara 13297, travels separately in the register/evidence).
// An explicitly empty or non-https config still refuses.
//
// Nothing here is merchant specific. Anantara, Marco Polo, Trip.com, Air
// India, ItaliaRail all go through this one code path.

export const LINKKIT_PROVEN_CID = 319721;
export const LINKKIT_PROVEN_BASE_URL = "https://linksredirect.com/";

export interface LinkKitConfig {
  baseUrl?: string | null;
  cid?: number | null;
}

export function linkKitConfigFromEnv(env: Record<string, string | undefined> = process.env): LinkKitConfig {
  const cid = env.CUELINKS_LINKKIT_CID ? Number(env.CUELINKS_LINKKIT_CID) : LINKKIT_PROVEN_CID;
  return { baseUrl: env.CUELINKS_LINKKIT_BASE_URL ?? LINKKIT_PROVEN_BASE_URL, cid: Number.isInteger(cid) && cid > 0 ? cid : null };
}

export function createLinkKitAdapter(config: LinkKitConfig, opts?: { now?: () => Date }): AccessAdapter {
  return {
    id: "cuelinks-linkkit",
    accessRouteSlug: "cuelinks",
    accessRouteName: "Cuelinks",
    async issue(req: AccessRequest): Promise<AccessOutcome> {
      let base: URL;
      try {
        base = new URL(config.baseUrl ?? "");
      } catch {
        return { ok: false, reason: "not_configured" };
      }
      if (base.protocol !== "https:" || !config.cid) return { ok: false, reason: "not_configured" };
      if (!isValidHandoffUrl(req.destinationUrl)) return { ok: false, reason: "invalid_destination" };
      if (!isOpaqueAttributionId(req.attributionId)) return { ok: false, reason: "invalid_attribution_id" };

      const url = new URL(base.toString());
      url.searchParams.set("cid", String(config.cid));
      url.searchParams.set("source", "linkkit");
      url.searchParams.set("url", req.destinationUrl); // encoded by URLSearchParams
      url.searchParams.set("subid", req.attributionId);
      return {
        ok: true,
        evidence: {
          // A constructed redirect for a merchant the register lists as proven; not a per-link network confirmation.
          method: "cuelinks_linkkit_redirect",
          trackedUrl: url.toString(),
          verifiedAt: (opts?.now?.() ?? new Date()).toISOString(),
          campaignId: req.expectedCampaignId ?? null,
          attributionId: req.attributionId,
        },
      };
    },
  };
}
