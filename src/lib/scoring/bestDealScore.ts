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

// MARKET - the fourth scoring component, added 2026-09-07 per Navin's
// RATE+VALUE+TERMS+MARKET+TIMING framework (see
// claude/travel-decision-platform-assessment.md, "RateManifest
// Intelligence / Verdict"). Answers "is this price good relative to what
// this exact hotel/date has actually cost recently," using the same
// price_history data src/lib/priceInsight.ts already reads for the "Is
// this a good price?" panel - runSearch() now fetches that once per
// search (see search.ts) and passes the raw range in here so scoring and
// the panel above it agree on the same numbers, not two independently-
// computed ones (same discipline as WhyThisDealPanel's own comment on
// getDealSignal()).
//
// hasEnoughData mirrors priceInsight.ts's own MIN_OBSERVATION_DAYS_FOR_PRICE_INSIGHT
// gate exactly - "unknown is never negative" applies here too: a hotel
// with too little history contributes a neutral 0.5, never a penalty,
// same convention as cancellationScore's own unknown case below.
export interface MarketInsight {
  hasEnoughData: boolean;
  lowestSeen: number | null;
  highestSeen: number | null;
  averageSeen: number | null;
}

// Rebalanced 2026-09-07 to make room for MARKET without diluting price
// below where it still belongs as the dominant factor (a customer's
// single biggest question is still "how much"). Cancellation and
// reliability keep their same relative weight to each other; market
// takes its 5 points from price alone, not from every component evenly -
// a deliberate call, not a formula, same as the original three weights
// below (see their own history: this file's git log; not a tuned model).
const WEIGHTS = {
  price: 0.45,
  cancellation: 0.2,
  reliability: 0.15,
  market: 0.2,
};

export function scoreOffers(offers: ScorableOffer[], market: MarketInsight | null = null): ScoredOffer[] {
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

    // Market component: where this offer's price sits against the
    // lowest/highest this hotel has actually shown for this exact
    // check-in date recently (see priceInsight.ts) - 1.0 at or below the
    // lowest ever seen, 0.0 at or above the highest ever seen. Neutral
    // 0.5 (not a penalty) when there isn't enough history yet, same
    // "unknown is never negative" rule as cancellationScore above - a
    // brand-new hotel/date pair must never score worse for having no
    // track record of its own prices yet.
    const hasMarketData =
      market?.hasEnoughData === true && market.lowestSeen != null && market.highestSeen != null;
    let marketScore = 0.5;
    if (hasMarketData) {
      const lowestSeen = market!.lowestSeen as number;
      const highestSeen = market!.highestSeen as number;
      const averageSeen = market!.averageSeen as number;
      marketScore =
        highestSeen > lowestSeen
          ? Math.min(1, Math.max(0, (highestSeen - o.totalPrice) / (highestSeen - lowestSeen)))
          : o.totalPrice <= averageSeen
            ? 1
            : 0;
      if (o.totalPrice < averageSeen) {
        reasons.push({ text: "Below this hotel's recent observed average price", tone: "positive" });
      }
    } else {
      reasons.push({ text: "Not enough price history yet to compare against this hotel's own trend", tone: "neutral" });
    }

    const score =
      100 *
      (WEIGHTS.price * priceScore +
        WEIGHTS.cancellation * cancellationScore +
        WEIGHTS.reliability * reliabilityScore +
        WEIGHTS.market * marketScore);

    return { ...o, score: Math.round(score * 10) / 10, reasons, hasReliabilityData };
  });

  return scored.sort((a, b) => b.score - a.score);
}
