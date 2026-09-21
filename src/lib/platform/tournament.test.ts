// Tournament domain + final-validation gate + price-watch scaffold.
// Pure, deterministic, no network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SEMIFINALIST_MAX,
  admitQuarterfinalists,
  candidatesAt,
  chooseFinalist,
  clearFinalist,
  narrowToSemifinalists,
  restoreTournament,
  stageOf,
} from "./tournament";
import { commercialStage, type FinalValidation } from "./finalValidation";
import { PRICE_WATCH_CAPABILITY, WATCH_LABELS, createPriceWatchIntent, watchAvailability } from "./priceWatch";
import { MemoryPlatformStore } from "./memoryStore";
import { addComponent } from "./service";
import { TOWER_KINDS, type TowerKind } from "./types";

const here = __dirname;
const src = (f: string) => readFileSync(join(here, f), "utf8");
const code = (f: string) =>
  src(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const cands = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, label: `Candidate ${i + 1}` }));

test("all four component kinds support Quarterfinalist -> Semifinalist -> Finalist narrowing", () => {
  assert.deepEqual([...TOWER_KINDS], ["hotel", "flight", "rail", "cruise"]);
  for (const kind of TOWER_KINDS) {
    let t = admitQuarterfinalists(kind, cands(6));
    assert.equal(candidatesAt(t, "quarterfinalist").length, 6);
    t = narrowToSemifinalists(t, ["c2", "c4", "c5"]);
    assert.deepEqual(candidatesAt(t, "semifinalist").map((c) => c.id), ["c2", "c4", "c5"]);
    assert.equal(stageOf(t, "c1"), "quarterfinalist");
    t = chooseFinalist(t, "c4", "traveller");
    assert.equal(stageOf(t, "c4"), "finalist");
    assert.equal(t.kind, kind);
    assert.deepEqual(candidatesAt(t, "finalist").map((c) => c.id), ["c4"]);
  }
});

test("Finalist selection is explicit: only a traveller choice of an existing Semifinalist", () => {
  const t0 = admitQuarterfinalists("flight", cands(4));
  assert.equal(t0.finalistId, null); // never auto-selected, however few candidates
  assert.throws(() => chooseFinalist(t0, "c1", "traveller"), /Not a semifinalist/); // a Quarterfinalist cannot skip a stage
  const t1 = narrowToSemifinalists(t0, ["c1"]);
  assert.equal(t1.finalistId, null); // a single semifinalist is still not auto-chosen
  assert.throws(() => chooseFinalist(t1, "c1", "system" as unknown as "traveller"), /only be chosen by the traveller/);
  assert.throws(() => chooseFinalist(t1, "nope", "traveller"), /Not a semifinalist/);
  const t2 = chooseFinalist(t1, "c1", "traveller");
  assert.equal(t2.finalistChosenBy, "traveller");
  // narrowing the Semifinalists so the Finalist drops out clears it
  const t3 = narrowToSemifinalists(t2, ["c2", "c3"]);
  assert.equal(t3.finalistId, null);
  assert.equal(t3.finalistChosenBy, null);
  assert.equal(clearFinalist(t2).finalistId, null);
  // the input tournament was never mutated (immutable state)
  assert.equal(t2.finalistId, "c1");
  assert.ok(Object.isFrozen(t2));
});

test("semifinalist limits and validation: 1..5, must be quarterfinalists, no duplicates", () => {
  const t = admitQuarterfinalists("hotel", cands(8));
  assert.equal(SEMIFINALIST_MAX, 5);
  assert.throws(() => narrowToSemifinalists(t, ["c1", "c2", "c3", "c4", "c5", "c6"]), /At most 5/);
  assert.throws(() => narrowToSemifinalists(t, []), /At least one/);
  assert.throws(() => narrowToSemifinalists(t, ["c1", "zzz"]), /Not a quarterfinalist/);
  assert.throws(() => narrowToSemifinalists(t, ["c1", "c1"]), /Duplicate/);
  assert.throws(() => admitQuarterfinalists("hotel", [{ id: "a" }, { id: "a" }]), /Duplicate/);
});

test("affiliate economics cannot affect advancement: no commercial/ranking data can enter, and order is never re-sorted", () => {
  for (const key of ["commission", "affiliateNetwork", "payoutRate", "campaignId", "trackingUrl", "subid", "accessRoute", "routeType", "eligibility", "sponsored", "priority", "boost", "rank", "score", "recommended", "bestDeal", "winner", "revenue"]) {
    assert.throws(() => admitQuarterfinalists("hotel", [{ id: "x", facts: { [key]: 1 } }]), /commercial\/ranking data/, key);
  }
  assert.throws(() => admitQuarterfinalists("hotel", [{ id: "x", facts: { nested: { commission: 1 } } as never }]), /commercial\/ranking data/);

  const t = admitQuarterfinalists("rail", [{ id: "z" }, { id: "a" }, { id: "m" }]);
  assert.deepEqual(t.candidates.map((c) => c.id), ["z", "a", "m"]); // source order, not alphabetical, not "best"
  const s = narrowToSemifinalists(t, ["m", "z"]);
  assert.deepEqual(s.semifinalistIds, ["z", "m"]); // quarterfinalist order preserved

  // The tournament module has no commercial dependency at all, and no operation takes commercial input.
  const imports = code("tournament.ts").split("\n").filter((l) => /^\s*import\b/.test(l));
  assert.deepEqual(imports.map((l) => l.trim()), ['import type { TowerKind } from "./types";']);
  assert.ok(!/merchant|accessRoute|CommercialRoute|attribution|cuelinks|linkkit|dcm/i.test(code("tournament.ts").replace(FORBID_LITERAL, "")));
});

// The forbidden-key regex literal in tournament.ts intentionally names commercial words to REFUSE them.
const FORBID_LITERAL = /const FORBIDDEN_CANDIDATE_KEY =[\s\S]*?;\n/;

test("commercial modules cannot advance a candidate: none of them imports or calls a tournament mutator", () => {
  const MUTATORS = /admitQuarterfinalists|narrowToSemifinalists|chooseFinalist|clearFinalist|restoreTournament/;
  for (const f of ["accessAdapter.ts", "linkkitAccess.ts", "dcmTuneAccess.ts", "commercialRegister.ts", "handoff.ts", "attribution.ts", "cuelinksAccess.ts", "route.ts"]) {
    assert.ok(!MUTATORS.test(code(f)), `${f} must not touch tournament stage transitions`);
  }
  // handoff.ts sees a Tournament only as a type
  assert.match(code("handoff.ts"), /import type \{ Tournament \} from "\.\/tournament";/);
});

test("restoreTournament rebuilds journey state (Hotel: catalogue results, shortlist, chosen property) with validation", () => {
  const t = restoreTournament("hotel", cands(12), { semifinalistIds: ["c3", "c7"], finalistId: "c7" });
  assert.equal(stageOf(t, "c7"), "finalist");
  assert.equal(stageOf(t, "c3"), "semifinalist");
  // a chosen property that is not on the shortlist still becomes a valid Finalist (it is added as a Semifinalist)
  const u = restoreTournament("hotel", cands(12), { semifinalistIds: ["c3"], finalistId: "c9" });
  assert.deepEqual(u.semifinalistIds, ["c3", "c9"]);
  assert.throws(() => restoreTournament("hotel", cands(3), { finalistId: "ghost" }), /Not a quarterfinalist/);
});

// ---- final validation gate ---------------------------------------------------

const readyTournament = (kind: TowerKind) => chooseFinalist(narrowToSemifinalists(admitQuarterfinalists(kind, cands(3)), ["c1", "c2"]), "c1", "traveller");
const checkIq = (over: Partial<Extract<FinalValidation, { kind: "check_iq" }>> = {}): FinalValidation => ({ kind: "check_iq", authorized: true, rateVerification: "unavailable", ...over });
const factual: FinalValidation = { kind: "factual_confirmation", confirmed: true, confirmedFacts: ["fare", "conditions"] };

test("tower final validation: Hotel needs Check IQ; Flight/Rail/Cruise need factual confirmation and never an IQ step", () => {
  assert.deepEqual(commercialStage(readyTournament("hotel"), checkIq()), { allowed: true });
  for (const kind of ["flight", "rail", "cruise"] as const) {
    assert.deepEqual(commercialStage(readyTournament(kind), factual), { allowed: true });
    assert.deepEqual(commercialStage(readyTournament(kind), checkIq()), { allowed: false, reason: "wrong_validation_for_tower" }); // no Flight/Rail/Cruise IQ
    assert.deepEqual(commercialStage(readyTournament(kind), { kind: "factual_confirmation", confirmed: false, confirmedFacts: ["fare"] }), { allowed: false, reason: "validation_not_completed" });
    assert.deepEqual(commercialStage(readyTournament(kind), { kind: "factual_confirmation", confirmed: true, confirmedFacts: [] }), { allowed: false, reason: "validation_not_completed" });
  }
});

test("Hotel commercial stage cannot bypass Check IQ: no finalist, no validation, unauthorized or wrong validation all block", () => {
  const semis = narrowToSemifinalists(admitQuarterfinalists("hotel", cands(3)), ["c1", "c2"]);
  assert.deepEqual(commercialStage(semis, checkIq()), { allowed: false, reason: "no_finalist" }); // Compare set alone is not enough
  assert.deepEqual(commercialStage(readyTournament("hotel"), null), { allowed: false, reason: "validation_missing" });
  assert.deepEqual(commercialStage(readyTournament("hotel"), checkIq({ authorized: false })), { allowed: false, reason: "validation_not_completed" });
  assert.deepEqual(commercialStage(readyTournament("hotel"), factual), { allowed: false, reason: "wrong_validation_for_tower" });
  // an unverified rate (today's truthful state) does not fabricate verification, and does not itself block continuing past Check IQ
  assert.equal((checkIq() as { rateVerification: string }).rateVerification, "unavailable");
});

test("the existing Check IQ authorization gate is unchanged and remains the only mechanism", () => {
  const page = code("../../app/check-iq/page.tsx");
  assert.match(page, /if \(authorized !== "1"\) \{[\s\S]*?redirect\(compareUrl\);[\s\S]*?\}/);
  assert.match(page, /const authorized = params\.authorized;/);
});

// ---- price watch scaffold ------------------------------------------------------

test("Price Watch: labels preserved, belongs to the decision, no polling/alerts, nothing commercial", async () => {
  assert.equal(WATCH_LABELS.hotel, "Watch this rate");
  assert.equal(WATCH_LABELS.flight, "Watch this fare");
  assert.equal(WATCH_LABELS.rail, "Watch this fare");
  assert.equal(WATCH_LABELS.cruise, null);
  assert.deepEqual(PRICE_WATCH_CAPABILITY, { pollingAvailable: false, alertsAvailable: false, historyAvailable: false, requiresAuthorizedRepeatablePricingSource: true });
  for (const k of TOWER_KINDS) assert.equal(watchAvailability(k).available, false);
  assert.equal(watchAvailability("cruise").reason, "not_in_contract");

  const store = new MemoryPlatformStore();
  const stay = { destination: "Dubai", checkIn: "2026-11-02", checkOut: "2026-11-06", rooms: 1, adults: 2, children: 0, propertyId: "sofitel-dubai-the-palm" };
  const component = await addComponent(store, { tripId: "t1", kind: "hotel", input: stay });
  const t = chooseFinalist(narrowToSemifinalists(admitQuarterfinalists("hotel", [{ id: "sofitel-dubai-the-palm" }, { id: "x" }]), ["sofitel-dubai-the-palm"]), "sofitel-dubai-the-palm", "traveller");
  const w = createPriceWatchIntent({ component, tournament: t, conditions: ["Free cancellation until 30 Oct"], target: { currency: "AED", amount: 1800 } });
  assert.equal(w.label, "Watch this rate");
  assert.equal(w.status, "scaffold_only");
  assert.deepEqual(w.context, stay); // dates, travellers, rooms, property retained
  assert.notEqual(w.context, component.input); // a copy, not a reference
  assert.deepEqual(w.conditions, ["Free cancellation until 30 Oct"]);
  for (const k of ["merchant", "accessRoute", "attribution", "route", "url", "campaign"]) assert.ok(!(k in w), `watch must not carry ${k}`);

  // needs a traveller-chosen Finalist; not defined for Cruise; validates target
  const noFinal = narrowToSemifinalists(admitQuarterfinalists("hotel", [{ id: "sofitel-dubai-the-palm" }]), ["sofitel-dubai-the-palm"]);
  assert.throws(() => createPriceWatchIntent({ component, tournament: noFinal }), /choose a Finalist/);
  assert.throws(() => createPriceWatchIntent({ component, tournament: t, target: { currency: "AED", amount: -1 } }), /Invalid watch target/);
  const cruise = await addComponent(store, { tripId: "t1", kind: "cruise", input: { query: "Med" } });
  assert.throws(() => createPriceWatchIntent({ component: cruise, tournament: readyTournament("cruise") }), /not part of the cruise contract/);
  assert.throws(() => createPriceWatchIntent({ component, tournament: readyTournament("flight") }), /Tournament is for flight/);

  // no polling / alert / notification machinery exists in the module
  assert.ok(!/setInterval|setTimeout|fetch\(|notify|email|sms|cron|probability|forecast/i.test(code("priceWatch.ts")));
});
