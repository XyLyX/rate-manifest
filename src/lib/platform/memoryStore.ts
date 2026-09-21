import type { PlatformStore } from "./service";
import type { CommercialHandoff, CommercialRoute, OfferSnapshot, Selection, TripComponent } from "./types";
import type { AccessRoute, Merchant, MerchantAccessLink } from "./types";

// In-memory PlatformStore used by tests. Mirrors the semantics of
// drizzleStore.ts (unique slugs, one selection per component).
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
    if (await this.getMerchantBySlug(m.slug)) throw new Error("duplicate merchant slug");
    this.merchants.set(m.id, m);
  }

  async getAccessRouteBySlug(slug: string) {
    return [...this.accessRoutes.values()].find((r) => r.slug === slug) ?? null;
  }
  async getAccessRoute(id: string) {
    return this.accessRoutes.get(id) ?? null;
  }
  async insertAccessRoute(r: AccessRoute) {
    if (await this.getAccessRouteBySlug(r.slug)) throw new Error("duplicate access route slug");
    this.accessRoutes.set(r.id, r);
  }
  async listMerchantAccessLinks(merchantId: string) {
    return this.links.filter((l) => l.merchantId === merchantId);
  }
  async insertMerchantAccessLink(l: MerchantAccessLink) {
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
