"use client";

import { useEffect, useState } from "react";
import type { DisplayOffer } from "@/lib/search";

// Steps 8-9, "Recheck Before Booking" and "Book" - the final confirmation
// screen. The checklist is built entirely from fields already on the page
// (hotel, dates, occupancy, room, the top offer's own cancellation/price) -
// nothing new is fetched or fabricated for it.
//
// "Recheck Before Booking" is deliberately honest about what this app can
// actually do today: there is no force-refresh/cache-invalidation
// mechanism anywhere in the StayingAPI integration (see
// stayingApiRefresh.ts - ensureLiveCheckTriggered only ever fires a live
// call when NO cache row exists yet for a hotel/date pair; once one
// exists, every later visit reads the same cached row, however old).
// Wiring a real "recheck" that forces a brand-new paid StayingAPI call on
// a visitor's click is a real, separate feature with its own cost/abuse
// tradeoffs (do we rate-limit it? does a visitor get to trigger paid
// calls at will while credits are scarce?) - not something to quietly
// invent here. So this reload link is exactly what it says: it re-renders
// this page, which shows the same verified check already on file rather
// than claiming to run a new one. See DECISIONS.md, "The Analyse This
// Hotel gate."
interface BeforeYouBookPanelProps {
  hotelName: string;
  checkIn: string;
  checkOut: string;
  occupancy: number;
  roomTypeLabel: string;
  offer: DisplayOffer;
  checkedAt: string | null;
  currentUrl: string;
}

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

export function BeforeYouBookPanel({
  hotelName,
  checkIn,
  checkOut,
  occupancy,
  roomTypeLabel,
  offer,
  checkedAt,
  currentUrl,
}: BeforeYouBookPanelProps) {
  const [age, setAge] = useState<string | null>(null);

  useEffect(() => {
    setAge(checkedAt ? formatAge(checkedAt) : null);
  }, [checkedAt]);

  const items = [
    { label: "Hotel", value: hotelName },
    { label: "Dates", value: `${checkIn} → ${checkOut}` },
    { label: "Guests", value: `${occupancy} adult${occupancy === 1 ? "" : "s"}` },
    { label: "Room", value: roomTypeLabel },
    { label: "Cancellation", value: offer.isFreeCancellation ? "Free cancellation" : "Non-refundable" },
    { label: "Total price", value: `AED ${Math.round(offer.totalPrice).toLocaleString("en-AE")}` },
    { label: "Rate verified", value: age ? `Checked ${age}` : "Checked" },
  ];

  return (
    <div className="before-you-book-panel">
      <div className="before-you-book-title">Before you book</div>
      <ul className="before-you-book-list">
        {items.map((item) => (
          <li key={item.label}>
            <span className="before-you-book-check" aria-hidden="true">
              ✓
            </span>
            <span className="before-you-book-label">{item.label}</span>
            <span className="before-you-book-value">{item.value}</span>
          </li>
        ))}
      </ul>
      <div className="before-you-book-recheck">
        <div className="before-you-book-recheck-title">Recheck before booking</div>
        <p className="before-you-book-recheck-body">
          This is the rate we last verified{age ? ` (${age})` : ""}. Prices can move between browsing and
          booking — reload this page for the latest check we have on file before you commit.
        </p>
        <a className="btn btn-ghost" href={currentUrl}>
          Reload for the latest check
        </a>
      </div>
      <p className="before-you-book-footnote">
        Ready to book? Reveal an offer above and you&apos;ll go straight to that source&apos;s own site to
        complete the booking — Rate Manifest never takes payment or holds your reservation.
      </p>
    </div>
  );
}
