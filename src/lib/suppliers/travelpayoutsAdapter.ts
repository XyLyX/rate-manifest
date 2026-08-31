import type { SearchParams, SupplierAdapter, SupplierOffer } from "./types";

// Stub. This is the real next integration (Supply Ledger's recommended
// starting point: free self-serve signup, covers Booking.com/Agoda among
// 60+ brands, monetization built in via commission). It is intentionally
// inert until TRAVELPAYOUTS_TOKEN / TRAVELPAYOUTS_MARKER are set — see
// DECISIONS.md "What needs your action" and .env.example.
//
// Two things to remember when this gets implemented for real (both are
// verified facts from D1 of the economics workbook, not assumptions):
//   1. Do not hard-code a commission percentage anywhere — Travelpayouts'
//      own docs disagree with themselves (4% listed as a stated minimum on
//      one page, 5% as "current" on another). Read the live rate from the
//      partner dashboard/API when this adapter actually calls out.
//   2. Booking, payment, cancellation and refunds are handled by the
//      underlying supplier, not by us (confirmed in Travelpayouts' White
//      Label docs) — this adapter should never try to own that flow.
export const travelpayoutsAdapter: SupplierAdapter = {
  slug: "travelpayouts",
  displayName: "Travelpayouts",

  async getOffers(_params: SearchParams): Promise<SupplierOffer[]> {
    const token = process.env.TRAVELPAYOUTS_TOKEN;
    const marker = process.env.TRAVELPAYOUTS_MARKER;

    if (!token || !marker) {
      // No credentials configured — return no offers rather than throwing,
      // so the results page just shows one fewer source checked. This is
      // the expected state until the account exists (see DECISIONS.md).
      return [];
    }

    // Not implemented yet: wire this up to the Hotellook/Travelpayouts
    // Hotel Search API (or the widget/deep-link tools, if raw API access
    // hasn't been granted yet — see the Supply Ledger for the conversion-
    // rate thresholds that gate raw API access).
    throw new Error(
      "travelpayoutsAdapter: credentials are set but the real API call is not implemented yet."
    );
  },
};
