import type { DisplayOffer } from "@/lib/search";
import { getDealSignal } from "@/lib/scoring/dealSignal";

// Layer A #27, "RateManifest Verdict" - the final screen of the
// Intelligence journey, not a mid-page summary. Moved here from just
// under the Verified Rate panel to the end of /search 2026-09-03, per the
// canonical flow: Your Hotel -> Rate Verified -> Is This A Good Price? ->
// Why This Deal -> Where To Book -> RateManifest Verdict -> Before You
// Book -> Book. The per-offer factor checklist that used to live inside
// this component moved to its own WhyThisDealPanel, positioned earlier in
// that flow - this component now stays deliberately simple, matching the
// "big, calm verdict" example in the product spec rather than repeating
// the same checklist twice on one page.
//
// Still reads the same top-ranked DisplayOffer (offers[0] from
// scoreOffers(), see bestDealScore.ts) and the same getDealSignal() every
// other verdict on this page uses - two different "our recommendation"
// numbers on one page would be its own kind of dishonesty.
export function RateManifestVerdict({
  offer,
  hotelName,
  sourcesChecked,
}: {
  offer: DisplayOffer;
  hotelName: string;
  sourcesChecked: number;
}) {
  const signal = getDealSignal(offer.score);

  return (
    <div className="rate-verdict-panel" style={{ "--ring-color": `var(${signal.colorVar})` } as React.CSSProperties}>
      <div className="rate-verdict-ring" style={{ "--score": offer.score } as React.CSSProperties}>
        <div className="rate-verdict-ring-inner">{Math.round(offer.score)}</div>
      </div>
      <div className="rate-verdict-body">
        <div className="rate-verdict-eyebrow">RateManifest Verdict</div>
        <div className="rate-verdict-hotel">
          {hotelName} · AED {Math.round(offer.totalPrice).toLocaleString("en-AE")}
        </div>
        <div className="rate-verdict-headline">{signal.verdict}</div>
        <div className="rate-verdict-footnote">
          Based on {sourcesChecked} source{sourcesChecked === 1 ? "" : "s"} checked for these dates — price,
          cancellation terms, and supplier track record where we have it.
        </div>
      </div>
    </div>
  );
}
