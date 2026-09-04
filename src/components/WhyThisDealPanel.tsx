import type { DisplayOffer } from "@/lib/search";
import { buildDealFactors } from "@/lib/scoring/factors";

// Step 4, "WHY THIS DEAL?" - a short checklist of reasons to like the
// top-ranked offer, always built from buildDealFactors() (the same
// factor list ResultsList's per-offer "Why this deal?" toggle and
// RateManifestVerdict both read - one function, one set of honest rules,
// never three copies that could drift). Only the factors actually true
// for this offer show up - "only display things you actually know" is
// the whole design brief here, not a caveat on top of it. A hasEnoughData
// price-standing line (from PriceInsightPanel's own logic) is passed in
// separately since bestDealScore.ts's per-search factors have no
// visibility into historical price_history at all.
export function WhyThisDealPanel({
  offer,
  belowHistoricalAverage,
}: {
  offer: DisplayOffer;
  // true only when priceInsight.hasEnoughData AND the current total sits
  // below the observed average - null/false show nothing here rather
  // than a fabricated claim.
  belowHistoricalAverage: boolean;
}) {
  const positiveFactors = buildDealFactors(offer).filter((f) => f.positive === true);

  return (
    <div className="why-deal-panel">
      <div className="why-deal-title">Why RateManifest likes this rate</div>
      <ul className="why-deal-list">
        <li>Rate was successfully verified</li>
        {belowHistoricalAverage && <li>Current price is below the property&apos;s recent observed average</li>}
        {positiveFactors.map((f) => (
          <li key={f.label}>{f.text}</li>
        ))}
      </ul>
    </div>
  );
}
