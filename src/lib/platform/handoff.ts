import { makeAttributionId } from "./attribution";
import type { AccessAdapter, AccessRefusal } from "./accessAdapter";
import {
  MERCHANT_REGISTER,
  PRODUCTION_DESTINATION_BUILDERS,
  type DestinationBuilder,
  type RegisteredMerchant,
} from "./commercialRegister";
import { commercialStage, type FinalValidation, type StageBlock } from "./finalValidation";
import { isValidHandoffUrl } from "./route";
import { ensureAccessRoute, ensureMerchant, linkMerchantToAccessRoute, recordHandoff, resolveRouteForHandoff, type PlatformStore } from "./service";
import type { Tournament } from "./tournament";
import type { CommercialRoute } from "./types";

// Generic Finalist -> commercial route resolver for Hotel, Flight, Rail, Cruise.
//
//   tournament Finalist (traveller chosen)
//     -> tower final validation (Check IQ | factual confirmation)   [commercialStage]
//     -> merchant register capability                                [commercialRegister]
//     -> verified destination (exact proven property URL, exact proof landing, or a verified builder)
//     -> access adapter (Cuelinks LinkKit | DCM/TUNE) + opaque Sub-ID
//     -> CommercialHandoff -> CommercialRoute
//
// It only ever runs AFTER the decision. It takes the merchant as input, never
// chooses or ranks among merchants or candidates, and cannot alter the
// tournament (it receives it read-only). It records a priceless handoff: it
// never creates an OfferSnapshot, price, rate, currency or selection.
// Any missing link in the chain yields no route and a disabled CTA.

export type HandoffNoRoute =
  | "merchant_not_registered"
  | "capability_not_registered"
  | "capability_unverified"
  | "no_destination_evidence"
  | "access_adapter_unavailable"
  | `access_refused_${AccessRefusal}`;

export interface HandoffCta {
  enabled: boolean;
  label: string;
  url: string | null; // non-null only when enabled
  note: string;
}

export type TowerHandoffResult =
  | { status: "blocked_stage"; reason: StageBlock; route: null; cta: HandoffCta }
  | { status: "no_route"; reason: HandoffNoRoute; route: null; cta: HandoffCta }
  | { status: "routed"; route: CommercialRoute; cta: HandoffCta };

export interface TowerHandoffRequest {
  componentId: string;
  tournament: Tournament;
  validation: FinalValidation | null;
  merchantSlug: string;
}

export interface TowerHandoffDeps {
  store: PlatformStore;
  // Access adapters by access-route slug ("cuelinks", "dcm").
  adapters: Record<string, AccessAdapter | undefined>;
  register?: Record<string, RegisteredMerchant>;
  builders?: Record<string, DestinationBuilder>;
  newAttributionId?: () => string;
}

const DISABLED_NOTE = "Rate Manifest has no verified booking route for this choice yet. You can go to the provider's website directly.";

function disabled(label: string, note: string = DISABLED_NOTE): HandoffCta {
  return { enabled: false, label, url: null, note };
}

/** The one CTA policy for non-hotel towers (Hotel keeps its own in hotel/commercial.ts): enabled only for an eligible route with a valid URL. */
export function commercialCta(route: CommercialRoute, merchantName: string): HandoffCta {
  const bookable = route.routeType === "affiliate_outbound" || route.routeType === "direct_outbound";
  if (bookable && route.eligibility === "eligible" && isValidHandoffUrl(route.destinationUrl)) {
    return {
      enabled: true,
      label: `Continue to ${merchantName}`,
      url: route.destinationUrl,
      note: `Rate Manifest doesn't process payment or hold your booking. This takes you to ${merchantName} to continue${
        route.routeType === "affiliate_outbound" ? "; Rate Manifest may earn a commission." : "."
      }`,
    };
  }
  return disabled("Booking route unavailable");
}

export async function resolveTowerHandoff(req: TowerHandoffRequest, deps: TowerHandoffDeps): Promise<TowerHandoffResult> {
  const { store } = deps;
  const { tournament } = req;
  const component = await store.getComponent(req.componentId);
  if (!component) throw new Error("Component not found");
  if (component.kind !== tournament.kind) throw new Error(`Tournament is for ${tournament.kind}, component is ${component.kind}`);

  // 1. No commercial action exists before the tower's final decision stage.
  const stage = commercialStage(tournament, req.validation);
  if (!stage.allowed) {
    return { status: "blocked_stage", reason: stage.reason, route: null, cta: disabled("Not available yet", "Choose a finalist and complete the final check first.") };
  }
  const finalistId = tournament.finalistId as string;

  // 2. Register evidence for this merchant + tower.
  const merchant = (deps.register ?? MERCHANT_REGISTER)[req.merchantSlug];
  const none = (reason: HandoffNoRoute): TowerHandoffResult => ({ status: "no_route", reason, route: null, cta: disabled("Booking route unavailable") });
  if (!merchant) return none("merchant_not_registered");
  const cap = merchant.capabilities[tournament.kind];
  if (!cap) return none("capability_not_registered");
  if (cap.status === "to_verify") return none("capability_unverified");

  // 3. Verified destination: a builder with recorded proof, or the exact proof landing. Otherwise none.
  const builder = (deps.builders ?? PRODUCTION_DESTINATION_BUILDERS)[`${merchant.slug}:${tournament.kind}`];
  let destination: string | null = null;
  if (cap.status === "proven_landing") {
    destination = cap.landingUrl ?? null;
  } else if (cap.status === "proven_property") {
    // Exact proven property destination for THIS Finalist only; never a homepage/search fallback.
    destination = cap.properties?.[finalistId]?.url ?? null;
  } else if (builder) {
    destination = builder({ tower: tournament.kind, finalistId, context: component.input as Record<string, unknown> })?.url ?? null;
  }
  if (!isValidHandoffUrl(destination)) return none("no_destination_evidence");

  // 4. Access mechanism + opaque, non-PII Sub-ID.
  const adapter = deps.adapters[cap.accessRoute];
  if (!adapter) return none("access_adapter_unavailable");
  const outcome = await adapter.issue({
    destinationUrl: destination,
    attributionId: (deps.newAttributionId ?? makeAttributionId)(),
    expectedCampaignId: cap.campaignId ?? null,
    expectedIdentity: cap.dcm,
  });
  if (!outcome.ok) return none(`access_refused_${outcome.reason}`);

  // 5. Priceless handoff + route through the existing platform rules.
  await ensureMerchant(store, { slug: merchant.slug, name: merchant.name });
  const stored = await store.getMerchantBySlug(merchant.slug);
  const access = await ensureAccessRoute(store, { slug: adapter.accessRouteSlug, name: adapter.accessRouteName, kind: "affiliate_network" });
  await linkMerchantToAccessRoute(store, { merchantId: (stored as NonNullable<typeof stored>).id, accessRouteId: access.id, status: "approved" });
  const handoff = await recordHandoff(store, {
    componentId: component.id,
    merchantSlug: merchant.slug,
    landingUrl: destination,
    provenance: { enteredVia: "tournament_finalist", evidenceRefs: [`finalist:${finalistId}`, `register:${merchant.slug}:${tournament.kind}`] },
  });
  const route = await resolveRouteForHandoff(store, { handoffId: handoff.id, accessRouteSlug: access.slug, trackingEvidence: outcome.evidence });
  return { status: "routed", route, cta: commercialCta(route, merchant.name) };
}
