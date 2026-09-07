import type { DisplayOffer } from "@/lib/search";
import { getDealSignal } from "@/lib/scoring/dealSignal";
import { getVerdictConfidence } from "@/lib/scoring/confidence";

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
  // 2026-09-07: the same available-offers array ResultsList renders as
  // "Where to book," in the same order - added so this panel can show its
  // own Evidence and Confidence (see below) without inventing a second,
  // possibly-divergent comparison set. offers[0] is always === offer.
  offers,
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
  offers: DisplayOffer[];
  hotelName: string;
  sourcesChecked: number;
  uncertainFields?: string[];
}) {
  const signal = getDealSignal(offer.score);
  // 2026-09-07: "Confidence" - the second thing the spec's Verdict section
  // calls for alongside Score (Score/Confidence/Reasons/Evidence/
  // Limitations - see confidence.ts's own comment for why this is a
  // separate axis from the 0-100 score, not blended into it).
  const confidence = getVerdictConfidence({
    uncertainFieldCount: uncertainFields.length,
    hasReliabilityData: offer.hasReliabilityData,
    sourcesComparedCount: offers.length,
  });

  return (
    <div className="rate-verdict-panel" style={{ "--ring-color": `var(${signal.colorVar})` } as React.CSSProperties}>
      <div className="rate-verdict-ring" style={{ "--score": offer.score } as React.CSSProperties}>
        <div className="rate-verdict-ring-inner">{Math.round(offer.score)}</div>
      </div>
      <div className="rate-verdict-body">
        <div className="rate-verdict-eyebrow">
          RateManifest Verdict
          <span className={`rate-verdict-confidence rate-verdict-confidence-${confidence.tier}`}>
            {" "}· {confidence.label}
          </span>
        </div>
        {/* 2026-09-06: the fixed BOOK NOW / WATCH / CONSIDER ALTERNATIVE
            vocabulary (dealSignal.ts's own VerdictAction) was built for
            exactly this panel - "the four-page journey's Check IQ page
            (Page 2) needs [this] to collapse to one of exactly three
            decision words" - but was only ever wired up to Page 4's
            Confirm summary (confirm-verdict-action there). Added here so
            Page 2 actually shows the word the spec calls for, not just the
            softer prose sentence below it. Same tier-color classes as
            Page 4's badge (rate-verdict-action-{tier}), reusing the exact
            strong/good/fair/weak palette so the two pages agree visually. */}
        <div className={`rate-verdict-action rate-verdict-action-${signal.tier}`}>{signal.action}</div>
        <div className="rate-verdict-hotel">
          {hotelName} · {offer.currency} {Math.round(offer.totalPrice).toLocaleString("en-AE")}
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
        {/* Confidence's own reasons - only shown when confidence isn't
            already high, same "only display caveats when something's
            actually uncertain" rule the caveat block above follows. A
            fully-confirmed, well-compared, track-recorded offer doesn't
            need three lines explaining why it's trustworthy. */}
        {confidence.tier !== "high" && (
          <div className="rate-verdict-confidence-reasons">{confidence.reasons.join(" · ")}</div>
        )}
        {/* 2026-09-07: "Evidence" - the fourth thing the spec's Verdict
            section calls for. Every compared offer was already being
            written to the Decision Audit Trail (verdict.ts's
            evidenceJson) and shown further up the page in "Where to
            book," but never tied back to the verdict itself - a reader
            who scrolled straight to this panel had no way to see what it
            was actually weighed against. Reuses ResultsList's exact same
            Source A/B/C labels, same array, same order, same
            reveal-gating (no supplier name here regardless of reveal
            state - this table only ever shows the anonymized label, same
            as ResultsList before a reveal) so the two sections describe
            one comparison, not two. Only rendered when there's more than
            one offer to compare - a single source has nothing to be
            "evidence" against, see the confidence reasons line above for
            that case instead. */}
        {offers.length > 1 && (
          <div className="rate-verdict-evidence">
            <div className="rate-verdict-evidence-title">Evidence — {offers.length} sources compared</div>
            <table className="rate-verdict-evidence-table">
              <tbody>
                {offers.map((o, idx) => (
                  <tr key={`${o.supplierSlug}-${idx}`} className={idx === 0 ? "rate-verdict-evidence-top" : undefined}>
                    <td>
                      Source {String.fromCharCode(65 + idx)}
                      {idx === 0 ? " · this offer" : ""}
                    </td>
                    <td>
                      {o.currency} {Math.round(o.totalPrice).toLocaleString("en-AE")}
                    </td>
                    <td>{Math.round(o.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
