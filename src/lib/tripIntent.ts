// Rate Manifest V2A Build 1: Traveller Intent Profile.
//
// The shared, typed validation contract behind the optional "Personalise
// your stay" section on Page 1 (Discover) — see DiscoverForm.tsx and
// src/app/actions/trip.ts's createTrip(). This module has no database or
// "use server"/"use client" dependency, so it is safe to import from the
// client component (for the closed-set labels/options it renders) and from
// the server action (as the single source of truth createTrip enforces
// against). It is also imported directly by tests with no DB/network.
//
// Two contracts live here, because the task explicitly groups them under
// one shared validation contract:
//   1. The trip's CORE fields (destination, dates, adults/children/rooms) -
//      already collected today, but previously coerced silently by
//      parseIntOr() in trip.ts (an invalid/tampered value quietly became a
//      "safe" default, e.g. children=-1 became children=0). That is exactly
//      the failure mode this module is built to close: a value that is
//      PRESENT but invalid is rejected, never silently repaired. A value
//      that is genuinely ABSENT (the field wasn't submitted at all, or was
//      cleared to an empty string) still falls back to the same documented
//      default the app has always used - that is not new behaviour.
//   2. The new, optional PREFERENCES: nightly budget + currency, preferred
//      location, up to three trip priorities, and optional essential
//      requirements. None of this feeds any ranking, filtering or match
//      score anywhere else in the app (see hotel/commercial.ts, discovery/
//      curatedCatalogSource.ts - neither imports this module.) It is
//      captured and stored for later pages to read, nothing more.

// --- Closed sets -----------------------------------------------------------

// The featured quick-pick currencies - what this UAE/GCC-focused platform
// actually has reason to show a traveller as one-tap options today. Extend
// only with evidence, the same rule every other closed set in this app
// already follows (see TRIP_PURPOSES in src/lib/constants.ts).
export const PREFERENCE_CURRENCIES = ["AED", "USD", "EUR", "GBP", "INR", "SAR"] as const;
export type PreferenceCurrency = (typeof PREFERENCE_CURRENCIES)[number];

// A traveller whose currency isn't one of the six quick-picks can still name
// any OTHER real ISO 4217 currency by its 3-letter code (DiscoverForm shows a
// free-text field once "Other" is chosen) - this is that safety valve. It is
// deliberately a closed, static, bundled list of the standard currently-
// circulating ISO 4217 alphabetic codes, not an open-ended free text field:
// a tampered/typo'd 3-letter string ("XXX", "ABC") is still rejected. No
// automatic conversion or exchange-rate logic reads this list - a stored
// budget is always exactly the amount+code the traveller entered, nothing is
// ever converted between currencies. No destination-based currency is ever
// assumed (choosing "Dubai" does not imply AED) - see parseBudget() below.
// No external API/network call backs this list; it is fixed at build time,
// same as PREFERENCE_CURRENCIES. Sourced from general knowledge of the
// standard, not a live ISO/SIX feed - if a legitimate gap turns up, extend
// this array with evidence, the same rule as every other closed set here.
export const ISO_4217_CURRENCY_CODES = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD",
  "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC", "CUP", "CVE", "CZK",
  "DJF", "DKK", "DOP", "DZD",
  "EGP", "ERN", "ETB", "EUR",
  "FJD", "FKP",
  "GBP", "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD",
  "HKD", "HNL", "HTG", "HUF",
  "IDR", "ILS", "INR", "IQD", "IRR", "ISK",
  "JMD", "JOD", "JPY",
  "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT",
  "LAK", "LBP", "LKR", "LRD", "LSL", "LYD",
  "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN",
  "NAD", "NGN", "NIO", "NOK", "NPR", "NZD",
  "OMR",
  "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG",
  "QAR",
  "RON", "RSD", "RUB", "RWF",
  "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SYP", "SZL",
  "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS",
  "UAH", "UGX", "USD", "UYU", "UZS",
  "VES", "VND", "VUV",
  "WST",
  "XAF", "XCD", "XOF", "XPF",
  "YER",
  "ZAR", "ZMW", "ZWL",
] as const;

/** Whether `code` (case-insensitive) is a recognised ISO 4217 currency code - the sole gate for a budget's stored currency. */
export function isValidIsoCurrencyCode(code: string): boolean {
  return (ISO_4217_CURRENCY_CODES as readonly string[]).includes(code.trim().toUpperCase());
}

// Up to three of these may be chosen - MAX_TRIP_PRIORITIES below, enforced
// on the server regardless of what client-side chip logic already prevents.
export const TRIP_PRIORITIES = [
  "BEST_VALUE",
  "PRIME_LOCATION",
  "FAMILY_FRIENDLY",
  "QUIET_AND_RELAXING",
  "WORK_FRIENDLY",
  "ROMANTIC",
  "LUXURY_COMFORT",
  "WALKABLE_TO_SIGHTS",
] as const;
export type TripPriority = (typeof TRIP_PRIORITIES)[number];

export const TRIP_PRIORITY_LABELS: Record<TripPriority, string> = {
  BEST_VALUE: "Best value",
  PRIME_LOCATION: "Prime location",
  FAMILY_FRIENDLY: "Family friendly",
  QUIET_AND_RELAXING: "Quiet and relaxing",
  WORK_FRIENDLY: "Work friendly",
  ROMANTIC: "Romantic",
  LUXURY_COMFORT: "Luxury and comfort",
  WALKABLE_TO_SIGHTS: "Walkable to sights",
};

// No cap named in the brief beyond "optional" - the closed set itself is
// the only bound, so a tampered submission can't smuggle in an unbounded array.
export const ESSENTIAL_REQUIREMENTS = [
  "FREE_CANCELLATION",
  "BREAKFAST_INCLUDED",
  "POOL",
  "PARKING",
  "PET_FRIENDLY",
  "ACCESSIBLE_ROOM",
  "NON_SMOKING",
  "AIRPORT_TRANSFER",
] as const;
export type EssentialRequirement = (typeof ESSENTIAL_REQUIREMENTS)[number];

export const ESSENTIAL_REQUIREMENT_LABELS: Record<EssentialRequirement, string> = {
  FREE_CANCELLATION: "Free cancellation",
  BREAKFAST_INCLUDED: "Breakfast included",
  POOL: "Pool",
  PARKING: "Parking",
  PET_FRIENDLY: "Pet friendly",
  ACCESSIBLE_ROOM: "Accessible room",
  NON_SMOKING: "Non-smoking",
  AIRPORT_TRANSFER: "Airport transfer",
};

export const MAX_TRIP_PRIORITIES = 3;

// --- Bounds (core fields) ---------------------------------------------------

export const ADULTS_MIN = 1;
export const ADULTS_MAX = 12;
export const ADULTS_DEFAULT = 2;
export const CHILDREN_MIN = 0;
export const CHILDREN_MAX = 12;
export const CHILDREN_DEFAULT = 0;
export const ROOMS_MIN = 1;
export const ROOMS_MAX = 8;
export const ROOMS_DEFAULT = 1;

// --- Bounds (preferences) ---------------------------------------------------

export const BUDGET_AMOUNT_MIN = 1;
export const BUDGET_AMOUNT_MAX = 1_000_000;
export const PREFERRED_LOCATION_MAX_LENGTH = 120;

// --- Shapes ------------------------------------------------------------------

export interface TripCoreFields {
  destination: string;
  checkIn: string; // ISO YYYY-MM-DD
  checkOut: string; // ISO YYYY-MM-DD
  adults: number;
  children: number;
  rooms: number;
}

export interface TripBudget {
  amount: number;
  // Any code isValidIsoCurrencyCode() accepts - not narrowed to
  // PreferenceCurrency, since a traveller may legitimately choose "Other"
  // and name any real ISO 4217 currency (see ISO_4217_CURRENCY_CODES above).
  // Stored exactly as entered - never converted, never inferred from destination.
  currency: string;
}

// Every field is optional and, when present, non-empty - a key that was
// never given by the traveller is simply absent from this object, never
// present with a null/zero/empty placeholder. See this module's own header
// comment: "no invented defaults."
//
// `priorities` and `essentialRequirements` are DELIBERATELY two separate
// fields backed by two separate, non-overlapping closed sets
// (TRIP_PRIORITIES vs ESSENTIAL_REQUIREMENTS) - never merged into one
// generic "preferences" bag. This distinction is load-bearing, not
// cosmetic:
//   - `priorities` is a soft signal about what the traveller cares about
//     (e.g. ROMANTIC, QUIET_AND_RELAXING) - it describes the TRIP, not any
//     property.
//   - `essentialRequirements` is what the traveller SAYS they need (e.g.
//     POOL, PET_FRIENDLY) - it is still only a traveller statement, NEVER a
//     verified hotel capability and NEVER a hard filter. Nothing in this
//     app may treat `essentialRequirements` as equivalent to a property
//     actually having that facility (see hotels.facilities in
//     src/db/schema.ts, which is separate, unrelated, source-supplied
//     data) until a real, verified per-property capability/facility source
//     exists and an explicit future decision wires the two together.
// Neither field is read by any discovery, scoring or commercial module
// today (enforced by tripIntent.test.ts's "hard restrictions" check).
export interface TripPreferences {
  budget?: TripBudget;
  preferredLocation?: string;
  priorities?: TripPriority[];
  essentialRequirements?: EssentialRequirement[];
}

// The result createTrip() (src/app/actions/trip.ts) returns to
// React's useActionState, so an invalid/tampered submission becomes a
// rendered, accessible form error - never an uncaught throw that would
// otherwise surface Next.js's generic error boundary and never a partial
// or tampered trip write. On success the action redirects and this value
// is never actually read (redirect() never returns) - `{ ok: true }` exists
// only to satisfy useActionState's "some initial/pending state" contract.
export type CreateTripState = { ok: true } | { ok: false; errors: string[] };

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// --- Raw input shapes (string-keyed, exactly what FormData/query params give us) ---

export interface RawTripCoreInput {
  destination?: string | null;
  checkin?: string | null;
  checkout?: string | null;
  adults?: string | null;
  children?: string | null;
  rooms?: string | null;
}

export interface RawTripPreferencesInput {
  budgetAmount?: string | null;
  budgetCurrency?: string | null;
  preferredLocation?: string | null;
  priorities?: string[];
  essentialRequirements?: string[];
}

// --- Helpers -----------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real calendar date in YYYY-MM-DD form (rejects e.g. 2026-02-30, which Date would otherwise silently roll over). */
function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Whole numbers only, no leading '+', no whitespace-as-zero (Number(" ") is
// 0 in JS, which would silently accept a blank field as a valid value - see
// module comment above for why that's exactly the bug this file exists to close).
const INTEGER_RE = /^-?\d+$/;

function parseBoundedInt(raw: string | null | undefined, opts: { min: number; max: number; fallback: number; label: string }, errors: string[]): number {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return opts.fallback; // genuinely absent -> the documented default, not an error
  if (!INTEGER_RE.test(trimmed)) {
    errors.push(`${opts.label} must be a whole number.`);
    return opts.fallback;
  }
  const n = Number(trimmed);
  if (n < opts.min || n > opts.max) {
    errors.push(`${opts.label} must be between ${opts.min} and ${opts.max}.`);
    return opts.fallback;
  }
  return n;
}

/**
 * Validates the trip's core fields. destination/checkin/checkout must be
 * present and well-formed; adults/children/rooms fall back to their
 * documented default only when genuinely absent (not submitted, or cleared
 * to an empty string) - a PRESENT but invalid value (out of range,
 * non-numeric, tampered) is always rejected, never coerced.
 */
export function parseTripCoreFields(raw: RawTripCoreInput): ValidationResult<TripCoreFields> {
  const errors: string[] = [];

  const destination = (raw.destination ?? "").trim();
  if (!destination) errors.push("Destination is required.");

  const checkIn = (raw.checkin ?? "").trim();
  const checkOut = (raw.checkout ?? "").trim();
  if (!checkIn || !checkOut) {
    errors.push("Check-in and check-out dates are required.");
  } else if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut)) {
    errors.push("Check-in and check-out must be valid calendar dates.");
  } else if (checkOut <= checkIn) {
    errors.push("Check-out must be after check-in.");
  }

  const adults = parseBoundedInt(raw.adults, { min: ADULTS_MIN, max: ADULTS_MAX, fallback: ADULTS_DEFAULT, label: "Adults" }, errors);
  const children = parseBoundedInt(raw.children, { min: CHILDREN_MIN, max: CHILDREN_MAX, fallback: CHILDREN_DEFAULT, label: "Children" }, errors);
  const rooms = parseBoundedInt(raw.rooms, { min: ROOMS_MIN, max: ROOMS_MAX, fallback: ROOMS_DEFAULT, label: "Rooms" }, errors);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { destination, checkIn, checkOut, adults, children, rooms } };
}

// Up to 2 decimal places, no sign, no thousands separator, no scientific
// notation - deliberately strict so a tampered/garbage value is rejected
// rather than coerced by JS's own loose Number() parsing.
const BUDGET_AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

function parseBudget(amountRaw: string | null | undefined, currencyRaw: string | null | undefined, errors: string[]): TripBudget | undefined {
  const amountTrimmed = (amountRaw ?? "").trim();
  const currencyTrimmed = (currencyRaw ?? "").trim().toUpperCase();

  if (!amountTrimmed && !currencyTrimmed) return undefined; // genuinely not given

  if (amountTrimmed && !currencyTrimmed) {
    errors.push("Choose a currency for your nightly budget.");
    return undefined;
  }
  if (currencyTrimmed && !amountTrimmed) {
    errors.push("Enter an amount for your nightly budget.");
    return undefined;
  }

  let valid = true;
  if (!BUDGET_AMOUNT_RE.test(amountTrimmed)) {
    errors.push("Nightly budget must be a positive number.");
    valid = false;
  }
  // Validated against the full ISO 4217 list, not just the six quick-picks -
  // a traveller may have chosen "Other" and typed any real currency code.
  // Still a closed check: a tampered/typo'd code is rejected either way.
  if (!isValidIsoCurrencyCode(currencyTrimmed)) {
    errors.push("Nightly budget currency must be a valid 3-letter currency code (e.g. AED, USD, JPY).");
    valid = false;
  }
  if (!valid) return undefined;

  const amount = Number(amountTrimmed);
  if (amount < BUDGET_AMOUNT_MIN || amount > BUDGET_AMOUNT_MAX) {
    errors.push(`Nightly budget must be between ${BUDGET_AMOUNT_MIN} and ${BUDGET_AMOUNT_MAX}.`);
    return undefined;
  }
  return { amount, currency: currencyTrimmed };
}

function parseClosedSet<T extends string>(raw: string[] | undefined, allowed: readonly T[], opts: { label: string; max?: number }, errors: string[]): T[] | undefined {
  const values = raw ?? [];
  if (values.length === 0) return undefined;

  const deduped: T[] = [];
  for (const v of values) {
    if (!(allowed as readonly string[]).includes(v)) {
      errors.push(`Unrecognised ${opts.label} value: "${v}".`);
      continue;
    }
    if (!deduped.includes(v as T)) deduped.push(v as T);
  }
  if (opts.max != null && deduped.length > opts.max) {
    errors.push(`Choose at most ${opts.max} ${opts.label}.`);
  }
  return deduped.length > 0 ? deduped : undefined;
}

/**
 * Validates the optional "Personalise your stay" preferences. Returns
 * `{ ok: true, value: null }` when nothing was given at all (the section
 * was left untouched) - never an object with empty/placeholder fields.
 * Any field that IS given must be valid; a single invalid/tampered field
 * fails the whole submission rather than being silently dropped, so a
 * traveller's incomplete pair (e.g. a budget amount with no currency)
 * can't be saved half-formed.
 */
export function parseTripPreferencesFields(raw: RawTripPreferencesInput): ValidationResult<TripPreferences | null> {
  const errors: string[] = [];

  const budget = parseBudget(raw.budgetAmount, raw.budgetCurrency, errors);

  const preferredLocationRaw = (raw.preferredLocation ?? "").trim();
  let preferredLocation: string | undefined;
  if (preferredLocationRaw) {
    if (preferredLocationRaw.length > PREFERRED_LOCATION_MAX_LENGTH) {
      errors.push(`Preferred location must be ${PREFERRED_LOCATION_MAX_LENGTH} characters or fewer.`);
    } else {
      preferredLocation = preferredLocationRaw;
    }
  }

  const priorities = parseClosedSet(raw.priorities, TRIP_PRIORITIES, { label: "trip priorities", max: MAX_TRIP_PRIORITIES }, errors);
  const essentialRequirements = parseClosedSet(raw.essentialRequirements, ESSENTIAL_REQUIREMENTS, { label: "essential requirements" }, errors);

  if (errors.length > 0) return { ok: false, errors };

  const value: TripPreferences = {};
  if (budget) value.budget = budget;
  if (preferredLocation) value.preferredLocation = preferredLocation;
  if (priorities) value.priorities = priorities;
  if (essentialRequirements) value.essentialRequirements = essentialRequirements;

  return { ok: true, value: Object.keys(value).length > 0 ? value : null };
}

// --- Persistence (de)serialisation -----------------------------------------
// trips.preferences_json is a nullable text column (see src/db/schema.ts).
// NULL = the traveller never touched the personalisation section, or this
// is a trip created before V2A Build 1 - both read back as `null` here,
// indistinguishably and without error, which is exactly what "existing
// trips must remain valid" requires.

export function serializeTripPreferences(prefs: TripPreferences | null): string | null {
  if (!prefs || Object.keys(prefs).length === 0) return null;
  return JSON.stringify(prefs);
}

/** Tolerant read: a NULL/legacy row, or any unexpected/corrupt JSON, comes back as null rather than throwing - a display page must never break on this. */
export function deserializeTripPreferences(raw: string | null | undefined): TripPreferences | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as TripPreferences;
  } catch {
    return null;
  }
}
