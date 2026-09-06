"use client";

import { useState } from "react";

interface TrackPriceProps {
  hotelId: string;
  checkIn: string;
  checkOut: string;
  baselineTotal: number;
  // Display-only, matching whatever currency the offer being tracked is
  // actually priced in (2026-09-06 fix - was hardcoded "AED" before,
  // matching everything else on this page at the time). Not persisted -
  // priceTracking rows have no currency column since every tracked price
  // is only ever compared against later totals from the same currency
  // source, never displayed back out of the database directly except on
  // /admin/price-alerts, which still assumes AED (see that page's own
  // comment).
  currency: string;
}

// Offered on the best offer's card for anyone not booking right now — see
// DECISIONS.md, "Price tracking." Asks for exactly two things: an email,
// and the customer's own minimum-drop threshold (their call, not a global
// site setting).
export function TrackPrice({ hotelId, checkIn, checkOut, baselineTotal, currency }: TrackPriceProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [minDropAed, setMinDropAed] = useState("50");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(null);
    try {
      const res = await fetch("/api/track-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          checkIn,
          checkOut,
          email,
          minDropAed: Number(minDropAed),
          baselineTotal,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong — try again.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("Couldn't reach the server — try again.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="track-price-done">
        Tracking this price — we&apos;ll flag it once it drops by at least {currency} {minDropAed} from {currency}{" "}
        {Math.round(baselineTotal).toLocaleString("en-AE")}.
      </p>
    );
  }

  if (!open) {
    return (
      <button className="btn btn-ghost reveal-btn" type="button" onClick={() => setOpen(true)}>
        Not booking now? Track this price →
      </button>
    );
  }

  return (
    <form className="track-price-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="track-email">Your email</label>
        <input
          id="track-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className="field">
        <label htmlFor="track-min-drop">Notify me if it drops by at least ({currency})</label>
        <input
          id="track-min-drop"
          type="number"
          min={1}
          step={1}
          required
          value={minDropAed}
          onChange={(e) => setMinDropAed(e.target.value)}
        />
      </div>
      <button className="btn" type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? "Saving…" : "Start tracking"}
      </button>
      {error && <p className="track-price-error">{error}</p>}
    </form>
  );
}
