import { newId } from "../id";
import { validateComponentInput } from "./contracts";
import { buildCommercialRoute } from "./route";
import type {
  AccessRoute,
  AccessRouteKind,
  CommercialRoute,
  ComponentInputByKind,
  ComponentKind,
  ComponentStatus,
  CommercialHandoff,
  DecisionProvenance,
  Merchant,
  MerchantAccessLink,
  MerchantAccessStatus,
  OfferSnapshot,
  Selection,
  TrackingEvidence,
  TripComponent,
} from "./types";

// Persistence boundary for the shared platform. The Drizzle implementation is
// drizzleStore.ts; memoryStore.ts is the in-memory one used by tests. This
// file (and everything else in src/lib/platform except drizzleStore.ts) has
// no database import.
export interface PlatformStore {
  insertComponent(c: TripComponent): Promise<void>;
  getComponent(id: string): Promise<TripComponent | null>;
  listComponents(tripId: string): Promise<TripComponent[]>;
  updateComponent(id: string, patch: { status?: ComponentStatus; input?: TripComponent["input"] }): Promise<void>;

  getMerchantBySlug(slug: string): Promise<Merchant | null>;
  getMerchant(id: string): Promise<Merchant | null>;
  insertMerchant(m: Merchant): Promise<void>;

  getAccessRouteBySlug(slug: string): Promise<AccessRoute | null>;
  getAccessRoute(id: string): Promise<AccessRoute | null>;
  insertAccessRoute(r: AccessRoute): Promise<void>;
  listMerchantAccessLinks(merchantId: string): Promise<MerchantAccessLink[]>;
  insertMerchantAccessLink(l: MerchantAccessLink): Promise<void>;

  insertOffer(o: OfferSnapshot): Promise<void>;
  getOffer(id: string): Promise<OfferSnapshot | null>;

  getSelectionForComponent(componentId: string): Promise<Selection | null>;
  // Replaces the offer chosen for that ONE component (keeping the existing
  // selection id); never touches another component.
  upsertSelection(s: Selection): Promise<void>;

  listOffers(componentId: string): Promise<OfferSnapshot[]>;

  insertHandoff(h: CommercialHandoff): Promise<void>;
  getHandoff(id: string): Promise<CommercialHandoff | null>;

  insertRoute(r: CommercialRoute): Promise<void>;
  // Most recently resolved route for a component (routes are appended, not overwritten).
  getLatestRouteForComponent(componentId: string): Promise<CommercialRoute | null>;
}

// --- Trip components -------------------------------------------------------

/** Adds a component to a trip. Never reads or modifies existing components. */
export async function addComponent<K extends ComponentKind>(
  store: PlatformStore,
  args: { tripId: string; kind: K; input: ComponentInputByKind[K] }
): Promise<TripComponent<K>> {
  const errors = validateComponentInput(args.kind, args.input);
  if (errors.length) throw new Error(`Invalid ${args.kind} component input: ${errors.join("; ")}`);

  const existing = await store.listComponents(args.tripId);
  const now = new Date();
  const component: TripComponent<K> = {
    id: newId(),
    tripId: args.tripId,
    kind: args.kind,
    // max+1, not count: stays unique-ish even if a component is ever removed.
    position: existing.reduce((max, c) => Math.max(max, c.position), -1) + 1,
    status: "draft",
    input: args.input,
    createdAt: now,
    updatedAt: now,
  };
  await store.insertComponent(component as TripComponent);
  return component;
}

/**
 * Edits ONE component's own input. Other components are untouched.
 * The component returns to "draft": a selection made against the old input
 * is stale and must not be routed or totalled until an offer is selected again.
 */
export async function updateComponentInput(store: PlatformStore, componentId: string, input: TripComponent["input"]): Promise<void> {
  const c = await store.getComponent(componentId);
  if (!c) throw new Error("Component not found");
  const errors = validateComponentInput(c.kind, input);
  if (errors.length) throw new Error(`Invalid ${c.kind} component input: ${errors.join("; ")}`);
  await store.updateComponent(componentId, { input, status: "draft" });
}

// --- Merchants and access routes -------------------------------------------

export async function ensureMerchant(store: PlatformStore, args: { slug: string; name: string }): Promise<Merchant> {
  const existing = await store.getMerchantBySlug(args.slug);
  if (existing) return existing;
  const m: Merchant = { id: newId(), slug: args.slug, name: args.name, createdAt: new Date() };
  await store.insertMerchant(m);
  return m;
}

export async function ensureAccessRoute(
  store: PlatformStore,
  args: { slug: string; name: string; kind: AccessRouteKind }
): Promise<AccessRoute> {
  const existing = await store.getAccessRouteBySlug(args.slug);
  if (existing) return existing;
  const r: AccessRoute = { id: newId(), slug: args.slug, name: args.name, kind: args.kind, createdAt: new Date() };
  await store.insertAccessRoute(r);
  return r;
}

/** Records that a merchant is reachable via an access route. Idempotent per pair. */
export async function linkMerchantToAccessRoute(
  store: PlatformStore,
  args: { merchantId: string; accessRouteId: string; status: MerchantAccessStatus }
): Promise<MerchantAccessLink> {
  const links = await store.listMerchantAccessLinks(args.merchantId);
  const existing = links.find((l) => l.accessRouteId === args.accessRouteId);
  if (existing) return existing;
  const link: MerchantAccessLink = { id: newId(), ...args };
  await store.insertMerchantAccessLink(link);
  return link;
}

// --- Offers and selection --------------------------------------------------

/** Snapshots an offer against ONE component. Provenance is stored on the offer; attribution is not. */
export async function recordOffer(
  store: PlatformStore,
  args: {
    componentId: string;
    merchantSlug: string;
    externalRef?: string | null;
    currency: string;
    totalPrice: number;
    sourceUrl: string | null;
    payload?: Record<string, unknown>;
    provenance: DecisionProvenance;
  }
): Promise<OfferSnapshot> {
  const component = await store.getComponent(args.componentId);
  if (!component) throw new Error("Component not found");
  const merchant = await store.getMerchantBySlug(args.merchantSlug);
  if (!merchant) throw new Error(`Unknown merchant: ${args.merchantSlug}`);
  if (!Number.isFinite(args.totalPrice)) throw new Error("totalPrice must be a finite number");

  const offer: OfferSnapshot = {
    id: newId(),
    componentId: component.id,
    kind: component.kind,
    merchantId: merchant.id,
    externalRef: args.externalRef ?? null,
    currency: args.currency,
    totalPrice: args.totalPrice,
    sourceUrl: args.sourceUrl,
    capturedAt: new Date(),
    payload: args.payload ?? {},
    provenance: args.provenance,
  };
  await store.insertOffer(offer);
  return offer;
}

/** Selects an offer for its own component. Rejects an offer belonging to a different component. */
export async function selectOffer(store: PlatformStore, args: { componentId: string; offerId: string }): Promise<Selection> {
  const component = await store.getComponent(args.componentId);
  if (!component) throw new Error("Component not found");
  const offer = await store.getOffer(args.offerId);
  if (!offer) throw new Error("Offer not found");
  if (offer.componentId !== component.id) throw new Error("Offer does not belong to this component");

  await store.upsertSelection({ id: newId(), componentId: component.id, offerId: offer.id, selectedAt: new Date() });
  await store.updateComponent(component.id, { status: "selected" });
  // Re-read: re-selecting keeps the component's existing selection id (routes reference it).
  const saved = await store.getSelectionForComponent(component.id);
  if (!saved) throw new Error("Selection was not persisted");
  return saved;
}

// --- Commercial route ------------------------------------------------------

/**
 * Resolves and persists the commercial route for a component's current
 * selection. Access route: the requested one if approved for the merchant,
 * else the first approved link, else none. Tracking evidence must be supplied
 * by the caller; it is never fabricated here.
 */
export async function resolveRouteForComponent(
  store: PlatformStore,
  args: { componentId: string; accessRouteSlug?: string; trackingEvidence?: TrackingEvidence | null }
): Promise<CommercialRoute> {
  const component = await store.getComponent(args.componentId);
  if (!component) throw new Error("Component not found");
  const selection = await store.getSelectionForComponent(args.componentId);
  if (!selection || component.status !== "selected") {
    throw new Error("No current selection for this component (none made, or its input changed since)");
  }
  const offer = await store.getOffer(selection.offerId);
  if (!offer) throw new Error("Selected offer not found");
  const merchant = await store.getMerchant(offer.merchantId);
  if (!merchant) throw new Error("Merchant not found");

  const route = buildCommercialRoute({
    id: newId(),
    selectionId: selection.id,
    componentId: component.id,
    sourceUrl: offer.sourceUrl,
    merchant,
    accessRoute: await pickAccessRoute(store, merchant.id, args.accessRouteSlug),
    trackingEvidence: args.trackingEvidence ?? null,
    now: new Date(),
  });
  await store.insertRoute(route);
  return route;
}

// Approved access route for a merchant. Deterministic when several are
// approved and none is requested (no DB ordering guarantee otherwise):
// alphabetical by slug.
export async function pickAccessRoute(store: PlatformStore, merchantId: string, slug?: string): Promise<AccessRoute | null> {
  const approved: AccessRoute[] = [];
  for (const link of await store.listMerchantAccessLinks(merchantId)) {
    if (link.status !== "approved") continue;
    const r = await store.getAccessRoute(link.accessRouteId);
    if (r) approved.push(r);
  }
  approved.sort((a, b) => a.slug.localeCompare(b.slug));
  return (slug ? approved.find((r) => r.slug === slug) : approved[0]) ?? null;
}

// --- Commercial handoff (commercial route WITHOUT an ingested offer) --------

/**
 * Records that a component's context will be handed to a merchant. No offer,
 * no price. Snapshots the component's current input as the handoff context.
 */
export async function recordHandoff(
  store: PlatformStore,
  args: { componentId: string; merchantSlug: string; landingUrl: string | null; provenance: DecisionProvenance }
): Promise<CommercialHandoff> {
  const component = await store.getComponent(args.componentId);
  if (!component) throw new Error("Component not found");
  const merchant = await store.getMerchantBySlug(args.merchantSlug);
  if (!merchant) throw new Error(`Unknown merchant: ${args.merchantSlug}`);

  const handoff: CommercialHandoff = {
    id: newId(),
    componentId: component.id,
    merchantId: merchant.id,
    contextInput: structuredClone(component.input) as Record<string, unknown>,
    landingUrl: args.landingUrl,
    provenance: args.provenance,
    createdAt: new Date(),
  };
  await store.insertHandoff(handoff);
  return handoff;
}

/**
 * Resolves and persists the commercial route for a handoff. Same access-route
 * and attribution rules as an offer route. Refuses a stale handoff (the
 * component's input changed after the context was captured).
 */
export async function resolveRouteForHandoff(
  store: PlatformStore,
  args: { handoffId: string; accessRouteSlug?: string; trackingEvidence?: TrackingEvidence | null }
): Promise<CommercialRoute> {
  const handoff = await store.getHandoff(args.handoffId);
  if (!handoff) throw new Error("Handoff not found");
  const component = await store.getComponent(handoff.componentId);
  if (!component) throw new Error("Component not found");
  if (JSON.stringify(component.input) !== JSON.stringify(handoff.contextInput)) {
    throw new Error("Handoff is stale: the component input changed after the handoff context was captured");
  }
  const merchant = await store.getMerchant(handoff.merchantId);
  if (!merchant) throw new Error("Merchant not found");

  const route = buildCommercialRoute({
    id: newId(),
    handoffId: handoff.id,
    componentId: component.id,
    sourceUrl: handoff.landingUrl,
    merchant,
    accessRoute: await pickAccessRoute(store, merchant.id, args.accessRouteSlug),
    trackingEvidence: args.trackingEvidence ?? null,
    now: new Date(),
  });
  await store.insertRoute(route);
  return route;
}
