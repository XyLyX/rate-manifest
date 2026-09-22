"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createTrip } from "@/app/actions/trip";
import { recordDestinationInterest } from "@/app/actions/destinationInterest";
import { TRIP_PURPOSES, type TripPurpose } from "@/lib/constants";
import {
  ESSENTIAL_REQUIREMENTS,
  ESSENTIAL_REQUIREMENT_LABELS,
  MAX_TRIP_PRIORITIES,
  PREFERENCE_CURRENCIES,
  PREFERRED_LOCATION_MAX_LENGTH,
  TRIP_PRIORITIES,
  TRIP_PRIORITY_LABELS,
  type CreateTripState,
  type EssentialRequirement,
  type PreferenceCurrency,
  type TripPriority,
} from "@/lib/tripIntent";

const CREATE_TRIP_INITIAL_STATE: CreateTripState = { ok: true };
// The <select>'s own sentinel for "let me type a different ISO 4217 code" -
// never itself submitted as a currency value (see the hidden resolved input below).
const OTHER_CURRENCY = "OTHER" as const;

interface DiscoverFormProps {
  cities: string[];
  defaultDestination?: string;
  // True when defaultDestination has properties in the catalogue, so the
  // "we're curating this destination" state must not be shown for it.
  destinationSupported?: boolean;
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
export function DiscoverForm({ cities, defaultDestination = "", destinationSupported = false, defaultCheckIn, defaultCheckOut }: DiscoverFormProps) {
  // V2A Build 1: bound via useActionState (not a bare `action={createTrip}`)
  // so an invalid/tampered submission returns a rendered, accessible error
  // - see createTrip's own comment - instead of throwing into Next.js's
  // generic error boundary. Nothing here resets any other field's state on
  // failure, so everything the traveller already entered stays exactly as
  // they left it (see the `state.ok === false` block below).
  const [state, formAction] = useActionState(createTrip, CREATE_TRIP_INITIAL_STATE);

  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [purpose, setPurpose] = useState<TripPurpose>("UNSPECIFIED");

  // V2A Build 1: "Personalise your stay" - entirely optional, so every
  // piece of state here starts genuinely empty, never a pre-picked value.
  const [budgetAmount, setBudgetAmount] = useState("");
  // budgetCurrency is the RESOLVED value actually submitted (one of the six
  // quick-picks, or whatever the traveller typed after choosing "Other").
  // currencyMode only controls which control is shown - it is never itself submitted.
  const [budgetCurrency, setBudgetCurrency] = useState<PreferenceCurrency | string>("");
  const [currencyMode, setCurrencyMode] = useState<"preset" | "other">("preset");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [priorities, setPriorities] = useState<TripPriority[]>([]);
  const [essentials, setEssentials] = useState<EssentialRequirement[]>([]);

  function togglePriority(key: TripPriority) {
    setPriorities((current) => {
      if (current.includes(key)) return current.filter((k) => k !== key);
      if (current.length >= MAX_TRIP_PRIORITIES) return current; // cap enforced client-side too; the server enforces it regardless
      return [...current, key];
    });
  }

  function toggleEssential(key: EssentialRequirement) {
    setEssentials((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }

  // Destination combobox state
  const [destInput, setDestInput] = useState(defaultDestination);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [unsupported, setUnsupported] = useState(Boolean(defaultDestination) && !destinationSupported);
  const inputRef = useRef<HTMLInputElement>(null);

  // W3: destination interest form state
  const [interestName, setInterestName] = useState("");
  const [interestEmail, setInterestEmail] = useState("");
  const [interestStatus, setInterestStatus] = useState<"idle" | "success" | "error">("idle");
  const [interestError, setInterestError] = useState("");
  const [isPending, startTransition] = useTransition();

  // The resolved city name to submit — set when the user picks a suggestion
  // or when their typed text exactly matches a city. Empty means unresolved.
  const resolvedCity = cities.find((c) => normalise(c) === normalise(destInput)) ?? destInput.trim();

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

  // Phase A: destination entry is open. Hotel inventory support is independent
  // from destination intelligence, so every non-empty destination may create a trip.
  // After the redirect, defaultDestination is populated and the curating state is shown.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!destInput.trim()) {
      e.preventDefault();
      inputRef.current?.focus();
      return;
    }
    setShowSuggestions(false);
  }

  // W3: submit interest form via server action, stay on page, show result
  function handleInterestSubmit() {
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
    <form className="discover-form" action={formAction} onSubmit={handleSubmit}>
      {/* Hidden input carries the resolved, canonical city name to createTrip */}
      <input type="hidden" name="destination" value={resolvedCity ?? destInput} />

      {/* V2A Build 1: a rejected submission (invalid/tampered core fields or
          preferences) renders here instead of throwing into Next.js's
          generic error page. Nothing above has reset, so every value the
          traveller already entered - destination, dates, party size,
          personalisation - is still exactly as they left it. */}
      {!state.ok && (
        <div className="discover-form-error" role="alert">
          <span className="discover-form-error-headline">We couldn&apos;t start that search.</span>
          <ul>
            {state.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

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
                    <strong>{destInput}</strong> — with hotels and travel intelligence
                    worth knowing.
                  </span>
                </div>
              ) : (
                <div
                  className="interest-form"
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
                    type="button"
                    className="btn interest-form-submit"
                    onClick={handleInterestSubmit}
                    disabled={isPending}
                  >
                    {isPending ? "Sending…" : "Notify me"}
                  </button>
                </div>
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

      {/* V2A Build 1: entirely optional - collapsed by default (<details>),
          nothing here feeds discovery, ranking or filtering; it is only
          stored against the trip for later pages to read (see
          src/lib/tripIntent.ts). Leaving every field untouched submits no
          preferences at all, not an object of empty/invented defaults. */}
      <details className="discover-form-personalise">
        <summary className="discover-form-personalise-summary">
          <span className="discover-form-intent-label">Personalise your stay (optional)</span>
        </summary>
        <div className="discover-form-personalise-body">
          <div className="discover-form-row discover-form-row-budget">
            <div className="field field-narrow">
              <label htmlFor="budget-amount">Nightly budget</label>
              <input
                id="budget-amount"
                name="budgetAmount"
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                placeholder="e.g. 500"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
              />
            </div>
            <div className="field field-narrow">
              <label htmlFor="budget-currency">Currency</label>
              {/* This <select> is display-only (unnamed) - the value actually
                  submitted travels through the single hidden input below, so
                  the server always sees exactly one resolved budgetCurrency
                  regardless of which control produced it. */}
              <select
                id="budget-currency"
                value={currencyMode === "other" ? OTHER_CURRENCY : budgetCurrency}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === OTHER_CURRENCY) {
                    setCurrencyMode("other");
                    setBudgetCurrency("");
                  } else {
                    setCurrencyMode("preset");
                    setBudgetCurrency(v as PreferenceCurrency | "");
                  }
                }}
              >
                <option value="">—</option>
                {PREFERENCE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={OTHER_CURRENCY}>Other…</option>
              </select>
              {currencyMode === "other" && (
                <input
                  type="text"
                  aria-label="Other currency (ISO 4217 code, e.g. JPY)"
                  placeholder="e.g. JPY"
                  maxLength={3}
                  value={budgetCurrency}
                  onChange={(e) => setBudgetCurrency(e.target.value.toUpperCase())}
                  className="discover-form-other-currency"
                />
              )}
              {/* The one field the server actually reads - see parseBudget()/isValidIsoCurrencyCode() in src/lib/tripIntent.ts. */}
              <input type="hidden" name="budgetCurrency" value={budgetCurrency} />
            </div>
            <div className="field">
              <label htmlFor="preferred-location">Preferred location</label>
              <input
                id="preferred-location"
                name="preferredLocation"
                type="text"
                maxLength={PREFERRED_LOCATION_MAX_LENGTH}
                placeholder="e.g. near the beach, Downtown"
                value={preferredLocation}
                onChange={(e) => setPreferredLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="discover-form-intent">
            <span className="discover-form-intent-label">
              Trip priorities — choose up to {MAX_TRIP_PRIORITIES} (optional)
            </span>
            <div className="trip-intent-chips" role="group" aria-label="Trip priorities">
              {TRIP_PRIORITIES.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={priorities.includes(key) ? "trip-intent-chip active" : "trip-intent-chip"}
                  onClick={() => togglePriority(key)}
                  aria-pressed={priorities.includes(key)}
                >
                  {TRIP_PRIORITY_LABELS[key]}
                </button>
              ))}
            </div>
            {priorities.map((p) => (
              <input key={p} type="hidden" name="priorities" value={p} />
            ))}
          </div>

          <div className="discover-form-intent">
            <span className="discover-form-intent-label">Essential requirements (optional)</span>
            <div className="trip-intent-chips" role="group" aria-label="Essential requirements">
              {ESSENTIAL_REQUIREMENTS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={essentials.includes(key) ? "trip-intent-chip active" : "trip-intent-chip"}
                  onClick={() => toggleEssential(key)}
                  aria-pressed={essentials.includes(key)}
                >
                  {ESSENTIAL_REQUIREMENT_LABELS[key]}
                </button>
              ))}
            </div>
            {essentials.map((r) => (
              <input key={r} type="hidden" name="essentialRequirements" value={r} />
            ))}
          </div>
        </div>
      </details>

      <button className="btn discover-form-submit" type="submit">
        Explore this destination &rarr;
      </button>
    </form>
  );
}
