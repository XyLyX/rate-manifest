import { PROOF_ROUTES } from "./proofRoutes";
import { buildTripComHotelsDestination } from "./tripComHotelsDestination";
import type { TowerKind } from "./types";

// Register of merchants Rate Manifest may hand a traveller's FINALIST to, and
// the evidence behind each capability. It is commercial only:
// it never lists inventory, prices or a rate/quality claim, and nothing in it
// feeds Quarterfinalist/Semifinalist/Finalist selection.
//
// Model: a merchant is ONE record (Trip.com once) with a capability per
// vertical; an access mechanism (Cuelinks, DCM/TUNE) is a separate thing the
// capability names. Statuses are conservative and literal:
//
//   proven_landing     the exact Phase-2 proof landing URL (from proofRoutes.ts) is
//                      the handoff destination. No contextual URL is built or guessed.
//   proven_property   an exact property destination URL was manually proven (and
//                      confirmed to land on that property). It is recorded in
//                      `properties` keyed by the traveller's Finalist id and used
//                      exactly as recorded. No homepage or search-URL fallback;
//                      a Finalist without a recorded proof has no route.
//   proven_contextual  a contextual handoff was proven manually, but its exact
//                      URL contract is NOT accessible in this repository. It is
//                      routable only through a verified DestinationBuilder;
//                      none is registered, so it resolves honestly to "no route".
//   to_verify          no exact prior proof exists. Never routable.
//
// Missing evidence means no route, never a fallback.
//
// PROPERTY-ROUTING INVARIANT. The exact-property allowlist above is
// deliberately conservative for this release; it is NOT a limit of the generic
// access adapters (Cuelinks LinkKit, DCM/TUNE), which route any destination
// they are given. A further property becomes eligible only when Rate Manifest
// holds independently verified: (1) merchant/property identity, (2) an approved
// access relationship, and (3) an exact destination URL or a verified
// destination-builder contract. If a property mapping is missing there is NO
// route: never a merchant homepage or a search URL as a stand-in.

export type CapabilityKey = TowerKind | "flight_hotel" | "private_tours" | "group_tours";

export type CapabilityStatus = "proven_landing" | "proven_property" | "proven_contextual" | "to_verify";

// An exact, manually proven property destination for one Finalist id.
export interface ProvenPropertyDestination {
  url: string;
  evidence: string;
}

export interface MerchantCapability {
  status: CapabilityStatus;
  accessRoute: "cuelinks" | "dcm";
  // Exact handoff destination, only for proven_landing (taken from the Phase-2 proof).
  landingUrl?: string;
  // Exact proven property destinations, only for proven_property, keyed by Finalist (property) id.
  properties?: Record<string, ProvenPropertyDestination>;
  // Merchant campaign the proof recorded (NOT the LinkKit CID 319721); null/undefined = not recorded.
  campaignId?: number | null;
  // DCM/TUNE identity the proof recorded.
  dcm?: { offerId: number; affiliateId: number };
  // Context a proven contextual handoff carried (documentation of the proof, not a URL contract).
  provenContext?: readonly string[];
  evidence: string;
}

export interface RegisteredMerchant {
  slug: string;
  name: string;
  capabilities: Partial<Record<CapabilityKey, MerchantCapability>>;
}

const TRIPCOM_TO_VERIFY = "No exact prior proof recorded; TO VERIFY. No destination is built or guessed.";

export const MERCHANT_REGISTER: Record<string, RegisteredMerchant> = {
  anantara: {
    slug: "anantara",
    name: "Anantara",
    capabilities: {
      hotel: {
        status: "proven_property",
        accessRoute: "cuelinks",
        campaignId: PROOF_ROUTES.hotel.expectedCampaignId,
        properties: {
          "anantara-the-palm-dubai": {
            url: "https://www.anantara.com/en/palm-dubai",
            evidence: "Manually proven: wrapped through LinkKit and confirmed to land on Anantara The Palm Dubai.",
          },
        },
        evidence: "Merchant campaign 13297 (Phase-2 register); property destination manually proven through LinkKit. Not a homepage fallback.",
      },
    },
  },
  "marco-polo-hotels": {
    slug: "marco-polo-hotels",
    name: "Marco Polo Hotels",
    capabilities: {
      hotel: {
        status: "proven_property",
        accessRoute: "cuelinks",
        campaignId: null,
        properties: {
          "gateway-hotel-hong-kong": {
            url: "https://www.marcopolohotels.com/en/gateway-hotel-hong-kong",
            evidence: "Manually proven: wrapped through LinkKit and confirmed to land on Gateway Hotel Hong Kong.",
          },
        },
        evidence: "Property destination manually proven through the same LinkKit mechanism. No merchant campaign id recorded.",
      },
    },
  },
  agoda: {
    slug: "agoda",
    name: "Agoda",
    capabilities: {
      hotel: {
        status: "proven_property",
        accessRoute: "dcm",
        dcm: { offerId: 252, affiliateId: 172905 },
        properties: {
          "sofitel-dubai-the-palm": {
            url: "https://www.agoda.com/sofitel-dubai-the-palm-resort-and-spa/hotel/dubai-ae.html",
            evidence: "Previously proven: DCM redirect landed on the Sofitel Dubai The Palm Agoda property page. Clean property URL only; the later session-heavy /search URL is deliberately not used.",
          },
        },
        evidence: "Agoda Hotels GCC via DCM/TUNE, offer 252, affiliate 172905. Commercial route only; not inventory or pricing.",
      },
    },
  },
  "trip-com": {
    slug: "trip-com",
    name: "Trip.com",
    capabilities: {
      hotel: {
        status: "proven_contextual",
        accessRoute: "cuelinks",
        campaignId: null,
        provenContext: ["destination", "check-in", "check-out", "rooms", "adults", "children", "currency"],
        evidence:
          "PROVEN manually: the Trip.com hotels/list destination wrapped through Cuelinks LinkKit landed on Trip.com showing Bangkok, 1 Oct to 3 Oct 2026, 1 room, 2 adults, 0 children, AED. Built by tripComHotelsDestination.ts from that exact contract; only verified city mappings route.",
      },
      cruise: {
        status: "proven_landing",
        accessRoute: "cuelinks",
        landingUrl: PROOF_ROUTES.cruise.landingUrl,
        campaignId: PROOF_ROUTES.cruise.expectedCampaignId,
        evidence: PROOF_ROUTES.cruise.registerEvidence,
      },
      flight: { status: "to_verify", accessRoute: "cuelinks", evidence: TRIPCOM_TO_VERIFY },
      rail: { status: "to_verify", accessRoute: "cuelinks", evidence: TRIPCOM_TO_VERIFY },
      flight_hotel: { status: "to_verify", accessRoute: "cuelinks", evidence: TRIPCOM_TO_VERIFY },
      private_tours: { status: "to_verify", accessRoute: "cuelinks", evidence: TRIPCOM_TO_VERIFY },
      group_tours: { status: "to_verify", accessRoute: "cuelinks", evidence: TRIPCOM_TO_VERIFY },
    },
  },
  "air-india": {
    slug: "air-india",
    name: "Air India",
    capabilities: {
      flight: {
        status: "proven_landing",
        accessRoute: "cuelinks",
        landingUrl: PROOF_ROUTES.flight.landingUrl,
        campaignId: PROOF_ROUTES.flight.expectedCampaignId,
        evidence: PROOF_ROUTES.flight.registerEvidence,
      },
    },
  },
  italiarail: {
    slug: "italiarail",
    name: "ItaliaRail",
    capabilities: {
      rail: {
        status: "proven_landing",
        accessRoute: "cuelinks",
        landingUrl: PROOF_ROUTES.rail.landingUrl,
        campaignId: PROOF_ROUTES.rail.expectedCampaignId,
        evidence: PROOF_ROUTES.rail.registerEvidence,
      },
    },
  },
};

export interface DestinationBuildContext {
  tower: TowerKind;
  // The traveller's chosen Finalist (property id / itinerary id / sailing id).
  finalistId: string;
  // The component's own input (stay, travellers, dates...).
  context: Record<string, unknown>;
}

// Builds a CONTEXTUAL merchant destination for a proven_contextual capability.
// Only a builder with recorded proof may be registered; null = cannot build.
export type DestinationBuilder = (ctx: DestinationBuildContext) => { url: string } | null;

// PRODUCTION registry of verified destination builders, keyed "<merchantSlug>:<tower>".
// A builder is added here only together with the recorded proof of its URL
// contract. Trip.com Hotels is the only one so far (see tripComHotelsDestination.ts).
export const PRODUCTION_DESTINATION_BUILDERS: Record<string, DestinationBuilder> = {
  "trip-com:hotel": buildTripComHotelsDestination,
};

export type RouteReadiness = "routable" | "needs_verified_url_contract" | "to_verify" | "not_registered";

/** Whether a merchant/tower can currently produce a route in production, from the register alone. */
export function routeReadiness(
  merchantSlug: string,
  tower: TowerKind,
  builders: Record<string, DestinationBuilder> = PRODUCTION_DESTINATION_BUILDERS,
  finalistId?: string
): RouteReadiness {
  const cap = MERCHANT_REGISTER[merchantSlug]?.capabilities[tower];
  if (!cap) return "not_registered";
  if (cap.status === "to_verify") return "to_verify";
  if (cap.status === "proven_landing") return cap.landingUrl ? "routable" : "needs_verified_url_contract";
  if (cap.status === "proven_property") {
    const props = cap.properties ?? {};
    return (finalistId ? !!props[finalistId] : Object.keys(props).length > 0) ? "routable" : "needs_verified_url_contract";
  }
  return builders[`${merchantSlug}:${tower}`] ? "routable" : "needs_verified_url_contract";
}
