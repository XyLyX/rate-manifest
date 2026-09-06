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
  // 2026-09-05 (Navin's "Handling Missing Rate Conditions" spec, section
  // 5): the labels of whatever Rate Snapshot fields came back unknown for
  // this offer (see rateSnapshot.ts's buildVerifyBeforeBooking) - e.g.
  // ["Breakfast / meals", "Rate plan", "Payment"]. Rendered as a second,
  // explicit caveat line so the score/verdict above never reads as more
  // certain than the data actually backing it. Empty when nothing is
  // unknown (a source that confirmed everything gets no caveat at all).
  uncertainFields = [],
}: {
  offer: DisplayOffer;
  hotelName: string;
  sourcesChecked: number;
  uncertainFields?: string[];
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
        {uncertainFields.length > 0 && (
          <div className="rate-verdict-caveat">
            This source didn&apos;t confirm {uncertainFields.join(", ").toLowerCase()} — verify these directly
            before booking.
          </div>
        )}
      </div>
    </div>
  );
}
