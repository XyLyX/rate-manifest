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
  cancellation: {
    isFreeCancellation: boolean;
    deadlineIso: string | null;
    penaltyPercentage: number | null;
  };
  // Where a click on this offer actually goes. In the mock adapter this is
  // an internal stub page; a real adapter returns a real affiliate deep
  // link (with the marker/token appended per that supplier's docs).
  outboundUrl: string;
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
