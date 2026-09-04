"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

export interface SearchFormHotel {
  id: string;
  name: string;
  area: string;
  city: string;
  starRating: number;
}

interface SearchFormProps {
  hotels: SearchFormHotel[];
  defaultCheckIn: string;
  defaultCheckOut: string;
}

// Two ways in, one required field underneath. With 36 hotels across 6
// emirates, a single flat <select> (the original design) became unusable
// - see DECISIONS.md, "Property picker: emirate/property search modes."
// Both modes end up doing the exact same thing: setting the hidden
// `hotel` input this form actually submits. Submits to /hotel, not
// /search directly - see DECISIONS.md, "The Analyse This Hotel gate
// (2026-09-03)": /hotel is the free recap + "Analyse This Hotel" gate,
// and only that page's own link goes on to /search, where the real
// (credit-spending) comparison happens.
//
// "Emirate" mode narrows a second <select> to one emirate at a time
// (default "All emirates" shows every hotel) rather than jumping straight
// to a multi-hotel results/compare page - that bigger "browse by
// location" feature is intentionally still deferred, see DECISIONS.md.
//
// "Property" mode is a type-ahead: type part of a name, pick from the
// nearest matches shown underneath. Substring match against name and
// area, prefix matches ranked first, capped at 8 suggestions so it never
// dumps the whole catalog back at you.
// Adds `days` to a YYYY-MM-DD date string, in UTC - the same parsing
// convention runSearch()/stayingApiAdapter.ts already use for check-in/
// check-out, so a date typed here means the same calendar day everywhere
// downstream (no local-timezone drift at the UTC day boundary).
function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function SearchForm({ hotels, defaultCheckIn, defaultCheckOut }: SearchFormProps) {
  const [mode, setMode] = useState<"emirate" | "property">("emirate");

  const [selectedEmirate, setSelectedEmirate] = useState("");
  const [selectedHotelId, setSelectedHotelId] = useState("");

  const [propertyQuery, setPropertyQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Controlled (not defaultValue) specifically so check-out can follow
  // check-in: picking a new check-in date that would put the current
  // check-out on or before it snaps check-out to the next day. Leaves
  // check-out alone otherwise, so an intentionally longer stay someone
  // already set isn't clobbered by a small check-in tweak.
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);

  function handleCheckInChange(next: string) {
    setCheckIn(next);
    if (next && (!checkOut || checkOut <= next)) {
      setCheckOut(addDays(next, 1));
    }
  }

  const emirates = useMemo(() => {
    const unique = Array.from(new Set(hotels.map((h) => h.city)));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [hotels]);

  const emirateHotels = useMemo(() => {
    const scoped = selectedEmirate ? hotels.filter((h) => h.city === selectedEmirate) : hotels;
    return [...scoped].sort((a, b) => a.name.localeCompare(b.name));
  }, [hotels, selectedEmirate]);

  const propertyMatches = useMemo(() => {
    const q = propertyQuery.trim().toLowerCase();
    if (!q) return [];
    const withRank = hotels
      .map((h) => {
        const name = h.name.toLowerCase();
        const area = h.area.toLowerCase();
        let rank = -1;
        if (name.startsWith(q)) rank = 0;
        else if (name.includes(q)) rank = 1;
        else if (area.includes(q)) rank = 2;
        return { hotel: h, rank };
      })
      .filter((r) => r.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.hotel.name.localeCompare(b.hotel.name));
    return withRank.slice(0, 8).map((r) => r.hotel);
  }, [hotels, propertyQuery]);

  function switchMode(next: "emirate" | "property") {
    if (next === mode) return;
    setMode(next);
    setSelectedHotelId("");
    setSelectedEmirate("");
    setPropertyQuery("");
    setShowSuggestions(false);
  }

  function pickProperty(hotel: SearchFormHotel) {
    setSelectedHotelId(hotel.id);
    setPropertyQuery(hotel.name);
    setShowSuggestions(false);
  }

  return (
    <form className="search-form" action="/hotel" method="GET">
      <div className="field property-field">
        <div className="mode-toggle" role="tablist" aria-label="Search by">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "emirate"}
            className={mode === "emirate" ? "mode-tab active" : "mode-tab"}
            onClick={() => switchMode("emirate")}
          >
            Emirate
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "property"}
            className={mode === "property" ? "mode-tab active" : "mode-tab"}
            onClick={() => switchMode("property")}
          >
            Property
          </button>
        </div>

        {mode === "emirate" ? (
          <div className="emirate-picker">
            <select
              aria-label="Emirate"
              value={selectedEmirate}
              onChange={(e) => {
                setSelectedEmirate(e.target.value);
                setSelectedHotelId("");
              }}
            >
              <option value="">All emirates</option>
              {emirates.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <select
              aria-label="Property"
              value={selectedHotelId}
              onChange={(e) => setSelectedHotelId(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose a property…
              </option>
              {emirateHotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} - {h.area} ({h.starRating}★)
                </option>
              ))}
            </select>
            <Link
              className="browse-all-link"
              href={
                selectedEmirate
                  ? `/browse?city=${encodeURIComponent(selectedEmirate)}&checkin=${checkIn}&checkout=${checkOut}`
                  : `/browse?checkin=${checkIn}&checkout=${checkOut}`
              }
            >
              Browse all hotels{selectedEmirate ? ` in ${selectedEmirate}` : ""} →
            </Link>
          </div>
        ) : (
          <div className="property-picker">
            <input
              type="text"
              aria-label="Property name"
              placeholder="Start typing a hotel name…"
              value={propertyQuery}
              onChange={(e) => {
                setPropertyQuery(e.target.value);
                setSelectedHotelId("");
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Close on blur, but only after a click on a suggestion
                // (which fires before blur's own default) has had a chance
                // to register - otherwise the list disappears before the
                // click lands.
                blurTimeout.current = setTimeout(() => setShowSuggestions(false), 150);
              }}
              autoComplete="off"
              role="combobox"
              aria-expanded={showSuggestions && propertyMatches.length > 0}
            />
            {showSuggestions && propertyQuery.trim().length > 0 && (
              <ul className="property-suggestions" role="listbox">
                {propertyMatches.length > 0 ? (
                  propertyMatches.map((h) => (
                    <li key={h.id} role="option" aria-selected={h.id === selectedHotelId}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          // mousedown (not click) fires before the input's
                          // blur, so the timeout above never gets a chance
                          // to close this list out from under the click.
                          e.preventDefault();
                          if (blurTimeout.current) clearTimeout(blurTimeout.current);
                          pickProperty(h);
                        }}
                      >
                        {h.name} <span className="suggestion-meta">- {h.area}, {h.city} ({h.starRating}★)</span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="property-suggestions-empty">No matching properties</li>
                )}
              </ul>
            )}
          </div>
        )}

        <input type="hidden" name="hotel" value={selectedHotelId} />
      </div>

      <div className="field">
        <label htmlFor="checkin">Check-in</label>
        <input
          id="checkin"
          name="checkin"
          type="date"
          value={checkIn}
          onChange={(e) => handleCheckInChange(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="checkout">Check-out</label>
        <input
          id="checkout"
          name="checkout"
          type="date"
          value={checkOut}
          min={checkIn ? addDays(checkIn, 1) : undefined}
          onChange={(e) => setCheckOut(e.target.value)}
          required
        />
      </div>
      <button className="btn" type="submit" disabled={!selectedHotelId}>
        Find my rate →
      </button>
    </form>
  );
}
