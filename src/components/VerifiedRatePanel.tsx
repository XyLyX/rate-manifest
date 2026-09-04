"use client";

import { useEffect, useState } from "react";

// The dominant "did we actually check" panel at the top of a real hotel's
// results - Layer A #1, Rate Verification, promoted from the small mono
// "N sources checked" line to something a visitor sees without reading
// closely. Built 2026-09-03 alongside PriceInsightPanel and
// RateManifestVerdict - see DECISIONS.md, "Phase 1 (Layer A): Verified
// Rate panel, Is this a good price?, RateManifest Verdict (2026-09-03)."
//
// Three honest states, matching the three real outcomes
// ensureLiveCheckTriggered() can leave a real hotel/date pair in
// (src/lib/suppliers/stayingApiRefresh.ts) - never a fourth, invented
// "checking harder" state. Mock hotels don't render this at all: the
// existing .demo-banner already says the prices are simulated, and a
// "Verified" badge next to simulated data would contradict it in the same
// breath.
//
//   verified        - a StayingAPI cache row exists and returned at least
//                      one available offer.
//   no-availability - a StayingAPI cache row exists (so the check DID
//                      happen) but nothing came back available. Distinct
//                      from not-checked - this is a real, checked answer,
//                      just not a useful one.
//   not-checked     - no cache row exists and the live attempt just failed
//                      (StayingAPI credentials, credits, or the API
//                      itself). This is the state the live site shows
//                      today for any never-before-seen date pair, since
//                      the account's StayingAPI credit balance is at zero
//                      as of 2026-09-03 (see DECISIONS.md, "StayingAPI
//                      live-check failures - root cause confirmed: credits
//                      exhausted"). Deliberately NOT phrased as an error or
//                      a red/alarm color - nothing is broken from a
//                      visitor's point of view, this property simply
//                      hasn't been checked yet.
export type VerifiedRateState = "verified" | "no-availability" | "not-checked";

interface VerifiedRatePanelProps {
  state: VerifiedRateState;
  sourcesChecked: number;
  checkedAt: string | null;
  // Only meaningful (and only passed) in the "verified" state - the
  // cheapest available total and the stay length it covers, so this panel
  // can lead with the actual number ("AED X for N nights") rather than
  // just a source count. Null-safe: renders without a price line if
  // either is missing for some reason.
  cheapestTotal: number | null;
  nights: number | null;
}

// Same "compute after mount" pattern as ResultsList's FreshnessBadge, and
// for the same reason - rendering a relative "X min ago" string during
// server-side render risks a hydration mismatch against the moment the
// client actually paints.
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

export function VerifiedRatePanel({ state, sourcesChecked, checkedAt, cheapestTotal, nights }: VerifiedRatePanelProps) {
  const [age, setAge] = useState<string | null>(null);

  useEffect(() => {
    setAge(checkedAt ? formatAge(checkedAt) : null);
  }, [checkedAt]);

  if (state === "verified") {
    return (
      <div className="verified-rate-panel verified">
        <span className="verified-rate-icon verified" aria-hidden="true">
          ✓
        </span>
        <div>
          <div className="verified-rate-title">Verified Rate</div>
          <div className="verified-rate-stats">
            {cheapestTotal != null && nights != null && (
              <span className="verified-rate-stat verified-rate-stat-price">
                AED {Math.round(cheapestTotal).toLocaleString("en-AE")} for {nights} night{nights === 1 ? "" : "s"}
              </span>
            )}
            <span className="verified-rate-stat">Availability confirmed</span>
            <span className="verified-rate-stat">
              {sourcesChecked} source{sourcesChecked === 1 ? "" : "s"} compared
            </span>
            <span className="verified-rate-stat">{age ? `Checked ${age}` : "Checked"}</span>
          </div>
        </div>
      </div>
    );
  }

  if (state === "no-availability") {
    return (
      <div className="verified-rate-panel neutral">
        <span className="verified-rate-icon neutral" aria-hidden="true">
          i
        </span>
        <div>
          <div className="verified-rate-title">Checked, nothing available</div>
          <div className="verified-rate-sub">
            {age ? `Checked ${age}` : "Checked"} — no availability came back across the sources we compared for
            these exact dates.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="verified-rate-panel pending">
      <span className="verified-rate-icon pending" aria-hidden="true">
        ⏱
      </span>
      <div>
        <div className="verified-rate-title">Not checked yet</div>
        <div className="verified-rate-sub">
          We couldn&apos;t run a real-time check for these exact dates just now. This isn&apos;t about this
          property — try again in a moment, or try different dates.
        </div>
      </div>
    </div>
  );
}
