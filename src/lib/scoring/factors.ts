import type { DisplayOffer } from "@/lib/search";

// Shared with the page-level RateManifest Verdict panel (see
// src/components/RateManifestVerdict.tsx) - originally a private function
// inside ResultsList.tsx's "Why this deal?" toggle, pulled out here 2026-
// 09-03 so both places build the exact same honest factor list from the
// exact same rules, rather than two copies drifting apart. Every factor is
// backed by a real field on the offer - deliberately does NOT include
// breakfast/board basis (not tracked in the supplier adapter data model yet)
// or room equivalence (StayingAPI's price-compare endpoint does not return
// room-type data per offer, so the local rooms table's normalized type
// cannot be presented as a per-offer confirmed fact - 2026-09-13).
export interface DealFactor {
  label: string;
  positive: boolean | null; // null = neutral, no green/red claim either way
  text: string;
}

export function buildDealFactors(offer: DisplayOffer): DealFactor[] {
  const isCheapest = offer.reasons.some((r) => r.text.startsWith("Lowest total price"));
  return [
    {
      label: "Price",
      positive: isCheapest,
      text: isCheapest ? "Lowest total price of the offers checked" : "Within the range of offers checked",
    },
    {
      label: "Cancellation",
      positive: offer.cancellationKnown ? offer.isFreeCancellation : null,
      text: offer.cancellationKnown
        ? offer.isFreeCancellation
          ? "Free cancellation"
          : "Non-refundable"
        : "Not provided by current rate source",
    },
    {
      label: "Taxes & fees",
      positive: offer.taxesConfirmed ? true : null,
      text: offer.taxesConfirmed
        ? "Included in the total shown"
        : "Tax treatment not confirmed — verify total at checkout",
    },
    {
      label: "Supplier",
      positive: offer.hasReliabilityData ? (offer.reliabilityScore ?? 0) >= 0.8 : null,
      text: offer.hasReliabilityData
        ? (offer.reliabilityScore ?? 0) >= 0.8
          ? "Strong track record on completed bookings"
          : "Reliability data available, mixed track record"
        : "New partner — reliability data building",
    },
  ];
}
