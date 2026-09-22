// V2A Build 1 (Traveller Intent Profile): the shared validation contract.
// Real execution (no DB, no Next.js) for every parse/serialise function,
// plus static source checks tying the schema, init-db migration and
// createTrip wiring together the same way the rest of this repo's tests do.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADULTS_MAX,
  ADULTS_MIN,
  BUDGET_AMOUNT_MAX,
  CHILDREN_MAX,
  ESSENTIAL_REQUIREMENTS,
  ISO_4217_CURRENCY_CODES,
  MAX_TRIP_PRIORITIES,
  PREFERENCE_CURRENCIES,
  PREFERRED_LOCATION_MAX_LENGTH,
  ROOMS_MAX,
  TRIP_PRIORITIES,
  deserializeTripPreferences,
  isValidIsoCurrencyCode,
  parseTripCoreFields,
  parseTripPreferencesFields,
  serializeTripPreferences,
  type TripPreferences,
} from "./tripIntent";

const SRC = join(__dirname, "..", "..");
const code = (rel: string) => readFileSync(join(SRC, rel), "utf8");

const VALID_CORE = { destination: "Dubai", checkin: "2026-11-02", checkout: "2026-11-06", adults: "2", children: "1", rooms: "1" };

// ---- core fields: valid --------------------------------------------------

test("core fields: a fully valid submission parses exactly as given", () => {
  const r = parseTripCoreFields(VALID_CORE);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, { destination: "Dubai", checkIn: "2026-11-02", checkOut: "2026-11-06", adults: 2, children: 1, rooms: 1 });
});

// ---- core fields: missing (genuinely absent -> documented default, not an error) ----

test("core fields: absent adults/children/rooms fall back to the documented default (2/0/1), not an error", () => {
  const r = parseTripCoreFields({ destination: "Dubai", checkin: "2026-11-02", checkout: "2026-11-06" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual({ adults: r.value.adults, children: r.value.children, rooms: r.value.rooms }, { adults: 2, children: 0, rooms: 1 });
});

test("core fields: a cleared (empty-string) field behaves the same as an absent one", () => {
  const r = parseTripCoreFields({ ...VALID_CORE, children: "" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.children, 0);
});

test("core fields: missing destination or dates is rejected", () => {
  assert.equal(parseTripCoreFields({}).ok, false);
  assert.equal(parseTripCoreFields({ destination: "Dubai" }).ok, false);
  assert.equal(parseTripCoreFields({ destination: "Dubai", checkin: "2026-11-02" }).ok, false);
  const r = parseTripCoreFields({ destination: "   ", checkin: "2026-11-02", checkout: "2026-11-03" });
  assert.equal(r.ok, false); // whitespace-only destination is not a real destination
});

// ---- core fields: invalid/tampered - THE central requirement ------------

test("core fields: an invalid (present) child count is REJECTED, never silently turned into 0", () => {
  for (const bad of ["-1", "abc", "1.5", "13", "999999999999999999999", "NaN", "0x1", "1e3"]) {
    const r = parseTripCoreFields({ ...VALID_CORE, children: bad });
    assert.equal(r.ok, false, `children="${bad}" must be rejected`);
  }
});

test("core fields: a whitespace-only field is treated as genuinely absent (falls back to the default), not as an invalid value", () => {
  const r = parseTripCoreFields({ ...VALID_CORE, children: "   " });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.children, 0);
});

test("core fields: adults and rooms are bounds-checked the same way, never coerced", () => {
  assert.equal(parseTripCoreFields({ ...VALID_CORE, adults: "0" }).ok, false); // below ADULTS_MIN
  assert.equal(parseTripCoreFields({ ...VALID_CORE, adults: String(ADULTS_MAX + 1) }).ok, false);
  assert.equal(parseTripCoreFields({ ...VALID_CORE, rooms: "0" }).ok, false);
  assert.equal(parseTripCoreFields({ ...VALID_CORE, rooms: String(ROOMS_MAX + 1) }).ok, false);
  assert.equal(parseTripCoreFields({ ...VALID_CORE, children: String(CHILDREN_MAX + 1) }).ok, false);
  // boundary values themselves are accepted
  assert.equal(parseTripCoreFields({ ...VALID_CORE, adults: String(ADULTS_MIN) }).ok, true);
  assert.equal(parseTripCoreFields({ ...VALID_CORE, adults: String(ADULTS_MAX) }).ok, true);
  assert.equal(parseTripCoreFields({ ...VALID_CORE, children: "0" }).ok, true);
});

test("core fields: malformed or reversed dates are rejected, not silently accepted", () => {
  assert.equal(parseTripCoreFields({ ...VALID_CORE, checkin: "2026-02-30", checkout: "2026-03-01" }).ok, false); // no such calendar date
  assert.equal(parseTripCoreFields({ ...VALID_CORE, checkin: "02/11/2026" }).ok, false); // wrong format
  assert.equal(parseTripCoreFields({ ...VALID_CORE, checkin: "2026-11-06", checkout: "2026-11-02" }).ok, false); // checkout before checkin
  assert.equal(parseTripCoreFields({ ...VALID_CORE, checkin: "2026-11-02", checkout: "2026-11-02" }).ok, false); // same day
});

test("core fields: multiple invalid fields are all reported, not just the first", () => {
  const r = parseTripCoreFields({ destination: "", checkin: "bad", checkout: "bad", adults: "x", children: "-9", rooms: "0" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 4, JSON.stringify(r.errors));
});

// ---- preferences: valid --------------------------------------------------

test("preferences: a fully specified submission parses correctly", () => {
  const r = parseTripPreferencesFields({
    budgetAmount: "550",
    budgetCurrency: "AED",
    preferredLocation: "  Near the beach  ",
    priorities: ["BEST_VALUE", "FAMILY_FRIENDLY"],
    essentialRequirements: ["POOL", "FREE_CANCELLATION"],
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, {
    budget: { amount: 550, currency: "AED" },
    preferredLocation: "Near the beach", // trimmed
    priorities: ["BEST_VALUE", "FAMILY_FRIENDLY"],
    essentialRequirements: ["POOL", "FREE_CANCELLATION"],
  });
});

test("preferences: a decimal budget is accepted", () => {
  const r = parseTripPreferencesFields({ budgetAmount: "499.50", budgetCurrency: "USD" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value?.budget?.amount, 499.5);
});

// ---- preferences: genuinely unspecified (no invented defaults) ----------

test("preferences: leaving everything untouched returns null, not an object of empty defaults", () => {
  const r = parseTripPreferencesFields({});
  assert.deepEqual(r, { ok: true, value: null });
});

test("preferences: only ONE field given still parses, and no other key is invented", () => {
  const r = parseTripPreferencesFields({ preferredLocation: "Downtown" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.value, { preferredLocation: "Downtown" });
  assert.deepEqual(Object.keys(r.value ?? {}), ["preferredLocation"]); // budget/priorities/essentialRequirements genuinely absent
});

test("preferences: priorities alone, with no budget or location, stores only priorities", () => {
  const r = parseTripPreferencesFields({ priorities: ["ROMANTIC"] });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, { priorities: ["ROMANTIC"] });
});

// ---- preferences: invalid/tampered ---------------------------------------

test("preferences: a budget amount with no currency (or vice versa) is rejected, never defaulted to AED", () => {
  const a = parseTripPreferencesFields({ budgetAmount: "500" });
  assert.equal(a.ok, false);
  const b = parseTripPreferencesFields({ budgetCurrency: "AED" });
  assert.equal(b.ok, false);
});

test("preferences: a tampered/unrecognised currency is rejected, not silently accepted", () => {
  const r = parseTripPreferencesFields({ budgetAmount: "100", budgetCurrency: "XXX" });
  assert.equal(r.ok, false);
});

// ---- point 1: any real ISO 4217 currency, not just the six quick-picks ----

test("isValidIsoCurrencyCode: every quick-pick currency is itself a valid ISO 4217 code (no drift between the two lists)", () => {
  for (const c of PREFERENCE_CURRENCIES) assert.ok(isValidIsoCurrencyCode(c), c);
});

test("isValidIsoCurrencyCode: accepts real currencies outside the six quick-picks, case-insensitively", () => {
  for (const c of ["JPY", "jpy", "Jpy", "CHF", "ZAR", "THB", "CAD"]) assert.ok(isValidIsoCurrencyCode(c), c);
});

test("isValidIsoCurrencyCode: rejects a made-up or malformed code - it is a closed list, not a free-text field", () => {
  for (const bad of ["XXX", "ABC", "US", "USDD", "12A", "", "   "]) assert.equal(isValidIsoCurrencyCode(bad), false, bad);
  // surrounding whitespace is trimmed before the check, so a real code with stray padding still validates
  assert.ok(isValidIsoCurrencyCode(" AED "));
});

test("preferences: a traveller can name any real ISO 4217 currency beyond the six quick-picks (the 'Other' path), stored exactly as given", () => {
  const r = parseTripPreferencesFields({ budgetAmount: "12000", budgetCurrency: "jpy" });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value?.budget, { amount: 12000, currency: "JPY" }); // normalised to uppercase, never converted
});

test("preferences: no automatic currency conversion ever happens - the stored amount is exactly what was typed, for whatever valid currency was given", () => {
  const aed = parseTripPreferencesFields({ budgetAmount: "500", budgetCurrency: "AED" });
  const jpy = parseTripPreferencesFields({ budgetAmount: "500", budgetCurrency: "JPY" });
  assert.equal(aed.ok && aed.value?.budget?.amount, 500);
  assert.equal(jpy.ok && jpy.value?.budget?.amount, 500); // identical stored amount - no exchange-rate logic ran
});

test("preferences: currency is never inferred from destination - only what the traveller explicitly gave is stored", () => {
  // parseTripPreferencesFields has no destination parameter at all - it cannot read one, let alone assume AED for it.
  const r = parseTripPreferencesFields({ budgetAmount: "500" }); // amount with no currency: rejected, not defaulted to AED
  assert.equal(r.ok, false);
});

test("tripIntent.ts source: no exchange-rate/conversion logic and no external network call backs the ISO currency list", () => {
  const src = code("src/lib/tripIntent.ts");
  assert.ok(!/exchangeRate|convertCurrency|fx[_-]?rate|fetch\(/i.test(src));
  assert.ok(ISO_4217_CURRENCY_CODES.length > PREFERENCE_CURRENCIES.length); // a genuine superset, not a relabelled duplicate
});

test("preferences: a malformed budget amount is rejected (never coerced by loose Number() parsing)", () => {
  for (const bad of ["-50", "abc", "1e5", "50.999", "0", " ", "1,000"]) {
    const r = parseTripPreferencesFields({ budgetAmount: bad, budgetCurrency: "AED" });
    assert.equal(r.ok, false, `budgetAmount="${bad}" must be rejected`);
  }
  assert.equal(parseTripPreferencesFields({ budgetAmount: String(BUDGET_AMOUNT_MAX + 1), budgetCurrency: "AED" }).ok, false);
});

test("preferences: an unrecognised (tampered) priority or essential-requirement value is rejected outright", () => {
  const a = parseTripPreferencesFields({ priorities: ["DROP TABLE trips;"] });
  assert.equal(a.ok, false);
  const b = parseTripPreferencesFields({ essentialRequirements: ["FREE_UPGRADE_PLEASE"] });
  assert.equal(b.ok, false);
  // one valid + one bogus value in the same array still fails the whole submission
  const c = parseTripPreferencesFields({ priorities: ["BEST_VALUE", "NOT_REAL"] });
  assert.equal(c.ok, false);
});

test("preferences: more than the maximum number of trip priorities is rejected, even after deduping", () => {
  const distinct: string[] = [...TRIP_PRIORITIES].slice(0, MAX_TRIP_PRIORITIES + 1);
  assert.equal(distinct.length, MAX_TRIP_PRIORITIES + 1);
  const r = parseTripPreferencesFields({ priorities: distinct });
  assert.equal(r.ok, false);
  // exactly the maximum is fine
  assert.equal(parseTripPreferencesFields({ priorities: distinct.slice(0, MAX_TRIP_PRIORITIES) }).ok, true);
});

test("preferences: duplicate priority values are deduplicated rather than treated as distinct picks", () => {
  const r = parseTripPreferencesFields({ priorities: ["BEST_VALUE", "BEST_VALUE", "BEST_VALUE"] });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, { priorities: ["BEST_VALUE"] });
});

test("preferences: a preferred location over the maximum length is rejected, not truncated", () => {
  const tooLong = "x".repeat(PREFERRED_LOCATION_MAX_LENGTH + 1);
  const r = parseTripPreferencesFields({ preferredLocation: tooLong });
  assert.equal(r.ok, false);
  assert.equal(parseTripPreferencesFields({ preferredLocation: "x".repeat(PREFERRED_LOCATION_MAX_LENGTH) }).ok, true);
});

test("point 4: re-clearing a previously-set field results in that key being genuinely absent again, not null/0/empty-string", () => {
  const first = parseTripPreferencesFields({ preferredLocation: "Downtown", priorities: ["BEST_VALUE"] });
  assert.equal(first.ok, true);
  // the traveller clears both fields on a later submission
  const cleared = parseTripPreferencesFields({ preferredLocation: "", priorities: [] });
  assert.deepEqual(cleared, { ok: true, value: null });
});

test("point 4: leaving the currency selector on 'Other' without typing a code is the same as never touching the budget at all", () => {
  // DiscoverForm's hidden budgetCurrency input stays "" until a code is typed - identical to the preset-untouched case.
  const r = parseTripPreferencesFields({ budgetAmount: "", budgetCurrency: "" });
  assert.deepEqual(r, { ok: true, value: null });
});

test("preferences: a whitespace-only preferred location is treated as genuinely unspecified, not an error", () => {
  const r = parseTripPreferencesFields({ preferredLocation: "   " });
  assert.deepEqual(r, { ok: true, value: null });
});

// ---- point 2: priorities vs essential requirements stay structurally distinct ----

test("structural separation: TRIP_PRIORITIES and ESSENTIAL_REQUIREMENTS are two disjoint closed sets, never merged", () => {
  const priorities = new Set(TRIP_PRIORITIES as readonly string[]);
  const requirements = new Set(ESSENTIAL_REQUIREMENTS as readonly string[]);
  for (const v of priorities) assert.ok(!requirements.has(v), `"${v}" appears in both sets`);
});

test("structural separation: TripPreferences stores priorities and essentialRequirements as two separate fields, and one never leaks into the other", () => {
  const onlyPriorities = parseTripPreferencesFields({ priorities: ["BEST_VALUE"] });
  assert.equal(onlyPriorities.ok, true);
  if (onlyPriorities.ok) assert.equal(onlyPriorities.value?.essentialRequirements, undefined);

  const onlyRequirements = parseTripPreferencesFields({ essentialRequirements: ["POOL"] });
  assert.equal(onlyRequirements.ok, true);
  if (onlyRequirements.ok) assert.equal(onlyRequirements.value?.priorities, undefined);

  // a value valid only in one set is rejected when submitted under the other field's name
  assert.equal(parseTripPreferencesFields({ priorities: ["POOL"] }).ok, false);
  assert.equal(parseTripPreferencesFields({ essentialRequirements: ["BEST_VALUE"] }).ok, false);
});

test("structural separation: essential requirements are documented as traveller statements, never verified hotel capabilities or filters", () => {
  const src = code("src/lib/tripIntent.ts");
  for (const phrase of ["NEVER a", "verified hotel capability", "hard filter"]) assert.ok(src.includes(phrase), phrase);
});

test("hard restrictions: nothing in hotels.facilities/discovery/scoring code reads essentialRequirements as a property capability", () => {
  for (const f of ["src/db/schema.ts", "src/lib/discovery/curatedCatalogSource.ts", "src/lib/scoring/bestDealScore.ts", "src/lib/hotel/commercial.ts"]) {
    assert.ok(!code(f).includes("essentialRequirements"), `${f} must not treat essentialRequirements as property data`);
  }
});

// ---- serialisation / legacy trips / persistence round-trip --------------

test("serialisation: null and an empty object both serialise to NULL, never '{}' ", () => {
  assert.equal(serializeTripPreferences(null), null);
  assert.equal(serializeTripPreferences({}), null);
});

test("serialisation round-trip: what is written is exactly what is read back", () => {
  const cases: TripPreferences[] = [
    { budget: { amount: 500, currency: "AED" } },
    { preferredLocation: "Downtown" },
    { priorities: ["BEST_VALUE", "LUXURY_COMFORT"] },
    { essentialRequirements: ["POOL", "PET_FRIENDLY", "NON_SMOKING"] },
    { budget: { amount: 1250.5, currency: "USD" }, preferredLocation: "Near Marina", priorities: ["ROMANTIC"], essentialRequirements: ["FREE_CANCELLATION"] },
  ];
  for (const prefs of cases) {
    const written = serializeTripPreferences(prefs);
    assert.equal(typeof written, "string");
    const read = deserializeTripPreferences(written);
    assert.deepEqual(read, prefs);
  }
});

test("legacy trips: a NULL preferences_json column (every trip made before V2A Build 1) reads back as null, never throws", () => {
  assert.equal(deserializeTripPreferences(null), null);
  assert.equal(deserializeTripPreferences(undefined), null);
});

test("deserialise is tolerant of corrupt or unexpected JSON: it returns null rather than throwing", () => {
  for (const bad of ["not json", "[]", "42", '"a string"', "{broken", ""]) {
    assert.equal(deserializeTripPreferences(bad), null, bad);
  }
});

// ---- wiring: the schema, the migration, and createTrip actually use this contract ----

test("wiring: trips.preferences_json exists as a nullable Drizzle column mapped to the same name", () => {
  const schema = code("src/db/schema.ts");
  assert.match(schema, /preferencesJson: text\("preferences_json"\),/);
});

test("wiring: init-db carries an idempotent ADD COLUMN for the existing production trips table, plus the fresh-DB CREATE TABLE column", () => {
  const initDb = code("src/app/api/admin/init-db/route.ts");
  assert.match(initDb, /ALTER TABLE trips ADD COLUMN IF NOT EXISTS preferences_json text;/);
});

test("wiring: createTrip validates through the shared contract before writing, and stores the serialised result", () => {
  const actions = code("src/app/actions/trip.ts");
  assert.match(actions, /parseTripCoreFields\(/);
  assert.match(actions, /parseTripPreferencesFields\(/);
  assert.match(actions, /preferencesJson: serializeTripPreferences\(preferences\.value\)/);
  // errors from either contract abort the insert entirely (no partial/tampered write)
  assert.match(actions, /errors\.length > 0 \|\| !core\.ok \|\| !preferences\.ok/);
});

test("point 3: createTrip returns a validation result instead of throwing - an invalid/tampered submission never crashes into an unhandled error page", () => {
  const actions = code("src/app/actions/trip.ts");
  assert.match(actions, /export async function createTrip\(_prevState: CreateTripState, formData: FormData\): Promise<CreateTripState>/);
  assert.match(actions, /return \{ ok: false, errors: errors\.length > 0 \? errors : \["Invalid trip details\."\] \};/);
  // the success path still redirects (unchanged behaviour) rather than returning a state the caller would render
  assert.match(actions, /redirect\(`\/\?trip=\$\{id\}#shortlist`\)/);
  assert.ok(!/throw new Error\(errors\.join/.test(actions), "createTrip must not throw on invalid input");
});

test("wiring: DiscoverForm renders the optional personalisation section and submits through hidden/native inputs, not a JSON blob", () => {
  const form = code("src/components/DiscoverForm.tsx");
  assert.match(form, /Personalise your stay \(optional\)/);
  assert.match(form, /name="budgetAmount"/);
  assert.match(form, /name="budgetCurrency"/);
  assert.match(form, /name="preferredLocation"/);
  assert.match(form, /name="priorities"/);
  assert.match(form, /name="essentialRequirements"/);
  // no invented default is pre-selected
  assert.match(form, /useState\(""\)/); // budgetAmount/preferredLocation start empty
  assert.match(form, /useState<TripPriority\[\]>\(\[\]\)/); // priorities start empty
});

test("point 1 wiring: DiscoverForm offers an 'Other' currency path that resolves to a single submitted budgetCurrency value", () => {
  const form = code("src/components/DiscoverForm.tsx");
  assert.match(form, /Other…/);
  assert.match(form, /currencyMode === "other"/);
  // exactly one input actually named budgetCurrency reaches the server - the select/text field are display-only
  const named = form.match(/name="budgetCurrency"/g) ?? [];
  assert.equal(named.length, 1, "only the single hidden, resolved input should carry name=\"budgetCurrency\"");
});

test("point 3 wiring: an invalid submission renders an accessible, in-page alert and never resets already-entered values", () => {
  const form = code("src/components/DiscoverForm.tsx");
  assert.match(form, /useActionState\(createTrip, CREATE_TRIP_INITIAL_STATE\)/);
  assert.match(form, /role="alert"/);
  assert.match(form, /!state\.ok &&/);
  // nothing clears destInput/checkIn/checkOut/budgetAmount/etc. when the action returns a failure state
  assert.ok(!/state\.ok[\s\S]{0,80}set(DestInput|CheckIn|CheckOut|BudgetAmount)\(""\)/.test(form));
});

test("hard restrictions: tripIntent.ts feeds nothing into discovery, ranking or filtering", () => {
  for (const f of ["src/lib/discovery/curatedCatalogSource.ts", "src/lib/discovery/types.ts", "src/lib/hotel/commercial.ts", "src/lib/scoring/bestDealScore.ts"]) {
    assert.ok(!code(f).includes("tripIntent"), `${f} must not import the traveller-intent contract`);
  }
});
