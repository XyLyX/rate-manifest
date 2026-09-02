// Normalized Things To Do product model, for Viator (and any later Things
// To Do supplier - Tiqets, WeGoTrip, GetYourGuide) - deliberately NOT
// forced into SupplierOffer/SupplierAdapter (src/lib/suppliers/types.ts).
// Those are hotel-shaped (nightlyPrice, roomNormalizedType, cancellation
// deadlines) and none of that fits a tour/activity product. See
// DECISIONS.md, "Decision: build a native Viator Things To Do
// integration" - Things To Do is a genuinely different product from
// Hotels, not a variant of the same one, so it gets its own parallel
// model rather than a forced fit.
//
// This is the small, deliberate first scope agreed with the user: one
// destination search, real Viator products rendered as RateManifest's own
// card - title, image, description, rating/reviews, live price, live
// availability, a real booking link. Not a full Things To Do platform.

export interface ThingsToDoProduct {
  // Viator's own product identifier (their "productCode") - needed to
  // look up fresh availability/pricing later without re-searching.
  supplierProductId: string;
  supplierSlug: "viator";
  supplierName: "Viator";

  title: string;
  shortDescription: string;
  imageUrl: string | null;

  // Viator returns a 0-5 rating and a review count separately - kept
  // separate here rather than collapsed into one display string, so the
  // card can decide how to render "no reviews yet" (count 0) versus a
  // real low rating.
  rating: number | null;
  reviewCount: number;

  currency: string;
  // The lowest price /products/search returned for this product - a
  // "from" price, the same way OTA search results normally work. NOT a
  // confirmed bookable price for a specific date until checked again via
  // availability - see `confirmedAvailable` below.
  fromPrice: number;

  // Whether this product's availability has been confirmed live (via a
  // real-time check) for the visitor's actual dates, as opposed to just
  // having appeared in a destination-level search result. Starts false;
  // see DECISIONS.md for why this stays a documented gap rather than a
  // guessed field mapping - Viator's /availability/check request/response
  // shape was not confirmed from public documentation, only that the
  // endpoint exists and should be called "immediately prior to presenting
  // the user with bookable items."
  confirmedAvailable: boolean;

  // Pre-formatted by Viator's own API response (their "productUrl" field)
  // and already carries this account's affiliate attribution - RateManifest
  // does not construct or append any tracking parameters itself. See
  // DECISIONS.md: Viator's own docs describe this as a "pre-formatted
  // Viator link," which is why there is no separate link-building step
  // here the way there is for Klook's Travelpayouts links.
  bookingUrl: string;

  // When this data was actually fetched from Viator - not "when the
  // visitor searched." Same freshness discipline as
  // SupplierOffer.checkedAt in the hotel adapters.
  checkedAt: string;
}

export interface ThingsToDoSearchParams {
  destinationName: string; // e.g. "Dubai" - resolved to a destinationId internally
  startDate: string; // ISO date
  endDate: string; // ISO date
  currency: string; // e.g. "AED"
}
