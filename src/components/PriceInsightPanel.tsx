import type { PriceInsight } from "@/lib/priceInsight";
import { MIN_OBSERVATION_DAYS_FOR_PRICE_INSIGHT } from "@/lib/constants";

// "Is this a good price?" - Layer A #3/#4 on the master feature list,
// reading src/lib/priceInsight.ts's aggregation of the real price_history
// ledger. Server component: every number here is already computed, no
// client-side relative-time formatting needed the way VerifiedRatePanel's
// "checked X ago" does.
//
// The sparse-data branch is the point of this component, not a fallback
// bolted on afterward - see DECISIONS.md, "Phase 1 (Layer A)": "If
// historical data isn't sufficient, don't manufacture a score... that is
// actually more trustworthy than some fake 92/100 AI score." Most
// properties will show this branch at launch, since price_history only
// accumulates from real searches against this exact check-in date - that
// is the honest starting state, not a bug to hide.

// A plain-language headline once there's a real range to judge the
// current price against - NOT a second, separate scoring system.
// Deliberately built from the exact same percentVsAverage number the
// paragraph below already states, just labeled - this is a legible
// restatement of one honest number, not a fabricated "92/100." Reuses
// the same --signal-good/--signal-fair/--signal-wait vocabulary the
// per-offer Rate Signal and RateManifest Verdict use, since it's the
// same three-way "good/fair/weak" idea applied to a different question
// (price vs. history, not price+cancellation+reliability combined).
function priceStanding(percentVsAverage: number): { label: string; colorVar: string } {
  if (percentVsAverage >= 10) return { label: "Strong price", colorVar: "--signal-good" };
  if (percentVsAverage >= 0) return { label: "Good price", colorVar: "--signal-good" };
  if (percentVsAverage >= -10) return { label: "Typical price", colorVar: "--signal-fair" };
  return { label: "Above the average we've seen", colorVar: "--signal-wait" };
}

export function PriceInsightPanel({ insight }: { insight: PriceInsight }) {
  if (!insight.hasEnoughData) {
    return (
      <div className="price-insight-panel sparse">
        <div className="price-insight-title">Is this a good price?</div>
        <p className="price-insight-body">
          {insight.observationDays === 0
            ? "We don't have price history for this property on these exact dates yet."
            : `We've only observed this property on these dates ${insight.observationDays} time${insight.observationDays === 1 ? "" : "s"} so far.`}{" "}
          We need at least {MIN_OBSERVATION_DAYS_FOR_PRICE_INSIGHT} separate days of observation before we&apos;ll
          show a price range here — a range built from too few data points would be a guess dressed up as a fact.
        </p>
      </div>
    );
  }

  const { observationDays, lowestSeen, highestSeen, averageSeen, percentVsAverage } = insight;
  const standing = percentVsAverage != null ? priceStanding(percentVsAverage) : null;

  return (
    <div className="price-insight-panel">
      <div className="price-insight-title">Is this a good price?</div>
      {standing && (
        <div className="price-insight-standing" style={{ "--standing-color": `var(${standing.colorVar})` } as React.CSSProperties}>
          {standing.label}
        </div>
      )}
      <p className="price-insight-body">
        Over {observationDays} separate days we&apos;ve checked this property on these exact dates, the cheapest
        available total has ranged from AED {Math.round(lowestSeen ?? 0).toLocaleString("en-AE")} to AED{" "}
        {Math.round(highestSeen ?? 0).toLocaleString("en-AE")}, averaging AED{" "}
        {Math.round(averageSeen ?? 0).toLocaleString("en-AE")}.
        {percentVsAverage != null && percentVsAverage > 0 && (
          <> The best offer right now is {percentVsAverage}% below that average.</>
        )}
        {percentVsAverage != null && percentVsAverage < 0 && (
          <> The best offer right now is {Math.abs(percentVsAverage)}% above that average.</>
        )}
        {percentVsAverage === 0 && <> The best offer right now matches that average.</>}
      </p>
      <div className="price-insight-stats">
        <div>
          <span className="price-insight-stat-label">Lowest seen</span>
          <span className="price-insight-stat-value">AED {Math.round(lowestSeen ?? 0).toLocaleString("en-AE")}</span>
        </div>
        <div>
          <span className="price-insight-stat-label">Average seen</span>
          <span className="price-insight-stat-value">AED {Math.round(averageSeen ?? 0).toLocaleString("en-AE")}</span>
        </div>
        <div>
          <span className="price-insight-stat-label">Highest seen</span>
          <span className="price-insight-stat-value">AED {Math.round(highestSeen ?? 0).toLocaleString("en-AE")}</span>
        </div>
      </div>
    </div>
  );
}
