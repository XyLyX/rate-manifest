import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { PlatformStore } from "./service";
import type {
  AccessRoute,
  CommercialHandoff,
  CommercialRoute,
  ComponentKind,
  ComponentStatus,
  Merchant,
  MerchantAccessLink,
  MerchantAccessStatus,
  OfferSnapshot,
  Selection,
  TripComponent,
} from "./types";

// Drizzle-backed PlatformStore over the additive Phase 1A tables. Not yet
// called by any route or page (no UI in Phase 1A) — first consumer is the
// Phase 2 proof integrations.

type ComponentRow = typeof schema.tripComponents.$inferSelect;
type OfferRow = typeof schema.offerSnapshots.$inferSelect;

function toComponent(r: ComponentRow): TripComponent {
  return {
    id: r.id,
    tripId: r.tripId,
    kind: r.kind as ComponentKind,
    position: r.position,
    status: r.status as ComponentStatus,
    input: JSON.parse(r.inputJson),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toOffer(r: OfferRow): OfferSnapshot {
  return {
    id: r.id,
    componentId: r.componentId,
    kind: r.kind as ComponentKind,
    merchantId: r.merchantId,
    externalRef: r.externalRef,
    currency: r.currency,
    totalPrice: r.totalPrice,
    sourceUrl: r.sourceUrl,
    capturedAt: r.capturedAt,
    payload: JSON.parse(r.payloadJson),
    provenance: JSON.parse(r.provenanceJson),
  };
}

export const drizzlePlatformStore: PlatformStore = {
  async insertComponent(c) {
    await db.insert(schema.tripComponents).values({
      id: c.id,
      tripId: c.tripId,
      kind: c.kind,
      position: c.position,
      status: c.status,
      inputJson: JSON.stringify(c.input),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
  },
  async getComponent(id) {
    const r = await db.query.tripComponents.findFirst({ where: eq(schema.tripComponents.id, id) });
    return r ? toComponent(r) : null;
  },
  async listComponents(tripId) {
    const rows = await db.query.tripComponents.findMany({
      where: eq(schema.tripComponents.tripId, tripId),
      orderBy: [asc(schema.tripComponents.position)],
    });
    return rows.map(toComponent);
  },
  async updateComponent(id, patch) {
    await db
      .update(schema.tripComponents)
      .set({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.input ? { inputJson: JSON.stringify(patch.input) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.tripComponents.id, id));
  },

  async getMerchantBySlug(slug) {
    return ((await db.query.merchants.findFirst({ where: eq(schema.merchants.slug, slug) })) as Merchant | undefined) ?? null;
  },
  async getMerchant(id) {
    return ((await db.query.merchants.findFirst({ where: eq(schema.merchants.id, id) })) as Merchant | undefined) ?? null;
  },
  async insertMerchant(m) {
    await db.insert(schema.merchants).values(m);
  },

  async getAccessRouteBySlug(slug) {
    const r = await db.query.accessRoutes.findFirst({ where: eq(schema.accessRoutes.slug, slug) });
    return (r as AccessRoute | undefined) ?? null;
  },
  async getAccessRoute(id) {
    const r = await db.query.accessRoutes.findFirst({ where: eq(schema.accessRoutes.id, id) });
    return (r as AccessRoute | undefined) ?? null;
  },
  async insertAccessRoute(r) {
    await db.insert(schema.accessRoutes).values(r);
  },
  async listMerchantAccessLinks(merchantId) {
    const rows = await db.query.merchantAccessRoutes.findMany({ where: eq(schema.merchantAccessRoutes.merchantId, merchantId) });
    return rows.map((r): MerchantAccessLink => ({ ...r, status: r.status as MerchantAccessStatus }));
  },
  async insertMerchantAccessLink(l) {
    await db.insert(schema.merchantAccessRoutes).values(l);
  },

  async insertOffer(o) {
    await db.insert(schema.offerSnapshots).values({
      id: o.id,
      componentId: o.componentId,
      kind: o.kind,
      merchantId: o.merchantId,
      externalRef: o.externalRef,
      currency: o.currency,
      totalPrice: o.totalPrice,
      sourceUrl: o.sourceUrl,
      capturedAt: o.capturedAt,
      payloadJson: JSON.stringify(o.payload),
      provenanceJson: JSON.stringify(o.provenance),
    });
  },
  async getOffer(id) {
    const r = await db.query.offerSnapshots.findFirst({ where: eq(schema.offerSnapshots.id, id) });
    return r ? toOffer(r) : null;
  },

  async getSelectionForComponent(componentId) {
    const r = await db.query.componentSelections.findFirst({ where: eq(schema.componentSelections.componentId, componentId) });
    return (r as Selection | undefined) ?? null;
  },
  async upsertSelection(s) {
    await db
      .insert(schema.componentSelections)
      .values(s)
      .onConflictDoUpdate({
        target: schema.componentSelections.componentId,
        set: { offerId: s.offerId, selectedAt: s.selectedAt },
      });
  },

  async listOffers(componentId) {
    const rows = await db.query.offerSnapshots.findMany({ where: eq(schema.offerSnapshots.componentId, componentId) });
    return rows.map(toOffer);
  },

  async getLatestRouteForComponent(componentId) {
    const r = await db.query.commercialRoutes.findFirst({
      where: eq(schema.commercialRoutes.componentId, componentId),
      orderBy: [desc(schema.commercialRoutes.resolvedAt)],
    });
    if (!r) return null;
    return {
      id: r.id,
      selectionId: r.selectionId,
      handoffId: r.handoffId,
      componentId: r.componentId,
      merchantId: r.merchantId,
      accessRouteId: r.accessRouteId,
      routeType: r.routeType as CommercialRoute["routeType"],
      eligibility: r.eligibility as CommercialRoute["eligibility"],
      destinationUrl: r.destinationUrl,
      attribution: JSON.parse(r.attributionJson),
      reason: r.reason as CommercialRoute["reason"],
      resolvedAt: r.resolvedAt,
    };
  },

  async insertHandoff(h: CommercialHandoff) {
    await db.insert(schema.commercialHandoffs).values({
      id: h.id,
      componentId: h.componentId,
      merchantId: h.merchantId,
      contextJson: JSON.stringify(h.contextInput),
      landingUrl: h.landingUrl,
      provenanceJson: JSON.stringify(h.provenance),
      createdAt: h.createdAt,
    });
  },
  async getHandoff(id: string) {
    const r = await db.query.commercialHandoffs.findFirst({ where: eq(schema.commercialHandoffs.id, id) });
    if (!r) return null;
    return {
      id: r.id,
      componentId: r.componentId,
      merchantId: r.merchantId,
      contextInput: JSON.parse(r.contextJson),
      landingUrl: r.landingUrl,
      provenance: JSON.parse(r.provenanceJson),
      createdAt: r.createdAt,
    } as CommercialHandoff;
  },

  async insertRoute(r: CommercialRoute) {
    await db.insert(schema.commercialRoutes).values({
      id: r.id,
      selectionId: r.selectionId,
      handoffId: r.handoffId,
      componentId: r.componentId,
      merchantId: r.merchantId,
      accessRouteId: r.accessRouteId,
      routeType: r.routeType,
      eligibility: r.eligibility,
      destinationUrl: r.destinationUrl,
      attributionJson: JSON.stringify(r.attribution),
      reason: r.reason,
      resolvedAt: r.resolvedAt,
    });
  },
};
