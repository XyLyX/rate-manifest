"use client";

import { useState } from "react";
import Link from "next/link";
import type { DiscoveredHotel } from "@/lib/discovery";

const MAX_SELECTION = 5;

interface HotelSelectionGridProps {
  hotels: DiscoveredHotel[];
  checkIn: string;
  checkOut: string;
  tripId: string;
}

// Page 1 (Discover)'s hotel shortlist, rebuilt 2026-09-12 to match the
// frozen Discover -> Compare -> Verify journey (claude/discovery-property-
// graph-architecture.md, "FROZEN 2026-09-12," Sections 1-2, 11). Before
// this, every card's "Check IQ ->" button linked straight into the
// (credit-safe but still skip-ahead) live-verification page - there was no
// Page 2 to receive a selection. That direct link is gone: a card now
// toggles selection, up to five, and a single "Compare selected" action
// carries the chosen properties into the new /compare page (Page 2).
//
// 2026-09-13 (user feedback): restructured so the primary action per card
// is "Check IQ →" (a direct link to /check-iq with dates/trip already in
// the URL) and "Shortlist" is the secondary toggle that feeds the compare
// flow. Cards are now div-based (not button-based) to allow both a Link and
// a toggle button as siblings without nesting interactive elements. CSS in
// track-f.css makes every card the same height by pushing the action row to
// the bottom. No new data fields added - only the four reliable fields
// (name, area, star rating, image placeholder) are shown; UNAVAILABLE rows
// are omitted entirely rather than surfaced as "Not available" clutter.
export function HotelSelectionGrid({ hotels, checkIn, checkOut, tripId }: HotelSelectionGridProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [limitNotice, setLimitNotice] = useState(false);

  function toggle(hotelId: string) {
    setSelected((current) => {
      if (current.includes(hotelId)) {
        setLimitNotice(false);
        return current.filter((id) => id !== hotelId);
      }
      // Frozen rule (Section 2): on a 6th attempt, block and tell the
      // visitor to remove one first - never silently replace an existing
      // selection (that would change their choice without them noticing).
      if (current.length >= MAX_SELECTION) {
        setLimitNotice(true);
        return current;
      }
      setLimitNotice(false);
      return [...current, hotelId];
    });
  }

  const tripQuery = tripId ? `&trip=${tripId}` : "";
  const compareHref =
    `/compare?hotels=${selected.join(",")}` +
    `&checkin=${checkIn}&checkout=${checkOut}` +
    tripQuery;

  return (
    <div className="hotel-selection">
      <div className="hotel-grid home-hotel-grid">
        {hotels.map((hotel) => {
          const isSelected = selected.includes(hotel.id);
          const checkIqHref = `/check-iq?hotel=${hotel.id}&checkin=${checkIn}&checkout=${checkOut}${tripQuery}`;
          return (
            <div
              key={hotel.id}
              className={isSelected ? "hotel-card home-hotel-card hotel-card-selected" : "hotel-card home-hotel-card"}
            >
              <div className="home-hotel-card-image" aria-hidden="true">
                <span>{hotel.name.charAt(0)}</span>
              </div>
              {hotel.isMockData && <span className="hotel-card-demo">Demo</span>}

              <div className="hotel-card-name">{hotel.name}</div>
              <div className="hotel-card-meta">
                {hotel.area} · {hotel.starRating}-star
              </div>

              {/* Two actions; primary (Check IQ) and secondary (Shortlist).
                  "Deliberately no price here" - same frozen Section 2/3 rule
                  as before. Card is a div (not a button) so the Link and the
                  toggle button can coexist without nesting interactive
                  elements inside one another. */}
              <div className="hotel-card-actions">
                <Link href={checkIqHref} className="btn btn-block hotel-card-check-iq">
                  Check IQ →
                </Link>
                <button
                  type="button"
                  className={
                    isSelected
                      ? "btn-ghost btn-sm hotel-card-shortlist hotel-card-shortlist-on"
                      : "btn-ghost btn-sm hotel-card-shortlist"
                  }
                  onClick={() => toggle(hotel.id)}
                  aria-pressed={isSelected}
                >
                  {isSelected ? "✓ Shortlisted" : "Shortlist"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="compare-action-bar">
          <div className="compare-action-count">
            {selected.length} hotel{selected.length === 1 ? "" : "s"} shortlisted.
            {limitNotice && (
              <span> You can compare up to {MAX_SELECTION} at a time — remove one to add another.</span>
            )}
          </div>
          <Link href={compareHref} className="btn compare-action-cta">
            Compare {selected.length} hotel{selected.length === 1 ? "" : "s"} side by side →
          </Link>
        </div>
      )}
    </div>
  );
}
