import { ensureAccessRoute, ensureMerchant, linkMerchantToAccessRoute, type PlatformStore } from "./service";
import type { AccessRoute, Merchant, TowerKind } from "./types";

// Phase 2 proof routes: ONE already-proven commercial route per tower, taken
// only from the Source Research & Implementation Register (2026-09-21,
// section "Proven Cuelinks / contextual handoff ledger"). No new research.
//
// These are COMMERCIAL routes, not inventory. ingestibleInventory is false for
// every tower on purpose - the Register records the inventory gaps as open and
// this file preserves them rather than resolving or hiding them.
//
// TEST / FIXTURE EVIDENCE ONLY - not authorised production deeplinks, and
// never to be wired into Hotel V1 (or any) production behaviour.
// landingUrl is a GENERIC merchant landing page, not a contextual deeplink.
// The Register records that contextual handoffs were proven manually but does
// not record URL templates, so none are invented here; a verified contextual
// URL builder per merchant is future work. Cuelinks conversion of these URLs
// is what establishes (or refuses) attribution at run time - a configured
// campaign id below is only what the Register says to expect.

export interface ProofRoute {
  tower: TowerKind;
  merchant: { slug: string; name: string };
  accessRoute: { slug: string; name: string; kind: "affiliate_network" };
  // Campaign the Register says returned affiliated:true; null = not recorded.
  expectedCampaignId: number | null;
  landingUrl: string;
  registerEvidence: string;
  ingestibleInventory: false;
  inventoryGap: string;
}

const CUELINKS = { slug: "cuelinks", name: "Cuelinks", kind: "affiliate_network" } as const;

export const PROOF_ROUTES: Record<TowerKind, ProofRoute> = {
  hotel: {
    tower: "hotel",
    merchant: { slug: "anantara", name: "Anantara" },
    accessRoute: CUELINKS,
    expectedCampaignId: 13297,
    landingUrl: "https://www.anantara.com/",
    registerEvidence: "Anantara, merchant via Cuelinks campaign 13297; affiliated:true path proven.",
    ingestibleInventory: false,
    inventoryGap: "No finalized general hotel discovery source meeting the inventory proof bar (StayingAPI excluded by design; reserved for Check IQ).",
  },
  flight: {
    tower: "flight",
    merchant: { slug: "air-india", name: "Air India" },
    accessRoute: CUELINKS,
    expectedCampaignId: 5622,
    landingUrl: "https://www.airindia.com/",
    registerEvidence: "Air India, merchant via Cuelinks campaign 5622 affiliated:true; handoff proven.",
    ingestibleInventory: false,
    inventoryGap: "Commercial routes proven; ingestible flight comparison source unconfirmed.",
  },
  rail: {
    tower: "rail",
    merchant: { slug: "italiarail", name: "ItaliaRail" },
    accessRoute: CUELINKS,
    expectedCampaignId: 3878,
    landingUrl: "https://www.italiarail.com/",
    registerEvidence: "ItaliaRail, Cuelinks campaign 3878 affiliated:true; commercial rail route proven.",
    ingestibleInventory: false,
    inventoryGap: "Commercial routes proven; ingestible rail comparison source unconfirmed.",
  },
  cruise: {
    tower: "cruise",
    merchant: { slug: "trip-com-cruises", name: "Trip.com Cruises" },
    accessRoute: CUELINKS,
    expectedCampaignId: null,
    landingUrl: "https://www.trip.com/",
    registerEvidence: "Trip.com Cruises, merchant via Cuelinks; cruise contextual handoff proven commercially (not inventory/API).",
    ingestibleInventory: false,
    inventoryGap: "Trip.com commercial handoff proven; ingestible cruise inventory source open.",
  },
};

/** Ensures the proof merchants, the Cuelinks access route and their approved links exist. Idempotent. */
export async function ensureProofRoutes(store: PlatformStore): Promise<{ accessRoute: AccessRoute; merchants: Record<TowerKind, Merchant> }> {
  const accessRoute = await ensureAccessRoute(store, CUELINKS);
  const merchants = {} as Record<TowerKind, Merchant>;
  for (const p of Object.values(PROOF_ROUTES)) {
    const m = await ensureMerchant(store, p.merchant);
    await linkMerchantToAccessRoute(store, { merchantId: m.id, accessRouteId: accessRoute.id, status: "approved" });
    merchants[p.tower] = m;
  }
  return { accessRoute, merchants };
}
