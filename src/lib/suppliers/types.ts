// The Supplier adapter interface. Every real supplier integration
// (Travelpayouts today; Booking.com Demand API, Agoda Demand API, a paid
// aggregator, etc. later, if the Supply Ledger's evidence gates are ever
// met) implements this same shape, so the search/results code never needs
// to know which adapter produced a given offer.

export interface SearchParams {
  hotelId: string;
  checkIn: string; // ISO date, e.g. "2026-09-14"
  checkOut: string; // ISO date
}

export interface SupplierOffer {
  // Identity of the actual named seller this offer is attributed to (e.g.
  // "booking", "expedia") — NOT the integration/adapter that fetched it.
  // This is what the Supplier table, click-to-reveal, and the reliability
  // score are keyed on: an adapter like Travelpayouts brokers several real
  // OTAs, and each offer must be attributed to the real seller behind it,
  // not to "travelpayouts" itself, or the "who owns the customer" trust
  // layer loses the attribution it exists to provide.
  supplierSlug: string;
  supplierName: string;
  roomNormalizedType: string;
  soldOut: boolean;
  currency: string;
  nightlyPrice: number;
  taxesFeesPerNight: number;
  totalPrice: number;
  // Same "confirmed vs unknown" distinction as cancellation.confidence
  // above, for the nightly/taxes split specifically: StayingAPI's
  // price-compare endpoint returns one all-in total with no breakdown, so
  // taxesFeesPerNight is a placeholder 0 there, not a confirmed "$0 tax" -
  // see stayingApiRefresh.ts's mapOffers(). The mock adapter computes a
  // real (simulated) breakdown, so it's "confirmed" there.
  taxesConfidence: "confirmed" | "unknown";
  cancellation: {
    isFreeCancellation: boolean;
    deadlineIso: string | null;
    penaltyPercentage: number | null;
    // 2026-09-05 (Navin's "Page 2 — Rate Intelligence: Handling Missing
    // Rate Conditions" spec): whether isFreeCancellation/deadlineIso/
    // penaltyPercentage above are an actual fact the source told us
    // ("confirmed") or an unset default because the source doesn't return
    // cancellation terms at all ("unknown"). StayingAPI's price-compare
    // endpoint never returns this (see stayingApiRefresh.ts's mapOffers) -
    // isFreeCancellation: false there is NOT a confirmed "non-refundable,"
    // it's an honest placeholder, and must never be scored or displayed as
    // if it were a verified negative. The mock adapter generates a real
    // (simulated) answer, so it's "confirmed" there.
    confidence: "confirmed" | "unknown";
  };
  // Where a click on this offer actually goes. In the mock adapter this is
  // an internal stub page; a real adapter returns a real affiliate deep
  // link (with the marker/token appended per that supplier's docs).
  outboundUrl: string;
  // When this offer's price was actually last checked against the source,
  // ISO timestamp - not "when the search happened." Only an adapter
  // backed by a real cache with a known age sets this (stayingApiAdapter
  // does, from staying_api_cache.refreshedAt); the mock adapter leaves it
  // unset, since a synthesized demo price has no real "checked at" and the
  // results page already labels demo hotels separately. Optional and
  // null-safe everywhere downstream so adding a freshness display never
  // requires every adapter to support it.
  checkedAt?: string | null;
}

export interface SupplierAdapter {
  slug: string;
  displayName: string;
  /**
   * Returns 0 or more offers for the given hotel/date range. An adapter
   * that has no offer for a hotel (not sold, not covered, credentials
   * missing) returns an empty array rather than throwing — a single
   * unavailable supplier must never break the results page for the other
   * suppliers still checked in the "N sources checked" count.
   */
  getOffers(params: SearchParams): Promise<SupplierOffer[]>;
}
