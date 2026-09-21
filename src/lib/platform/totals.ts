import type { PlatformStore } from "./service";
import type { ComponentKind } from "./types";

// A combined total is CALCULATED on demand from the current selected offer
// snapshots. It is never persisted and no combined "offer" entity exists;
// each component keeps its own offer, merchant and commercial route.

export type SelectedTotal =
  | {
      ok: true;
      currency: string;
      total: number;
      items: { componentId: string; kind: ComponentKind; offerId: string; merchantId: string; totalPrice: number }[];
    }
  | { ok: false; reason: "nothing_selected" }
  | { ok: false; reason: "mixed_currency"; currencies: string[] };

/** Sums the current selections of a trip's components (only components whose selection is current, i.e. status "selected"). */
export async function calculateSelectedTotal(store: PlatformStore, tripId: string, opts?: { kinds?: ComponentKind[] }): Promise<SelectedTotal> {
  const items: Extract<SelectedTotal, { ok: true }>["items"] = [];
  const currencies = new Set<string>();

  for (const c of await store.listComponents(tripId)) {
    if (c.status !== "selected") continue;
    if (opts?.kinds && !opts.kinds.includes(c.kind)) continue;
    const sel = await store.getSelectionForComponent(c.id);
    const offer = sel ? await store.getOffer(sel.offerId) : null;
    if (!offer) continue;
    currencies.add(offer.currency);
    items.push({ componentId: c.id, kind: c.kind, offerId: offer.id, merchantId: offer.merchantId, totalPrice: offer.totalPrice });
  }

  if (items.length === 0) return { ok: false, reason: "nothing_selected" };
  if (currencies.size > 1) return { ok: false, reason: "mixed_currency", currencies: [...currencies].sort() };

  // Sum in minor units to avoid float drift.
  const cents = items.reduce((sum, i) => sum + Math.round(i.totalPrice * 100), 0);
  return { ok: true, currency: [...currencies][0] as string, total: cents / 100, items };
}
