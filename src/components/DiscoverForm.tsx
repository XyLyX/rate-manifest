"use client";

import { useRef, useState, useTransition } from "react";
import { createTrip } from "@/app/actions/trip";
import { recordDestinationInterest } from "@/app/actions/destinationInterest";
import { TRIP_PURPOSES, type TripPurpose } from "@/lib/constants";

interface DiscoverFormProps {
  cities: string[];
  defaultDestination?: string;
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

// Normalise a string for city matching: lowercase, collapse internal
// whitespace, trim. Both the input value and the supported cities list go
// through the same transform before comparison, so "Abu  Dhabi" and
// "abu dhabi" match "Abu Dhabi" without a fuzzy algorithm.
function normalise(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

// Page 1 (Discover)'s search card - destination, dates, guests/rooms, and
// trip-intent, in one form. Submits to createTrip() (src/app/actions/trip.ts).
//
// W2 (2026-09-14): destination field changed from a closed <select> to an
// open free-text input with a suggestions overlay. Client-side submit
// interception guards against an unsupported destination reaching createTrip.
//
// W3 (2026-09-14): unsupported-destination state extended with an inline
// name/email form that submits to recordDestinationInterest() (a server
// action that writes to destination_interest). The destination is captured
// automatically from the visitor's search - they never re-enter it.
export function DiscoverForm({ cities, defaultDestination = "", defaultCheckIn, defaultCheckOut }: DiscoverFormProps) {
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [purpose, setPurpose] = useState<TripPurpose>("UNSPECIFIED");

  // Destination combobox state
  const [destInput, setDestInput] = useState(defaultDestination);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // W3: destination interest form state
  const [interestName, setInterestName] = useState("");
  const [interestEmail, setInterestEmail] = useState("");
  const [interestStatus, setInterestStatus] = useState<"idle" | "success" | "error">("idle");
  const [interestError, setInterestError] = useState("");
  const [isPending, startTransition] = useTransition();

  // The resolved city name to submit — set when the user picks a suggestion
  // or when their typed text exactly matches a city. Empty means unresolved.
  const resolvedCity = cities.find((c) => normalise(c) === normalise(destInput)) ?? null;

  const suggestions =
    destInput.trim().length > 0
      ? cities.filter(
          (c) =>
            normalise(c).includes(normalise(destInput)) &&
            normalise(c) !== normalise(destInput),
        )
      : [];

  function handleDestChange(value: string) {
    setDestInput(value);
    setUnsupported(false);
    setInterestStatus("idle");
    setShowSuggestions(true);
  }

  function pickSuggestion(city: string) {
    setDestInput(city);
    setShowSuggestions(false);
    setUnsupported(false);
    inputRef.current?.focus();
  }

  function handleCheckInChange(next: string) {
    setCheckIn(next);
    if (next && (!checkOut || checkOut <= next)) {
      setCheckOut(addDays(next, 1));
    }
  }

  // Client-side submit gate: if the destination doesn't resolve to a
  // supported city, block the server action and show the unsupported state.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!resolvedCity) {
      e.preventDefault();
      setUnsupported(true);
      setShowSuggestions(false);
      inputRef.current?.focus();
    }
    // else: let the form submit naturally — the hidden input carries resolvedCity
  }

  // W3: submit interest form via server action, stay on page, show result
  function handleInterestSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInterestError("");
    startTransition(async () => {
      const result = await recordDestinationInterest(destInput, interestName, interestEmail);
      if (result.ok) {
        setInterestStatus("success");
      } else {
        setInterestStatus("error");
        setInterestError(result.error);
      }
    });
  }

  return (
    <form className="discover-form" action={createTrip} onSubmit={handleSubmit}>
      {/* Hidden input carries the resolved, canonical city name to createTrip */}
      <input type="hidden" name="destination" value={resolvedCity ?? destInput} />

      <div className="discover-form-row">
        <div className="field">
          <label htmlFor="destination-input">Destination</label>
          <div className="discover-dest-wrap">
            <input
              ref={inputRef}
              id="destination-input"
              className="discover-dest-input"
              type="text"
              autoComplete="off"
              placeholder="City or destination"
              value={destInput}
              onChange={(e) => handleDestChange(e.target.value)}
              onFocus={() => {
                if (destInput.trim()) setShowSuggestions(true);
              }}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 150);
              }}
              required
              aria-autocomplete="list"
              aria-controls="discover-suggestions"
              aria-expanded={showSuggestions && suggestions.length > 0}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul
                id="discover-suggestions"
                className="discover-suggestions"
                role="listbox"
              >
                {suggestions.map((city) => (
                  <li
                    key={city}
                    role="option"
                    aria-selected={false}
                    className="discover-suggestion-item"
                    onMouseDown={() => pickSuggestion(city)}
                  >
                    {city}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* W3: unsupported-destination state with inline interest form */}
          {unsupported && (
            <div className="unsupported-destination" role="alert">
              <span className="unsupported-destination-headline">
                We&apos;re curating this destination.
              </span>
              <span className="unsupported-destination-sub">
                Rate Manifest isn&apos;t live here yet — but we&apos;re working on it.
              </span>

              {interestStatus === "success" ? (
                <div className="interest-success">
                  <span className="interest-success-headline">You&apos;re on the list.</span>
                  <span className="interest-success-sub">
                    We&apos;ll let you know when Rate Manifest is live in{" "}
                    <strong>{destInput}</strong> — with hotels, rates and travel intelligence
                    worth knowing.
                  </span>
                </div>
              ) : (
                <form
                  className="interest-form"
                  onSubmit={handleInterestSubmit}
                  noValidate
                  aria-label={"Register interest for " + destInput}
                >
                  <p className="interest-form-hook">Want to know when it&apos;s ready?</p>
                  <p className="interest-form-dest">
                    <strong>{destInput}</strong>
                  </p>

                  <div className="interest-form-fields">
                    <div className="interest-form-field">
                      <label htmlFor="interest-name">Your name</label>
                      <input
                        id="interest-name"
                        type="text"
                        value={interestName}
                        onChange={(e) => setInterestName(e.target.value)}
                        placeholder="Your name"
                        autoComplete="name"
                        disabled={isPending}
                        required
                      />
                    </div>
                    <div className="interest-form-field">
                      <label htmlFor="interest-email">Email address</label>
                      <input
                        id="interest-email"
                        type="email"
                        value={interestEmail}
                        onChange={(e) => setInterestEmail(e.target.value)}
                        placeholder="Email address"
                        autoComplete="email"
                        disabled={isPending}
                        required
                      />
                    </div>
                  </div>

                  {interestStatus === "error" && (
                    <p className="interest-form-error" role="alert">
                      {interestError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="btn interest-form-submit"
                    disabled={isPending}
                  >
                    {isPending ? "Sending…" : "Notify me"}
                  </button>
                </form>
              )}
            </div>
          )}
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
        Find hotels for this trip &rarr;
      </button>
    </form>
  );
}
