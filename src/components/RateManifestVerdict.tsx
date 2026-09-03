import type { DisplayOffer } from "@/lib/search";
import { getDealSignal } from "@/lib/scoring/dealSignal";
import { buildDealFactors } from "@/lib/scoring/factors";

// Layer A #27, "RateManifest Verdict" - the same score/tier/verdict
// ResultsList.tsx already computes per-offer (behind the best offer's
// "Why this deal?" toggle) promoted to a page-level summary a visitor sees
// without clicking anything. This is deliberately NOT a second, different
// number - it reads the same top-ranked DisplayOffer (offers[0] from
// scoreOffers(), see bestDealScore.ts) and the same getDealSignal()/
// buildDealFactors() every other verdict on this page uses. Two different
// "our recommendation" numbers on one page would be its own kind of
// dishonesty.
export function RateManifestVerdict({ offer, sourcesChecked }: { offer: DisplayOffer; sourcesChecked: number }) {
  const signal = getDealSignal(offer.score);
  const positiveFactors = buildDealFactors(offer).filter((f) => f.positive === true);

  return (
    <div className="rate-verdict-panel" style={{ "--ring-color": `var(${signal.colorVar})` } as React.CSSProperties}>
      <div className="rate-verdict-ring" style={{ "--score": offer.score } as React.CSSProperties}>
        <div className="rate-verdict-ring-inner">{Math.round(offer.score)}</div>
      </div>
      <div className="rate-verdict-body">
        <div className="rate-verdict-eyebrow">RateManifest Verdict</div>
        <div className="rate-verdict-headline">{signal.verdict}</div>
        {positiveFactors.length > 0 && (
          <ul className="rate-verdict-factors">
            {positiveFactors.map((f) => (
              <li key={f.label}>{f.text}</li>
            ))}
          </ul>
        )}
        <div className="rate-verdict-footnote">
          Based on {sourcesChecked} source{sourcesChecked === 1 ? "" : "s"} checked for these dates — price,
          cancellation terms, and supplier track record where we have it.
        </div>
      </div>
    </div>
  );
}
