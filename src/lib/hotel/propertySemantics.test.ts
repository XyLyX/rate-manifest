// Property-choice semantics: "hotel PROPERTY chosen" is independent of
// "hotel RATE/OFFER selected". Component status tracks only the latter.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MemoryPlatformStore } from "../platform/memoryStore";
import { addComponent, updateComponentInput } from "../platform/service";
import { calculateSelectedTotal } from "../platform/totals";
import { suggestContext } from "../platform/context";
import { getHotelDecision, getPropertyChoice, propertyChoiceWithLegacyFallback, recordHotelDecision, recordPropertyChoice } from "./decision";
import { resolveHotelActionForTrip } from "./commercial";

const SRC = join(__dirname, "..", "..");
const code = (rel: string) =>
  readFileSync(join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const stay = { destination: "Dubai", checkIn: "2026-11-02", checkOut: "2026-11-06", rooms: 1, adults: 2, children: 0 };

test("a chosen property with no rate is 'draft' but is recognised as chosen; nothing else treats it as unchosen or as priced", async () => {
  const store = new MemoryPlatformStore();
  const { componentId } = await recordPropertyChoice(store, { tripId: "t", propertyId: "prop-1", stay });
  const component = (await store.getComponent(componentId))!;

  assert.equal(component.status, "draft"); // no offer selection exists
  assert.equal((await getPropertyChoice(store, "t"))!.propertyId, "prop-1"); // ...yet the property IS chosen

  // status-driven consumers correctly see "no rate selected", not "no hotel chosen"
  assert.equal(await getHotelDecision(store, "t"), null); // priced decision: none
  assert.deepEqual(await calculateSelectedTotal(store, "t"), { ok: false, reason: "nothing_selected" });
  assert.equal(await resolveHotelActionForTrip(store, "t"), null);
  assert.equal(store.offers.size + store.selections.size + store.routes.length + store.merchants.size, 0);

  // cross-tower context ignores status: a chosen (draft) hotel still seeds Flight/Experience suggestions
  assert.deepEqual(suggestContext(component, "experience"), { destination: "Dubai", startDate: "2026-11-02", endDate: "2026-11-06", adults: 2, children: 0 });
  assert.ok(suggestContext(component, "flight"));
});

test("the property choice is carried by persisted input (propertyId), so it survives reload and stay edits", async () => {
  const store = new MemoryPlatformStore();
  const { componentId } = await recordPropertyChoice(store, { tripId: "t", propertyId: "prop-1", stay });
  // what the database round-trips: input_json only
  const reloaded = JSON.parse(JSON.stringify((await store.getComponent(componentId))!.input));
  assert.equal(reloaded.propertyId, "prop-1");

  await updateComponentInput(store, componentId, { ...stay, checkIn: "2026-11-03", propertyId: "prop-1" });
  assert.equal((await store.getComponent(componentId))!.status, "draft");
  assert.equal((await getPropertyChoice(store, "t"))!.stay.checkIn, "2026-11-03"); // still chosen, new dates
});

test("a genuinely unfinished Hotel component (no propertyId) is distinguishable from a chosen one", async () => {
  const store = new MemoryPlatformStore();
  await addComponent(store, { tripId: "t", kind: "hotel", input: stay }); // e.g. a Hotel context suggested from a Flight
  assert.equal(await getPropertyChoice(store, "t"), null); // not chosen

  const other = new MemoryPlatformStore();
  await recordPropertyChoice(other, { tripId: "t", propertyId: "prop-1", stay });
  assert.ok(await getPropertyChoice(other, "t")); // chosen
});

test("a priced decision (dormant path) and a property choice coexist without confusion", async () => {
  const store = new MemoryPlatformStore();
  await recordHotelDecision(store, {
    tripId: "t",
    propertyId: "prop-1",
    stay,
    evidence: { sellerSlug: "s", sellerName: "S", totalPrice: 10, currency: "AED" },
  });
  assert.equal((await getPropertyChoice(store, "t"))!.propertyId, "prop-1"); // selected component -> still a property choice
  assert.ok(await getHotelDecision(store, "t"));

  await updateComponentInput(store, (await getPropertyChoice(store, "t"))!.componentId as string, { ...stay, checkOut: "2026-11-07", propertyId: "prop-1" });
  assert.equal(await getHotelDecision(store, "t"), null); // the RATE decision is stale...
  assert.equal((await getPropertyChoice(store, "t"))!.propertyId, "prop-1"); // ...the PROPERTY choice is not
});

test("legacy trips: identity-only, read-only fallback; a platform choice always wins; no seller/price/verdict/deep link is carried", async () => {
  const store = new MemoryPlatformStore();
  const platform = await (async () => {
    await recordPropertyChoice(store, { tripId: "t", propertyId: "prop-new", stay });
    return getPropertyChoice(store, "t");
  })();

  const legacy = propertyChoiceWithLegacyFallback(null, "prop-legacy", stay);
  assert.deepEqual(legacy, { componentId: null, propertyId: "prop-legacy", stay, source: "legacy_selection" });
  assert.deepEqual(Object.keys(legacy!).sort(), ["componentId", "propertyId", "source", "stay"]);

  assert.equal(propertyChoiceWithLegacyFallback(platform, "prop-legacy", stay)!.propertyId, "prop-new");
  assert.equal(propertyChoiceWithLegacyFallback(null, null, stay), null);
  assert.equal(propertyChoiceWithLegacyFallback(null, "prop-legacy", null), null); // trip missing -> nothing

  // the DB read selects the hotel identity column only
  const journey = code("lib/hotel/journey.ts");
  assert.match(journey, /\.select\(\{ hotelId: schema\.tripSelections\.hotelId \}\)/);
  assert.ok(!/supplierName|supplierSlug|totalPrice|deepLink|verdictId|currency/.test(journey), "journey.ts must not read legacy seller/price/link/verdict");
  // active pages use only the property identity from the choice
  for (const f of ["app/confirm/page.tsx", "app/complete-your-trip/page.tsx"]) {
    assert.ok(!/choice\.(componentId|source)/.test(code(f)), `${f} must only need propertyId`);
  }
});
