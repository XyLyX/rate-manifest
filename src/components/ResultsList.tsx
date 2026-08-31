"use client";

import { useState } from "react";
import type { DisplayOffer } from "@/lib/search";
import { getDealSignal } from "@/lib/scoring/dealSignal";
import { TrackPrice } from "./TrackPrice";

interface ResultsListProps {
  searchId: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  offers: DisplayOffer[];
  averageTotal: number | null;
  cheapestTotal: number | null;
}

export default function ResultsList({
  searchId,
  hotelId,
  checkIn,
  checkOut,
  offers,
  averageTotal,
  cheapestTotal,
}: ResultsListProps) {
  return (
    <div className="offer-list">
      {offers.map((offer, idx) => (
        <OfferRow
          key={`${offer.supplierSlug}-${idx}`}
          searchId={searchId}
          hotelId={hotelId}
          checkIn={checkIn}
          checkOut={checkOut}
          offer={offer}
          isBest={idx === 0 && offers.length > 1}
          averageTotal={averageTotal}
          cheapestTotal={cheapestTotal}
          sourceLabel={`Source ${String.fromCharCode(65 + idx)}`}
        />
      ))}
    </div>
  );
}

// Factors shown in "Why this deal?" — every one of these is backed by a
// real field on the offer. Deliberately does NOT include breakfast/board
// basis: that isn't tracked anywhere in the supplier adapter data model
// yet, and showing a green "Breakfast included" tick with nothing behind
// it would be exactly the kind of fabricated signal DECISIONS.md rules
// out. Room "equivalence" is safe to state as a structural fact — every
// offer compared here is already for the same normalized room type, by
// construction, before scoring ever runs (see bestDealScore.ts).
function buildFactors(offer: DisplayOffer) {
  const isCheapest = offer.reasons.some((r) => r.text.startsWith("Lowest total price"));
  return [
    {
      label: "Price",
      positive: isCheapest,
      text: isCheapest ? "Lowest total price of the offers checked" : "Within the range of offers checked",
    },
    {
      label: "Cancellation",
      positive: offer.isFreeCancellation,
      text: offer.isFreeCancellation ? "Free cancellation" : "Non-refundable",
    },
    {
      label: "Taxes & fees",
      positive: true,
      text: "Included in the total shown",
    },
    {
      label: "Room",
      positive: true,
      text: "Same normalized room type across every offer compared",
    },
    {
      label: "Supplier",
      positive: offer.hasReliabilityData ? (offer.reliabilityScore ?? 0) >= 0.8 : null,
      text: offer.hasReliabilityData
        ? (offer.reliabilityScore ?? 0) >= 0.8
          ? "Strong track record on completed bookings"
          : "Reliability data available, mixed track record"
        : "New partner — reliability data building",
    },
  ];
}

function OfferRow({
  searchId,
  hotelId,
  checkIn,
  checkOut,
  offer,
  isBest,
  averageTotal,
  cheapestTotal,
  sourceLabel,
}: {
  searchId: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  offer: DisplayOffer;
  isBest: boolean;
  averageTotal: number | null;
  cheapestTotal: number | null;
  sourceLabel: string;
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
        <div className="offer-reasons">
          {offer.reasons.map((r, i) => (
            <span key={i} className={r.tone}>
              {r.text}
            </span>
          ))}
        </div>
        <div className="offer-row-actions">
          {!revealed && (
            <button className="btn btn-ghost reveal-btn" type="button" onClick={handleReveal}>
              Reveal deal
            </button>
          )}
          {revealed && (
            <a
              className="btn reveal-btn"
              href={offer.outboundUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", textDecoration: "none" }}
            >
              View on {offer.supplierName} →
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
                {buildFactors(offer).map((f) => (
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
