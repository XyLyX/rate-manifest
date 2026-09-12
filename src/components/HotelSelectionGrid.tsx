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
// Selection lives in plain component state, not the URL, while the visitor
// is still choosing - only submitted to /compare as a query string once
// they've decided (see buildCompareHref below). Nothing here calls
// StayingAPI or any other paid resource - the frozen "critical rule" for
// Page 1 - this component only ever toggles which ids are selected.
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

  const compareHref =
    `/compare?hotels=${selected.join(",")}` +
    `&checkin=${checkIn}&checkout=${checkOut}` +
    (tripId ? `&trip=${tripId}` : "");

  return (
    <div className="hotel-selection">
      <div className="hotel-grid home-hotel-grid">
        {hotels.map((hotel) => {
          const isSelected = selected.includes(hotel.id);
          return (
            <button
              key={hotel.id}
              type="button"
              className={isSelected ? "hotel-card home-hotel-card hotel-card-selected" : "hotel-card home-hotel-card"}
              aria-pressed={isSelected}
              onClick={() => toggle(hotel.id)}
            >
              <div className="home-hotel-card-image" aria-hidden="true">
                <span>{hotel.name.charAt(0)}</span>
              </div>
              {hotel.isMockData && <span className="hotel-card-demo">Demo</span>}
              {isSelected && (
                <span className="hotel-card-selected-badge" aria-hidden="true">
                  ✓ Selected
                </span>
              )}
              <div className="hotel-card-name">{hotel.name}</div>
              <div className="hotel-card-meta">
                {hotel.area} · {hotel.starRating}-star
              </div>
              {/* Deliberately no price here either - same 2026-09-05 rule
                  as before, now also the frozen Section 2/3 "never render
                  price on Page 1" rule. */}
              <span className={isSelected ? "btn btn-block hotel-card-toggle active" : "btn-ghost btn-block hotel-card-toggle"}>
                {isSelected ? "Remove from compare" : "Add to compare"}
              </span>
            </button>
          );
        })}
      </div>

      {hotels.length === 0 ? null : (
        <div className="compare-action-bar">
          <div className="compare-action-count">
            {selected.length === 0
              ? "Select up to 5 hotels to compare."
              : `${selected.length} of ${MAX_SELECTION} selected.`}
          </div>
          {limitNotice && (
            <div className="compare-action-limit">
              You can compare up to {MAX_SELECTION} hotels at a time — remove one to add another.
            </div>
          )}
          {selected.length > 0 ? (
            <Link href={compareHref} className="btn compare-action-cta">
              Compare {selected.length} hotel{selected.length === 1 ? "" : "s"} →
            </Link>
          ) : (
            <span className="btn compare-action-cta compare-action-cta-disabled" aria-disabled="true">
              Compare →
            </span>
          )}
        </div>
      )}
    </div>
  );
}
