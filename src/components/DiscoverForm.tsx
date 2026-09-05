"use client";

import { useState } from "react";
import { createTrip } from "@/app/actions/trip";
import { TRIP_PURPOSES, type TripPurpose } from "@/lib/constants";

interface DiscoverFormProps {
  cities: string[];
  defaultCity: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
}

// Plain-language labels for the trip-intent chips - see
// claude/travel-decision-platform-assessment.md, "RateManifest — Final
// Customer Journey," Page 1: "Trip type (optional): Leisure / Business /
// Family / Couple, etc." TRIP_PURPOSES (src/lib/constants.ts) is the
// closed set this maps onto; UNSPECIFIED is deliberately not its own chip
// here - "Skip" below sets it directly, so there's one obvious way to say
// "I'd rather not say," not a chip that reads like every other choice.
const PURPOSE_LABELS: Record<Exclude<TripPurpose, "UNSPECIFIED">, string> = {
  COUPLE: "Couple",
  FAMILY: "Family",
  SOLO: "Solo",
  BUSINESS: "Business",
  FIRST_TIME: "First time here",
};

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Page 1 (Discover)'s search card - destination, dates, guests/rooms, and
// trip-intent, in one form. Submits to createTrip() (src/app/actions/trip.ts),
// which creates the lightweight trip record the rest of the four-page
// journey carries forward by id, then redirects back here with ?trip= set
// so the results below reflect this exact search.
//
// Guests/Rooms is deliberately just two number inputs, not a real filter -
// see createTrip's own comment and the technical blueprint, Section 10:
// rooms.occupancy is a single fixed value per hotel today, and nothing
// downstream can honestly vary results by guest count yet. Collected now
// as trip context (visible on Page 4's summary later) rather than left out
// entirely or faked as a working filter.
export function DiscoverForm({ cities, defaultCity, defaultCheckIn, defaultCheckOut }: DiscoverFormProps) {
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [purpose, setPurpose] = useState<TripPurpose>("UNSPECIFIED");

  function handleCheckInChange(next: string) {
    setCheckIn(next);
    if (next && (!checkOut || checkOut <= next)) {
      setCheckOut(addDays(next, 1));
    }
  }

  return (
    <form className="discover-form" action={createTrip}>
      <div className="discover-form-row">
        <div className="field">
          <label htmlFor="destination">Destination</label>
          <select id="destination" name="destination" defaultValue={defaultCity} required>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="discover-checkin">Check-in</label>
          <input
            id="discover-checkin"
            name="checkin"
            type="date"
            value={checkIn}
            onChange={(e) => handleCheckInChange(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="discover-checkout">Check-out</label>
          <input
            id="discover-checkout"
            name="checkout"
            type="date"
            value={checkOut}
            min={checkIn ? addDays(checkIn, 1) : undefined}
            onChange={(e) => setCheckOut(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="discover-form-row discover-form-row-guests">
        <div className="field field-narrow">
          <label htmlFor="adults">Adults</label>
          <input id="adults" name="adults" type="number" min={1} max={12} defaultValue={2} />
        </div>
        <div className="field field-narrow">
          <label htmlFor="children">Children</label>
          <input id="children" name="children" type="number" min={0} max={12} defaultValue={0} />
        </div>
        <div className="field field-narrow">
          <label htmlFor="rooms">Rooms</label>
          <input id="rooms" name="rooms" type="number" min={1} max={8} defaultValue={1} />
        </div>
      </div>

      <div className="discover-form-intent">
        <span className="discover-form-intent-label">What&apos;s this trip for? (optional)</span>
        <div className="trip-intent-chips" role="group" aria-label="Trip type">
          {(Object.keys(PURPOSE_LABELS) as Exclude<TripPurpose, "UNSPECIFIED">[]).map((key) => (
            <button
              key={key}
              type="button"
              className={purpose === key ? "trip-intent-chip active" : "trip-intent-chip"}
              onClick={() => setPurpose((p) => (p === key ? "UNSPECIFIED" : key))}
              aria-pressed={purpose === key}
            >
              {PURPOSE_LABELS[key]}
            </button>
          ))}
          <button
            type="button"
            className={purpose === "UNSPECIFIED" ? "trip-intent-chip active" : "trip-intent-chip"}
            onClick={() => setPurpose("UNSPECIFIED")}
            aria-pressed={purpose === "UNSPECIFIED"}
          >
            Skip
          </button>
        </div>
        <input type="hidden" name="purpose" value={purpose} />
      </div>

      <button className="btn discover-form-submit" type="submit">
        Find hotels for this trip →
      </button>
    </form>
  );
}
