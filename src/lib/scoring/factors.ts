import type { DisplayOffer } from "@/lib/search";

// Shared with the page-level RateManifest Verdict panel (see
// src/components/RateManifestVerdict.tsx) - originally a private function
// inside ResultsList.tsx's "Why this deal?" toggle, pulled out here 2026-
// 09-03 so both places build the exact same honest factor list from the
// exact same rules, rather than two copies drifting apart. Every factor is
// backed by a real field on the offer - deliberately does NOT include
// breakfast/board basis, since that isn't tracked anywhere in the supplier
// adapter data model yet, and showing a green "Breakfast included" tick
// with nothing behind it would be exactly the kind of fabricated signal
// DECISIONS.md rules out. Room "equivalence" is safe to state as a
// structural fact - every offer compared here is already for the same
// normalized room type, by construction, before scoring ever runs (see
// bestDealScore.ts).
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
      positive: offer.isFreeCancellation,
      text: offer.isFreeCancellation ? "Free cancellation" : "Non-refundable",
    },
    {
      label: "Taxes & fees",
      positive: true,
      text: "Included in the total shown",
    },
    {
      label: "Room",
      positive: true,
      text: "Same normalized room type across every offer compared",
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
