import { ensureMerchant, recordOffer, type PlatformStore } from "./service";
import type { ComponentInputByKind, ComponentKind, DecisionProvenance, OfferSnapshot } from "./types";

// Phase 2 source boundary. A real source (one per tower) implements
// SourceAdapter and returns NormalizedOffers; ingestOffers feeds them through
// the existing recordOffer path. Selection (selectOffer) and routing
// (resolveRouteForComponent) then work unchanged.
//
// Deliberately thin: only what the platform needs for identity, provenance,
// selection and handoff. Everything tower-specific (schedule, cabin, room,
// itinerary, ...) goes in `payload` and is never read by shared code.
// Adapters must not import StayingAPI code to shape this contract, and must
// not decide merchant capability, eligibility or attribution.

export interface NormalizedOffer {
  // The travel merchant/source of the offer (NOT a network or aggregator).
  merchant: { slug: string; name: string };
  // The source's own id for this offer, if it has a stable one.
  externalRef?: string | null;
  currency: string;
  totalPrice: number;
  // The merchant page/URL exactly as the source returned it, or null. Never
  // rewritten by the adapter; commercial routing decides what to do with it.
  sourceUrl: string | null;
  payload?: Record<string, unknown>;
  // Defaults to { enteredVia: "source_search", evidenceRefs: ["source:<adapter id>"] }.
  provenance?: DecisionProvenance;
}

export interface SourceAdapter<K extends ComponentKind = ComponentKind> {
  // Identifies the SOURCE integration for provenance only.
  id: string;
  kind: K;
  // Never fabricates offers: returns [] when the source has nothing.
  search(input: ComponentInputByKind[K]): Promise<NormalizedOffer[]>;
}

/** Runs an adapter for a component's own input and records each result as an offer snapshot on that component. */
export async function ingestOffers<K extends ComponentKind>(
  store: PlatformStore,
  adapter: SourceAdapter<K>,
  componentId: string
): Promise<OfferSnapshot[]> {
  const component = await store.getComponent(componentId);
  if (!component) throw new Error("Component not found");
  if (component.kind !== adapter.kind) {
    throw new Error(`Adapter "${adapter.id}" serves ${adapter.kind}, not ${component.kind}`);
  }

  const results = await adapter.search(component.input as ComponentInputByKind[K]);
  const recorded: OfferSnapshot[] = [];
  for (const r of results) {
    await ensureMerchant(store, r.merchant);
    recorded.push(
      await recordOffer(store, {
        componentId,
        merchantSlug: r.merchant.slug,
        externalRef: r.externalRef ?? null,
        currency: r.currency,
        totalPrice: r.totalPrice,
        sourceUrl: r.sourceUrl,
        payload: r.payload,
        provenance: r.provenance ?? { enteredVia: "source_search", evidenceRefs: [`source:${adapter.id}`] },
      })
    );
  }
  return recorded;
}
