// StayingAPI quarantine: functional behaviour of the active Hotel journey with
// NO StayingAPI, NO seller, NO rate and NO price. Memory store + static source
// checks only; nothing here can call StayingAPI or a database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MemoryPlatformStore } from "../platform/memoryStore";
import { addComponent } from "../platform/service";
import { getHotelDecision, getPropertyChoice, recordPropertyChoice } from "./decision";
import { HOTEL_ROUTE_BUILDERS, propertyBookingUnavailableCta, resolveHotelActionForTrip } from "./commercial";

const SRC = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const STAYING = /stayingApi|staying_api|ensureLiveCheckTriggered|runSearch|SUPPLIER_ADAPTERS|pollLiveCheck/;
const stay = { destination: "Dubai", checkIn: "2026-11-02", checkOut: "2026-11-06", rooms: 1, adults: 2, children: 0 };

test("1+2: Discover and Compare have zero StayingAPI dependency", () => {
  for (const f of ["app/page.tsx", "components/DiscoverForm.tsx", "components/HotelSelectionGrid.tsx", "app/compare/page.tsx"]) {
    assert.ok(!STAYING.test(code(f)), `${f} references StayingAPI`);
  }
});

test("3+4: authorized Check IQ makes zero StayingAPI calls; an unauthorized entry is still gated", () => {
  const page = code("app/check-iq/page.tsx");
  assert.ok(!STAYING.test(page));
  assert.match(page, /if \(authorized !== "1"\) \{[\s\S]*?redirect\(compareUrl\);[\s\S]*?\}/);
});

test("5+6: Check IQ cannot render cached StayingAPI offers and shows the honest verification-unavailable state", () => {
  const page = code("app/check-iq/page.tsx");
  // no cache/offer/verdict/rate data source is even imported
  assert.ok(!/stayingApiCache|schema\.rates|schema\.verdicts|schema\.priceHistory|ResultsList|VerifiedRatePanel|RateManifestVerdict|@\/lib\/search|@\/lib\/scoring/.test(page));
  assert.match(page, /Rate verification is currently unavailable\./);
  // nothing that could read as a price, saving, seller row or comparison
  assert.ok(!/totalPrice|nightlyPrice|cheapest|AED|savings|seller|offers\b|availab(le|ility) (now|tonight)/i.test(page.replace("Rate verification is currently unavailable.", "")));
  // and no seller-priced selection action is wired here
  assert.ok(!/selectDeal|deepLink|outboundUrl/.test(page));
});

test("7: a Hotel/property choice persists with no seller, rate, price, offer, merchant, deep link or route", async () => {
  const store = new MemoryPlatformStore();
  const { componentId } = await recordPropertyChoice(store, { tripId: "trip-1", propertyId: "prop-1", propertyName: "Test Property", stay });

  const choice = await getPropertyChoice(store, "trip-1");
  assert.equal(choice!.componentId, componentId);
  assert.equal(choice!.propertyId, "prop-1");
  assert.deepEqual(choice!.stay, stay); // the trip's own stay/traveller context

  assert.equal(store.offers.size, 0);
  assert.equal(store.selections.size, 0);
  assert.equal(store.merchants.size, 0); // no seller became a merchant
  assert.equal(store.routes.length, 0);
  assert.equal((await store.getComponent(componentId))!.status, "draft"); // no priced selection exists
  assert.equal(await getHotelDecision(store, "trip-1"), null); // the priced-decision concept is separate and absent

  // re-choosing the same property is idempotent; choosing another updates the one hotel component, not a second
  await recordPropertyChoice(store, { tripId: "trip-1", propertyId: "prop-1", stay });
  await recordPropertyChoice(store, { tripId: "trip-1", propertyId: "prop-2", stay });
  const hotels = (await store.listComponents("trip-1")).filter((c) => c.kind === "hotel");
  assert.equal(hotels.length, 1);
  assert.equal((await getPropertyChoice(store, "trip-1"))!.propertyId, "prop-2");
});

test("8: Complete Your Trip works from a property choice, with experiences added and no rate selection", async () => {
  const store = new MemoryPlatformStore();
  await recordPropertyChoice(store, { tripId: "trip-1", propertyId: "prop-1", stay });
  await addComponent(store, { tripId: "trip-1", kind: "experience", input: { category: "activity", destination: "Dubai" } });
  await addComponent(store, { tripId: "trip-1", kind: "experience", input: { category: "private_tour", destination: "Dubai" } });
  assert.equal((await getPropertyChoice(store, "trip-1"))!.propertyId, "prop-1"); // unchanged by additions

  const page = code("app/complete-your-trip/page.tsx");
  assert.match(page, /propertyChoiceForTrip\(/);
  assert.ok(!/getLatestTripSelection|selection\.|totalPrice|supplierName/.test(page), "Complete Your Trip must not require a rate selection");
  assert.ok(!STAYING.test(page));
});

test("9+10: Confirm accepts a property choice with no rate; shows no fake zero price, verdict or combined total", () => {
  const page = code("app/confirm/page.tsx");
  assert.match(page, /propertyChoiceForTrip\(/);
  assert.match(page, /propertyCta\(/);
  assert.ok(!/getLatestTripSelection|selection\.|supplierName|verdict|getDealSignal|estimatedTotal|Estimated trip total|AED 0|Selected rate/.test(page));
  assert.match(page, /Rate verification is currently unavailable, so no hotel price is shown\./);
  assert.match(page, /Not verified/);
  // the only monetary figure is an experiences subtotal, and only for a single shared currency
  assert.match(page, /currencies\.size === 1/);
  assert.ok(!STAYING.test(page));
});

test("11: no StayingAPI/rate-source URL can become a commercial destination in the active journey", () => {
  for (const f of ["app/check-iq/page.tsx", "app/confirm/page.tsx", "app/complete-your-trip/page.tsx", "app/actions/trip.ts", "lib/hotel/journey.ts", "lib/hotel/commercial.ts"]) {
    assert.ok(!/deepLink|outboundUrl|offer\.url/.test(code(f)), `${f} handles a rate-source URL`);
  }
  const cta = propertyBookingUnavailableCta("Test Property");
  assert.equal(cta.enabled, false);
  assert.equal(cta.url, null);
});

test("12: no StayingAPI seller becomes a platform merchant through the active journey", async () => {
  for (const f of ["app/check-iq/page.tsx", "app/confirm/page.tsx", "app/complete-your-trip/page.tsx", "app/actions/trip.ts"]) {
    assert.ok(!/recordHotelDecision\(|recordHotelDecisionSafe|ensureMerchant\(|previewCtasForSellers/.test(code(f)), `${f} maps a seller to a merchant`);
  }
  const store = new MemoryPlatformStore();
  await recordPropertyChoice(store, { tripId: "t", propertyId: "p", stay });
  assert.equal(store.merchants.size, 0);
});

test("13: no StayingAPI-derived verdict is required or read by the active journey (incl. the public property page)", () => {
  for (const f of ["app/check-iq/page.tsx", "app/confirm/page.tsx", "app/complete-your-trip/page.tsx", "app/actions/trip.ts"]) {
    assert.ok(!/verdict/i.test(code(f)), `${f} references a verdict`);
  }
  for (const f of ["app/hotel/[hotelId]/page.tsx", "app/exceptional-stays/page.tsx"]) {
    assert.ok(!/db\.query\.verdicts/.test(code(f)), `${f} must not read stored StayingAPI-derived verdicts`);
  }
});

test("14: commercial routing is independent of StayingAPI: no builders, no seller-derived route, honest CTA", async () => {
  // GitHub Issue #3 (2026-09-22): "joali" is the one registered H2 builder -
  // a direct affiliate destination with no StayingAPI/seller dependency
  // (see joali.test.ts's own StayingAPI-isolation checks).
  assert.deepEqual(Object.keys(HOTEL_ROUTE_BUILDERS), ["joali"]);
  for (const f of ["lib/hotel/commercial.ts", "lib/hotel/decision.ts", "lib/hotel/journey.ts", "lib/platform/service.ts", "lib/platform/route.ts"]) {
    assert.ok(!/stayingApi\w*|SUPPLIER_ADAPTERS|runSearch/.test(code(f)), `${f} depends on StayingAPI`);
  }
  // with only a property choice there is nothing to route
  const store = new MemoryPlatformStore();
  await recordPropertyChoice(store, { tripId: "t", propertyId: "p", stay });
  assert.equal(await resolveHotelActionForTrip(store, "t"), null);
});

test("legacy priced selection is preserved but disconnected from the active actions", () => {
  assert.match(code("app/actions/legacyPricedSelection.ts"), /export async function selectDeal/);
  assert.ok(!/export async function selectDeal/.test(code("app/actions/trip.ts")));
});
