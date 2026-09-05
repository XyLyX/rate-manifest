"use client";

import { useEffect, useState } from "react";
import type { DisplayOffer } from "@/lib/search";
import { getDealSignal } from "@/lib/scoring/dealSignal";
import { buildDealFactors } from "@/lib/scoring/factors";
import { selectDeal } from "@/app/actions/trip";
import { TrackPrice } from "./TrackPrice";

interface ResultsListProps {
  searchId: string;
  hotelId: string;
  // The hotel's own city, carried as a hidden field into selectDeal() so
  // it can lazily create a trip row for a visitor who reached Check IQ
  // (Page 2) without ever submitting Page 1's Discover form - see
  // src/app/actions/trip.ts's own comment on that fallback.
  hotelCity: string;
  checkIn: string;
  checkOut: string;
  offers: DisplayOffer[];
  averageTotal: number | null;
  cheapestTotal: number | null;
  // Set only when this search was reached with a trip already in
  // progress (Page 1 was actually used) - "" otherwise, which
  // selectDeal() treats as "create one now." See page.tsx (Page 1) and
  // check-iq/page.tsx (Page 2).
  tripId: string;
  // The Decision Audit Trail row this exact search produced - see
  // src/lib/verdict.ts. Recorded on trip_selections so Page 4 can trace a
  // booking back to the Verdict that was on screen when it was chosen.
  verdictId: string | null;
}

export default function ResultsList({
  searchId,
  hotelId,
  hotelCity,
  checkIn,
  checkOut,
  offers,
  averageTotal,
  cheapestTotal,
  tripId,
  verdictId,
}: ResultsListProps) {
  return (
    <div className="offer-list">
      {offers.map((offer, idx) => (
        <OfferRow
          key={`${offer.supplierSlug}-${idx}`}
          searchId={searchId}
          hotelId={hotelId}
          hotelCity={hotelCity}
          checkIn={checkIn}
          checkOut={checkOut}
          offer={offer}
          isBest={idx === 0 && offers.length > 1}
          averageTotal={averageTotal}
          cheapestTotal={cheapestTotal}
          sourceLabel={`Source ${String.fromCharCode(65 + idx)}`}
          tripId={tripId}
          verdictId={verdictId}
        />
      ))}
    </div>
  );
}

// Deliberately neutral wording only - "Checked 7 min ago," never "LIVE,"
// "FRESH," or "VERIFIED." Those words claim something about the source
// (that it's currently live-checked, or reconfirmed) that isn't true yet:
// this is a read of when StayingAPI's cached response was last pulled,
// nothing more. See DECISIONS.md, "Freshness badge" - upgrading the
// wording to a verification claim is gated on a real recheck-at-click
// flow existing, not on how this string is phrased.
function formatAge(checkedAtIso: string): string {
  const ms = Date.now() - new Date(checkedAtIso).getTime();
  if (ms < 60000) return "just now";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Computed client-side, after mount, on purpose - rendering "X min ago"
// during server-side render risks a hydration mismatch against the
// moment the client actually paints, and there's no need to guess: an
// empty first paint that fills in a beat later is unnoticeable here and
// avoids the mismatch entirely, with no polling/timer to keep it "live."
function FreshnessBadge({ checkedAt }: { checkedAt: string | null }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(checkedAt ? formatAge(checkedAt) : null);
  }, [checkedAt]);

  if (!label) return null;
  return <span className="offer-freshness">Checked {label}</span>;
}

function OfferRow({
  searchId,
  hotelId,
  hotelCity,
  checkIn,
  checkOut,
  offer,
  isBest,
  averageTotal,
  cheapestTotal,
  sourceLabel,
  tripId,
  verdictId,
}: {
  searchId: string;
  hotelId: string;
  hotelCity: string;
  checkIn: string;
  checkOut: string;
  offer: DisplayOffer;
  isBest: boolean;
  averageTotal: number | null;
  cheapestTotal: number | null;
  sourceLabel: string;
  tripId: string;
  verdictId: string | null;
}) {
  const [revealed, setRevealed] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const signal = getDealSignal(offer.score);

  async function handleReveal() {
    setRevealed(true);
    try {
      await fetch("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId, hotelId, supplierSlug: offer.supplierSlug }),
      });
    } catch {
      // Logging is best-effort — never block the reveal on it.
    }
  }

  const savings = isBest && averageTotal && averageTotal > offer.totalPrice ? averageTotal - offer.totalPrice : 0;

  return (
    <div className={`offer-row${isBest ? " best" : ""}`}>
      <div className="deal-signal">
        <div className="deal-signal-caption">Rate Signal</div>
        <div
          className="deal-signal-ring"
          style={{ "--score": offer.score, "--ring-color": `var(${signal.colorVar})` } as React.CSSProperties}
        >
          <div className="deal-signal-ring-inner">{Math.round(offer.score)}</div>
        </div>
        <div className="deal-signal-label">
          <span className="deal-signal-dot" style={{ "--dot-color": `var(${signal.colorVar})` } as React.CSSProperties} />
          {signal.label}
        </div>
      </div>

      <div>
        <div className="offer-source">
          {revealed ? offer.supplierName : sourceLabel}
          {isBest && <span className="offer-badge">Best available offer</span>}
        </div>
        <FreshnessBadge checkedAt={offer.checkedAt} />
        <div className="offer-reasons">
          {offer.reasons.map((r, i) => (
            <span key={i} className={r.tone}>
              {r.text}
            </span>
          ))}
        </div>
        <div className="offer-row-actions">
          {/* Primary path (Page 2, "Select The Deal") - see
              claude/travel-decision-platform-assessment.md: this is what
              moves a customer on to Page 3 (Complete Your Trip) with
              RateManifest still in the loop, rather than exiting straight
              to the supplier. Available on every offer, not only the
              top-ranked one - a customer may reasonably prefer a
              different source (loyalty program, a card they want to use)
              even when it isn't the Rate Signal's own pick. */}
          <form action={selectDeal}>
            <input type="hidden" name="tripId" value={tripId} />
            <input type="hidden" name="hotelId" value={hotelId} />
            <input type="hidden" name="hotelCity" value={hotelCity} />
            <input type="hidden" name="checkIn" value={checkIn} />
            <input type="hidden" name="checkOut" value={checkOut} />
            <input type="hidden" name="verdictId" value={verdictId ?? ""} />
            <input type="hidden" name="supplierSlug" value={offer.supplierSlug} />
            <input type="hidden" name="supplierName" value={offer.supplierName} />
            <input type="hidden" name="totalPrice" value={offer.totalPrice} />
            <input type="hidden" name="currency" value="AED" />
            <input type="hidden" name="deepLink" value={offer.outboundUrl} />
            <button className="btn select-deal-btn" type="submit">
              Select this deal →
            </button>
          </form>

          {/* Secondary fallback - explicitly preserved per the final
              spec ("There can still be a secondary option... The guided
              journey should remain the primary UX"). Unchanged behavior,
              just visually demoted and relabeled from "View on X" to make
              clear it's the direct-exit path, not the recommended one. */}
          {!revealed && (
            <button className="btn btn-ghost reveal-btn" type="button" onClick={handleReveal}>
              Reveal deal
            </button>
          )}
          {revealed && (
            <a
              className="btn btn-ghost reveal-btn"
              href={offer.outboundUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              Book directly with {offer.supplierName} →
            </a>
          )}
          {isBest && (
            <button className="btn btn-ghost reveal-btn" type="button" onClick={() => setShowWhy((v) => !v)}>
              {showWhy ? "Hide analysis" : "Why this deal?"}
            </button>
          )}
        </div>

        {isBest && !revealed && cheapestTotal != null && (
          <div className="track-price">
            <TrackPrice hotelId={hotelId} checkIn={checkIn} checkOut={checkOut} baselineTotal={cheapestTotal} />
          </div>
        )}

        {isBest && showWhy && (
          <div className="why-panel">
            <div className="why-panel-title">Rate Manifest analysis</div>
            <table className="why-table">
              <tbody>
                {buildDealFactors(offer).map((f) => (
                  <tr key={f.label}>
                    <td>{f.label}</td>
                    <td>
                      <span
                        className={`why-dot ${f.positive === true ? "positive" : f.positive === false ? "negative" : "neutral"}`}
                      />
                      {f.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="why-verdict">
              <span className="why-verdict-label">Our verdict</span>
              {signal.verdict}
            </div>
          </div>
        )}
      </div>
      <div className="offer-price">
        <div className="offer-total">AED {Math.round(offer.totalPrice).toLocaleString("en-AE")}</div>
        <div className="offer-nightly">
          AED {Math.round(offer.nightlyPrice).toLocaleString("en-AE")}/night + AED{" "}
          {Math.round(offer.taxesFeesPerNight).toLocaleString("en-AE")} tax
        </div>
        {savings > 0 && (
          <div className="offer-nightly offer-save">
            Save AED {Math.round(savings).toLocaleString("en-AE")} vs. average
          </div>
        )}
      </div>
    </div>
  );
}
