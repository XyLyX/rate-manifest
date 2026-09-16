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
// 2026-09-16 affiliate-readiness repair: Discover is shortlist-first again.
// The whole card toggles selection and the direct per-card Check IQ shortcut is
// removed so the journey remains Discover -> Shortlist -> Compare -> Verify.
// Real property imagery is rendered from hotel.imageUrl when available; missing
// imagery uses a neutral text fallback rather than an initial or fabricated image.
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
          return (
            <div
              key={hotel.id}
              className={isSelected ? "hotel-card home-hotel-card hotel-card-selected" : "hotel-card home-hotel-card"}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => toggle(hotel.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(hotel.id);
                }
              }}
            >
              <div className="home-hotel-card-image">
                {hotel.imageUrl ? (
                  <img className="home-hotel-card-img" src={hotel.imageUrl} alt={`${hotel.name} property`} />
                ) : (
                  <span className="home-hotel-card-image-unavailable">Property image unavailable</span>
                )}
              </div>
              {hotel.isMockData && <span className="hotel-card-demo">Demo</span>}

              <div className="hotel-card-name">{hotel.name}</div>
              <div className="hotel-card-meta">
                {hotel.area} · {hotel.starRating}-star
              </div>

              <div className="home-hotel-card-shortlist-hint">
                {isSelected ? "✓ Shortlisted" : "Select to shortlist"}
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
