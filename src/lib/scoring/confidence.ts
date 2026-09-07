// The Verdict's second dimension, alongside Score - per Navin's spec
// (claude/travel-decision-platform-assessment.md, "RateManifest
// Intelligence / Verdict"): Score / Confidence / Reasons / Evidence /
// Limitations. Confidence is deliberately NOT another input blended into
// the 0-100 score in bestDealScore.ts - it answers a different question
// ("how much do we actually know backing this number?") from Score's own
// question ("how good is this deal?"). A great price from a single
// unconfirmed source with no supplier track record should read as a high
// score with LOW confidence, not get quietly folded into a lower score -
// that would be exactly the kind of manufactured certainty
// bestDealScore.ts's own "unknown is never negative" rule already refuses
// to do for the score itself. Keeping them separate means a customer can
// see "great deal, but we don't know much about it yet" as two honest
// facts instead of one blended, less legible number.
//
// Three yes/no signals, all already computed elsewhere for other reasons -
// nothing new is measured here, this only reads the existing facts and
// gives the combination a name:
//   1. Rate details fully confirmed (uncertainFieldCount === 0 - see
//      rateSnapshot.ts's buildVerifyBeforeBooking, the same list already
//      shown as the Verdict panel's own caveat line).
//   2. The top offer's supplier has real reliability history
//      (hasReliabilityData - bestDealScore.ts's own "new partner" flag).
//   3. More than one source was actually available to compare against -
//      comparing one offer to itself isn't a comparison, and StayingAPI's
//      google_hotels fallback (see stayingApiRefresh.ts's own history
//      comment) is the concrete example of why a single, uncorroborated
//      source deserves a visibly lower confidence, not silent trust.
export type ConfidenceTier = "high" | "medium" | "low";

export interface VerdictConfidence {
  tier: ConfidenceTier;
  label: string; // "High confidence" / "Medium confidence" / "Low confidence"
  // Short, honest, plain-language lines - one per signal above, whichever
  // way it actually went. Always three, always true; never omitted just
  // because the news is that something isn't known yet.
  reasons: string[];
}

export function getVerdictConfidence(input: {
  uncertainFieldCount: number;
  hasReliabilityData: boolean;
  sourcesComparedCount: number; // offers.length among the available offers (offers[0] included)
}): VerdictConfidence {
  const reasons: string[] = [];
  let points = 0;

  if (input.uncertainFieldCount === 0) {
    points += 1;
    reasons.push("Rate details fully confirmed by this source");
  } else {
    reasons.push(
      `${input.uncertainFieldCount} rate detail${input.uncertainFieldCount === 1 ? "" : "s"} not confirmed by this source`
    );
  }

  if (input.hasReliabilityData) {
    points += 1;
    reasons.push("Supplier has a track record on completed bookings");
  } else {
    reasons.push("New partner — no track record yet");
  }

  const otherSources = input.sourcesComparedCount - 1;
  if (otherSources >= 1) {
    points += 1;
    reasons.push(`Compared against ${otherSources} other source${otherSources === 1 ? "" : "s"}`);
  } else {
    reasons.push("Only one source had this rate available — no comparison possible");
  }

  const tier: ConfidenceTier = points === 3 ? "high" : points === 0 ? "low" : "medium";
  const label = tier === "high" ? "High confidence" : tier === "medium" ? "Medium confidence" : "Low confidence";

  return { tier, label, reasons };
}
