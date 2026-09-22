// GitHub Issue #3 follow-up (2026-09-23): the Discover-to-JOALI connection.
// A Maldives search previously created a trip exactly like any other
// destination but had no path from it to /joali - no visible trip id, no
// JOALI link, only the generic "we're curating this destination" notice.
//
// isJoaliEligibleDestination is pure and DB-free, so it's tested directly
// and behaviourally. exploreJoaliFromDiscover/createTrip/DiscoverForm.tsx/
// page.tsx are DB-bound or client-only (same limitation as every other
// Hotel V1 action in this repo - see hotelV1.test.ts/joali.test.ts's own
// convention), so they're covered by static source checks: reused
// validation, independent server-side re-checks, and that nothing else
// (the curation notice, the discovery gate, other destinations) changed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isJoaliEligibleDestination, isJoaliStagingEnabled } from "./joaliStagingGate";

const SRC = join(__dirname, "..", "..");
const code = (rel: string) =>
  readFileSync(join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

// trip.ts predates this change and has other, unrelated functions
// (selectProperty, addTripExperience, ...) after the ones this task
// added/changed - every slice below is bounded at both ends so it can never
// accidentally capture that unrelated code.
const TRIP_ACTIONS = code("app/actions/trip.ts");
const HELPER_START = TRIP_ACTIONS.indexOf("async function createTripFromFormData(");
const CREATE_TRIP_START = TRIP_ACTIONS.indexOf("export async function createTrip(");
const EXPLORE_START = TRIP_ACTIONS.indexOf("export async function exploreJoaliFromDiscover(");
const NEXT_UNRELATED_FN = TRIP_ACTIONS.indexOf("export async function selectProperty(");
assert.ok(
  HELPER_START >= 0 && CREATE_TRIP_START > HELPER_START && EXPLORE_START > CREATE_TRIP_START && NEXT_UNRELATED_FN > EXPLORE_START,
  "expected function boundaries not found in app/actions/trip.ts"
);
const helperBody = TRIP_ACTIONS.slice(HELPER_START, CREATE_TRIP_START);
const createTripBody = TRIP_ACTIONS.slice(CREATE_TRIP_START, EXPLORE_START);
const exploreBody = TRIP_ACTIONS.slice(EXPLORE_START, NEXT_UNRELATED_FN);

// ---- 1: isJoaliEligibleDestination - the actual gate+destination decision -

test("1: gate off - never eligible, whatever the destination", () => {
  assert.equal(isJoaliEligibleDestination("Maldives", {}), false);
  assert.equal(isJoaliEligibleDestination("Maldives", { JOALI_STAGING_ENABLED: "false" }), false);
  assert.equal(isJoaliEligibleDestination("Maldives", { JOALI_STAGING_ENABLED: "1" }), false);
});

test("2: gate on, Maldives (any casing/surrounding whitespace) - eligible", () => {
  const on = { JOALI_STAGING_ENABLED: "true" };
  for (const d of ["Maldives", "maldives", "MALDIVES", "  Maldives  ", "\tMaldives\n"]) {
    assert.equal(isJoaliEligibleDestination(d, on), true, JSON.stringify(d));
  }
});

test("3: gate on, any non-Maldives destination - never eligible", () => {
  const on = { JOALI_STAGING_ENABLED: "true" };
  for (const d of ["Dubai", "Maldives Islands", "The Maldives", "Malé", "", "  "]) {
    assert.equal(isJoaliEligibleDestination(d, on), false, d);
  }
});

test("4: isJoaliEligibleDestination re-derives the gate itself - it is not a rubber stamp for a caller-supplied flag", () => {
  // same fail-closed contract as isJoaliStagingEnabled - confirms it's actually calling through
  assert.equal(isJoaliStagingEnabled({ JOALI_STAGING_ENABLED: "true" }), true);
  assert.equal(isJoaliEligibleDestination("Maldives", { JOALI_STAGING_ENABLED: "TRUE" }), false, "case-sensitive, same as the gate itself");
});

// ---- 5-9: exploreJoaliFromDiscover reuses the same validated creation path,

test("5: exploreJoaliFromDiscover reuses createTripFromFormData - the same validated parse/insert createTrip uses, not a second copy", () => {
  assert.match(createTripBody, /await createTripFromFormData\(formData\)/);
  assert.match(exploreBody, /await createTripFromFormData\(formData\)/);
  // createTrip/exploreJoaliFromDiscover themselves parse core fields / insert
  // into trips ZERO times each - both delegate entirely to the one shared helper
  assert.equal((createTripBody.match(/parseTripCoreFields\(|db\.insert\(schema\.trips\)/g) ?? []).length, 0);
  assert.equal((exploreBody.match(/parseTripCoreFields\(|db\.insert\(schema\.trips\)/g) ?? []).length, 0);
  // the helper itself is the one and only place that does either
  assert.equal((helperBody.match(/parseTripCoreFields\(/g) ?? []).length, 1);
  assert.equal((helperBody.match(/db\.insert\(schema\.trips\)/g) ?? []).length, 1);
});

test("6: exploreJoaliFromDiscover independently re-derives eligibility from the CREATED trip's own destination, never from client input directly", () => {
  assert.match(exploreBody, /isJoaliEligibleDestination\(result\.trip\.destination\)/);
  // it does not read formData.get("destination") a second time for this decision
  const beforeCall = exploreBody.slice(0, exploreBody.indexOf("isJoaliEligibleDestination"));
  assert.ok(!/formData\.get\("destination"\)/.test(beforeCall));
});

test("7: invalid input is rejected before any JOALI/gate decision is made, and never redirects to /joali", () => {
  const invalidAt = exploreBody.search(/if \(!result\.ok\) \{\s*redirect\("\/"\);/);
  const eligibleAt = exploreBody.search(/isJoaliEligibleDestination/);
  assert.ok(invalidAt >= 0, "invalid-input redirect present");
  assert.ok(invalidAt < eligibleAt, "invalid input must short-circuit before the JOALI decision runs");
});

test("8: gate-off or non-Maldives falls back to the exact same outcome as the normal Explore button - never a rejected search", () => {
  assert.match(exploreBody, /redirect\(`\/\?trip=\$\{result\.trip\.id\}#shortlist`\);/);
  assert.match(createTripBody, /redirect\(`\/\?trip=\$\{result\.trip\.id\}#shortlist`\);/);
});

test("9: on success and eligibility, redirects to /joali with the actual persisted trip id - never a fixed/placeholder id", () => {
  assert.match(exploreBody, /redirect\(`\/joali\?trip=\$\{result\.trip\.id\}`\);/);
});

// ---- 10-13: DiscoverForm - the button is a UI hint only, server-gated -----

test("10: DiscoverForm shows the JOALI button only when the server-passed gate is on AND the typed destination is Maldives", () => {
  const form = code("components/DiscoverForm.tsx");
  assert.match(form, /const isMaldivesInput = normalise\(destInput\) === "maldives";/);
  assert.match(form, /\{joaliStagingEnabled && isMaldivesInput && \(/);
});

test("11: the JOALI button submits via its OWN formAction (exploreJoaliFromDiscover), not the form's default createTrip action", () => {
  const form = code("components/DiscoverForm.tsx");
  assert.match(form, /import \{ createTrip, exploreJoaliFromDiscover \} from "@\/app\/actions\/trip";/);
  assert.match(form, /formAction=\{exploreJoaliFromDiscover\}/);
  // the form's own action is still createTrip via useActionState, unchanged
  assert.match(form, /useActionState\(createTrip, CREATE_TRIP_INITIAL_STATE\)/);
});

test("12: joaliStagingEnabled is computed server-side in page.tsx (isJoaliStagingEnabled) and passed down - DiscoverForm never reads process.env itself", () => {
  const page = code("app/page.tsx");
  assert.match(page, /import \{ isJoaliStagingEnabled \} from "@\/lib\/hotel\/joaliStagingGate";/);
  assert.match(page, /joaliStagingEnabled=\{isJoaliStagingEnabled\(\)\}/);
  const form = code("components/DiscoverForm.tsx");
  assert.ok(!/process\.env/.test(form), "DiscoverForm must not read env vars itself - it only trusts the server-computed prop");
});

test("13: the existing curation notice and interest-registration form are untouched for every destination", () => {
  const form = code("components/DiscoverForm.tsx");
  assert.match(form, /useState\(Boolean\(defaultDestination\) && !destinationSupported\)/);
  assert.match(form, /We&apos;re curating this destination\./);
  assert.match(form, /const result = await recordDestinationInterest\(destInput, interestName, interestEmail\);/);
  // the JOALI button is additive - it never replaces or wraps the unsupported block
  const unsupportedBlock = form.slice(form.indexOf("{unsupported && ("), form.indexOf("Explore this destination"));
  assert.ok(!/exploreJoaliFromDiscover|joaliStagingEnabled/.test(unsupportedBlock), "the curation notice must not reference JOALI at all");
});

// ---- 14: nothing here reopens discovery, catalogue, or StayingAPI ---------

// trip.ts predates this change and has other, unrelated functions
// (selectProperty, addTripExperience, ...) that legitimately touch
// db.query.hotels/AED for their own reasons - these two checks scope to
// just the code this task added/changed (the shared, bounded slices above),
// not the whole pre-existing file.
const joaliRelatedActionsCode = helperBody + createTripBody + exploreBody;

test("14: this connection never touches the discovery gate, the hotels catalogue, or StayingAPI", () => {
  const FORBIDDEN = /LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED\s*=\s*true|db\.query\.hotels|db\.select.*schema\.hotels|stayingApi|staying_api|runSearch|SUPPLIER_ADAPTERS|STAYINGAPI/;
  assert.ok(!FORBIDDEN.test(joaliRelatedActionsCode), "app/actions/trip.ts (createTripFromFormData/createTrip/exploreJoaliFromDiscover)");
  for (const f of ["components/DiscoverForm.tsx", "lib/hotel/joaliStagingGate.ts"]) {
    assert.ok(!FORBIDDEN.test(code(f)), f);
  }
  assert.match(code("lib/discovery/index.ts"), /export const LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED = false;/);
});

test("15: no resort imagery or fabricated rate/availability copy was added anywhere in this change", () => {
  const RATE_CLAIM = /\bAED\b|\bUSD\b|available now|rooms left|book now/i;
  assert.ok(!RATE_CLAIM.test(joaliRelatedActionsCode), "app/actions/trip.ts (createTripFromFormData/createTrip/exploreJoaliFromDiscover) implies rates/availability");
  for (const f of ["components/DiscoverForm.tsx", "lib/hotel/joaliStagingGate.ts"]) {
    const src = code(f);
    assert.ok(!/<img|backgroundImage|url\(https?:/.test(src), `${f} carries imagery`);
    assert.ok(!RATE_CLAIM.test(src), `${f} implies rates/availability`);
  }
});
