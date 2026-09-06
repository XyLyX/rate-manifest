// The "Best Deal Score" from Blueprint Section A: rank by value, not just
// price — room equivalence is handled upstream (every offer here is
// already for the same normalized room type), so this weighs price,
// cancellation flexibility, and supplier reliability, and always returns
// a human-readable "why we recommend it" explanation.
//
// The one rule that is not optional: a supplier with no reliability data
// yet must never be scored as if it were average or bad. It is excluded
// from the reliability component entirely (neutral, not penalized) and the
// UI must show "new partner — reliability data building" rather than any
// number for it. Faking a score to make the ranking look complete would
// undermine the entire "we stand behind the booking" premise.

import { MIN_BOOKING_OUTCOMES_FOR_RELIABILITY_SCORE } from "@/lib/constants";

export interface ScorableOffer {
  supplierSlug: string;
  supplierName: string;
  totalPrice: number;
  isFreeCancellation: boolean;
  // 2026-09-05 (Navin's "Handling Missing Rate Conditions" spec): whether
  // isFreeCancellation above is an actual fact from the source, or an
  // unset default because the source (StayingAPI's price-compare
  // endpoint) never returns cancellation terms at all - see
  // suppliers/types.ts's cancellation.confidence. "Unknown fields should
  // not automatically be treated as negative" - false because we don't
  // know is not the same as false because it's confirmed non-refundable,
  // and scoring them identically would be exactly the "manufactured
  // certainty" this rule exists to prevent.
  cancellationKnown: boolean;
  reliabilityScore: number | null; // null = not enough data yet
  bookingOutcomeCount: number;
  soldOut: boolean;
}

export interface ScoreReason {
  text: string;
  // "positive" gets a green dot in the UI; "neutral" gets a grey one —
  // kept as data here rather than guessed from the text client-side.
  tone: "positive" | "neutral";
}

export interface ScoredOffer extends ScorableOffer {
  score: number; // 0-100, higher is better. Only meaningful relative to other offers in the same result set.
  reasons: ScoreReason[];
  hasReliabilityData: boolean;
}

const WEIGHTS = {
  price: 0.6,
  cancellation: 0.25,
  reliability: 0.15,
};

export function scoreOffers(offers: ScorableOffer[]): ScoredOffer[] {
  const available = offers.filter((o) => !o.soldOut);
  if (available.length === 0) {
    return offers.map((o) => ({
      ...o,
      score: 0,
      reasons: [{ text: "No availability", tone: "neutral" }],
      hasReliabilityData: false,
    }));
  }

  const prices = available.map((o) => o.totalPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const scored = offers.map((o): ScoredOffer => {
    if (o.soldOut) {
      return { ...o, score: 0, reasons: [{ text: "No availability", tone: "neutral" }], hasReliabilityData: false };
    }

    const reasons: ScoreReason[] = [];

    // Price component: 1.0 at the cheapest offer, 0.0 at the priciest.
    const priceScore = maxPrice > minPrice ? (maxPrice - o.totalPrice) / (maxPrice - minPrice) : 1;
    if (o.totalPrice === minPrice) reasons.push({ text: "Lowest total price of the offers checked", tone: "positive" });

    // Cancellation component: binary when the source actually told us,
    // weighted so it can move the ranking — a slightly pricier,
    // freely-cancellable offer can beat a slightly cheaper non-refundable
    // one. When it's unknown (StayingAPI's price-compare endpoint never
    // returns this), this is a neutral 0.5, NOT scored as if
    // "non-refundable" were confirmed — same "unknown is never negative"
    // rule as the reliability component below.
    const cancellationScore = !o.cancellationKnown ? 0.5 : o.isFreeCancellation ? 1 : 0;
    if (o.cancellationKnown && o.isFreeCancellation) {
      reasons.push({ text: "Free cancellation", tone: "positive" });
    } else if (!o.cancellationKnown) {
      reasons.push({ text: "Cancellation terms not provided by this source", tone: "neutral" });
    }

    // Reliability component: only counted when there's enough data to mean
    // something. hasReliabilityData=false suppliers get the *average* of
    // the other two components as their reliability contribution, so a new
    // partner is never dragged down by an unearned zero.
    const hasReliabilityData =
      o.reliabilityScore != null && o.bookingOutcomeCount >= MIN_BOOKING_OUTCOMES_FOR_RELIABILITY_SCORE;
    const reliabilityScore = hasReliabilityData
      ? (o.reliabilityScore as number)
      : (priceScore + cancellationScore) / 2;
    if (hasReliabilityData && (o.reliabilityScore as number) >= 0.8) {
      reasons.push({ text: `${o.supplierName} has a strong track record on completed bookings`, tone: "positive" });
    }
    if (!hasReliabilityData) {
      reasons.push({ text: "New partner — reliability data building", tone: "neutral" });
    }

    const score =
      100 *
      (WEIGHTS.price * priceScore + WEIGHTS.cancellation * cancellationScore + WEIGHTS.reliability * reliabilityScore);

    return { ...o, score: Math.round(score * 10) / 10, reasons, hasReliabilityData };
  });

  return scored.sort((a, b) => b.score - a.score);
}
