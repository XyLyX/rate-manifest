import type { PlatformStore } from "./service";
import type { CommercialHandoff, CommercialRoute, OfferSnapshot, Selection, TripComponent } from "./types";
import type { AccessRoute, Merchant, MerchantAccessLink } from "./types";

// In-memory PlatformStore used by tests. Mirrors the semantics of
// drizzleStore.ts (unique slugs, one selection per component, a unique
// (merchant_id, access_route_id) pair - see schema.ts's merchants.slug,
// access_routes.slug and merchant_access_routes_pair_idx).
//
// Duplicate-insert errors carry `code: "23505"` - Postgres' own
// unique_violation SQLSTATE, exactly what the `pg` driver attaches to a real
// constraint violation - so code exercising concurrent-registration recovery
// (see joaliCommercial.ts) behaves identically against this store and the
// real one.
function uniqueViolation(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: "23505" });
}

export class MemoryPlatformStore implements PlatformStore {
  components = new Map<string, TripComponent>();
  merchants = new Map<string, Merchant>();
  accessRoutes = new Map<string, AccessRoute>();
  links: MerchantAccessLink[] = [];
  offers = new Map<string, OfferSnapshot>();
  selections = new Map<string, Selection>(); // keyed by componentId
  handoffs = new Map<string, CommercialHandoff>();
  routes: CommercialRoute[] = [];

  async insertComponent(c: TripComponent) {
    this.components.set(c.id, c);
  }
  async getComponent(id: string) {
    return this.components.get(id) ?? null;
  }
  async listComponents(tripId: string) {
    return [...this.components.values()].filter((c) => c.tripId === tripId).sort((a, b) => a.position - b.position);
  }
  async updateComponent(id: string, patch: { status?: TripComponent["status"]; input?: TripComponent["input"] }) {
    const c = this.components.get(id);
    if (!c) throw new Error("Component not found");
    this.components.set(id, { ...c, ...patch, updatedAt: new Date() });
  }

  async getMerchantBySlug(slug: string) {
    return [...this.merchants.values()].find((m) => m.slug === slug) ?? null;
  }
  async getMerchant(id: string) {
    return this.merchants.get(id) ?? null;
  }
  async insertMerchant(m: Merchant) {
    // Checked synchronously (not via `await this.getMerchantBySlug(...)`,
    // which - despite doing no real I/O - still yields a microtask tick and
    // would let two concurrent inserts both observe "not found" before
    // either's `.set()` runs). A real Postgres unique index has no such
    // window; this keeps that same atomicity guarantee here, so
    // interleaved/concurrent callers (see joali.test.ts's race simulations)
    // exercise the same unique_violation recovery path they would against
    // the real database, not an artifact of this store's own async shape.
    if ([...this.merchants.values()].some((x) => x.slug === m.slug)) throw uniqueViolation("duplicate merchant slug");
    this.merchants.set(m.id, m);
  }

  async getAccessRouteBySlug(slug: string) {
    return [...this.accessRoutes.values()].find((r) => r.slug === slug) ?? null;
  }
  async getAccessRoute(id: string) {
    return this.accessRoutes.get(id) ?? null;
  }
  async insertAccessRoute(r: AccessRoute) {
    // Synchronous check - see insertMerchant's own comment above.
    if ([...this.accessRoutes.values()].some((x) => x.slug === r.slug)) throw uniqueViolation("duplicate access route slug");
    this.accessRoutes.set(r.id, r);
  }
  async listMerchantAccessLinks(merchantId: string) {
    return this.links.filter((l) => l.merchantId === merchantId);
  }
  async insertMerchantAccessLink(l: MerchantAccessLink) {
    if (this.links.some((x) => x.merchantId === l.merchantId && x.accessRouteId === l.accessRouteId)) {
      throw uniqueViolation("duplicate merchant_access_routes pair");
    }
    this.links.push(l);
  }

  async insertOffer(o: OfferSnapshot) {
    this.offers.set(o.id, o);
  }
  async getOffer(id: string) {
    return this.offers.get(id) ?? null;
  }

  async getSelectionForComponent(componentId: string) {
    return this.selections.get(componentId) ?? null;
  }
  async upsertSelection(s: Selection) {
    const existing = this.selections.get(s.componentId);
    this.selections.set(s.componentId, existing ? { ...existing, offerId: s.offerId, selectedAt: s.selectedAt } : s);
  }

  async listOffers(componentId: string) {
    return [...this.offers.values()].filter((o) => o.componentId === componentId);
  }

  async insertHandoff(h: CommercialHandoff) {
    this.handoffs.set(h.id, h);
  }
  async getHandoff(id: string) {
    return this.handoffs.get(id) ?? null;
  }

  async insertRoute(r: CommercialRoute) {
    this.routes.push(r);
  }
  async getLatestRouteForComponent(componentId: string) {
    const mine = this.routes.filter((r) => r.componentId === componentId);
    return mine[mine.length - 1] ?? null;
  }
}
