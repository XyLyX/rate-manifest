// Phase 1B foundation tests: Hotels + Flights (create-your-own) state,
// cross-tower suggestions, Cruise context, experience categories, the Phase 2
// source-adapter boundary, and fixes found in the Phase 1A review.
// In-memory store only — no database, no network. Fixtures use neutral
// placeholder merchants; no real supplier is selected here.

import { test } from "node:test";
import assert from "node:assert/strict";

import { MemoryPlatformStore } from "./memoryStore";
import {
  addComponent,
  ensureAccessRoute,
  ensureMerchant,
  linkMerchantToAccessRoute,
  recordOffer,
  resolveRouteForComponent,
  selectOffer,
  updateComponentInput,
} from "./service";
import { addComponentFromSuggestion, suggestContext } from "./context";
import { calculateSelectedTotal } from "./totals";
import { ingestOffers, type SourceAdapter } from "./adapter";
import { EXPERIENCE_CATEGORIES, TOWER_KINDS, type CruiseInput, type FlightInput, type HotelInput } from "./types";

const flightInput: FlightInput = {
  tripType: "return",
  legs: [{ from: "Dubai", to: "Manila", departure: "2026-10-01" }],
  returnDate: "2026-10-08",
  travellers: { adults: 1, children: 0 },
  cabin: "economy",
};
const hotelInput: HotelInput = { destination: "Manila", checkIn: "2026-10-02", checkOut: "2026-10-08", rooms: 1, adults: 1, children: 0 };

const prov = { enteredVia: "source_search", evidenceRefs: [] as string[] };
const evidence = { method: "network_link_conversion", trackedUrl: "https://track.example/?u=1", verifiedAt: "2026-09-21T00:00:00Z" };

async function setupHotelsFlights() {
  const store = new MemoryPlatformStore();
  const flight = await addComponent(store, { tripId: "t-hf", kind: "flight", input: flightInput });
  const hotel = await addComponent(store, { tripId: "t-hf", kind: "hotel", input: hotelInput });

  const airline = await ensureMerchant(store, { slug: "test-airline", name: "Test Airline" });
  const hotelier = await ensureMerchant(store, { slug: "test-hotelier", name: "Test Hotelier" });
  const direct = await ensureAccessRoute(store, { slug: "direct", name: "Direct", kind: "direct" });
  const network = await ensureAccessRoute(store, { slug: "test-network", name: "Test Network", kind: "affiliate_network" });
  await linkMerchantToAccessRoute(store, { merchantId: airline.id, accessRouteId: direct.id, status: "approved" });
  await linkMerchantToAccessRoute(store, { merchantId: hotelier.id, accessRouteId: network.id, status: "approved" });

  const fOffer = await recordOffer(store, { componentId: flight.id, merchantSlug: "test-airline", currency: "AED", totalPrice: 1200.1, sourceUrl: "https://airline.example/f", provenance: prov });
  const hOffer = await recordOffer(store, { componentId: hotel.id, merchantSlug: "test-hotelier", currency: "AED", totalPrice: 800.2, sourceUrl: "https://hotelier.example/h", provenance: prov });
  await selectOffer(store, { componentId: flight.id, offerId: fOffer.id });
  await selectOffer(store, { componentId: hotel.id, offerId: hOffer.id });
  return { store, flight, hotel, fOffer, hOffer, airline, hotelier };
}

test("Hotels+Flights: one Trip, independent components, two simultaneous selections, different merchants and routes", async () => {
  const { store, flight, hotel, fOffer, hOffer, airline, hotelier } = await setupHotelsFlights();

  assert.equal((await store.getSelectionForComponent(flight.id))?.offerId, fOffer.id);
  assert.equal((await store.getSelectionForComponent(hotel.id))?.offerId, hOffer.id);
  assert.notEqual(fOffer.merchantId, hOffer.merchantId);
  assert.equal(fOffer.merchantId, airline.id);
  assert.equal(hOffer.merchantId, hotelier.id);

  const fRoute = await resolveRouteForComponent(store, { componentId: flight.id });
  const hRoute = await resolveRouteForComponent(store, { componentId: hotel.id, trackingEvidence: evidence });
  assert.equal(fRoute.routeType, "direct_outbound");
  assert.equal(hRoute.routeType, "affiliate_outbound");
  assert.notEqual(fRoute.accessRouteId, hRoute.accessRouteId);
  assert.equal(fRoute.destinationUrl, "https://airline.example/f");
  assert.equal(hRoute.destinationUrl, evidence.trackedUrl);
  assert.equal((await store.getLatestRouteForComponent(flight.id))?.id, fRoute.id);
  assert.equal((await store.getLatestRouteForComponent(hotel.id))?.id, hRoute.id);
});

test("Hotels+Flights: combined total is calculated from selected snapshots, only when currencies match, and is never persisted", async () => {
  const { store, flight, hotel } = await setupHotelsFlights();
  const offersBefore = store.offers.size;

  const t = await calculateSelectedTotal(store, "t-hf");
  assert.ok(t.ok);
  if (t.ok) {
    assert.equal(t.currency, "AED");
    assert.equal(t.total, 2000.3); // 1200.10 + 800.20, summed in minor units
    assert.deepEqual(t.items.map((i) => i.kind).sort(), ["flight", "hotel"]);
  }
  // nothing new was stored: only the two real offers exist, no combined entity
  assert.equal(store.offers.size, offersBefore);
  assert.ok([...store.offers.values()].every((o) => o.kind === "flight" || o.kind === "hotel"));

  // a differing currency refuses to add
  const usd = await recordOffer(store, { componentId: flight.id, merchantSlug: "test-airline", currency: "USD", totalPrice: 300, sourceUrl: "https://airline.example/f2", provenance: prov });
  await selectOffer(store, { componentId: flight.id, offerId: usd.id });
  const mixed = await calculateSelectedTotal(store, "t-hf");
  assert.deepEqual(mixed, { ok: false, reason: "mixed_currency", currencies: ["AED", "USD"] });

  // nothing selected
  await addComponent(store, { tripId: "empty", kind: "hotel", input: hotelInput });
  assert.deepEqual(await calculateSelectedTotal(store, "empty"), { ok: false, reason: "nothing_selected" });
  void hotel;
});

test("Hotels+Flights: editing the Hotel leaves the Flight untouched; editing the Flight leaves the Hotel; stale selections are not routed or totalled", async () => {
  const { store, flight, hotel, hOffer } = await setupHotelsFlights();
  const flightBefore = structuredClone(await store.getComponent(flight.id));

  // hotel check-in moves to Oct 3; flight dates do not change
  await updateComponentInput(store, hotel.id, { ...hotelInput, checkIn: "2026-10-03" });
  const flightAfter = await store.getComponent(flight.id);
  assert.deepEqual(flightAfter, flightBefore);
  assert.equal((flightAfter!.input as FlightInput).legs[0]?.departure, "2026-10-01");
  assert.equal(((await store.getComponent(hotel.id))!.input as HotelInput).checkIn, "2026-10-03");

  // the hotel's old selection is stale: not routable, not in the total; the flight is unaffected
  assert.equal((await store.getComponent(hotel.id))!.status, "draft");
  await assert.rejects(resolveRouteForComponent(store, { componentId: hotel.id }), /No current selection/);
  const partial = await calculateSelectedTotal(store, "t-hf");
  assert.ok(partial.ok && partial.items.length === 1 && partial.items[0]?.kind === "flight");
  assert.equal((await resolveRouteForComponent(store, { componentId: flight.id })).eligibility, "eligible");

  // re-selecting restores it
  await selectOffer(store, { componentId: hotel.id, offerId: hOffer.id });
  const both = await calculateSelectedTotal(store, "t-hf");
  assert.ok(both.ok && both.items.length === 2);

  // changing the flight does not delete or alter the hotel
  const hotelBefore = structuredClone(await store.getComponent(hotel.id));
  await updateComponentInput(store, flight.id, { ...flightInput, cabin: "business" });
  assert.deepEqual(await store.getComponent(hotel.id), hotelBefore);
  assert.equal((await store.listComponents("t-hf")).length, 2);
  assert.equal((await store.getSelectionForComponent(hotel.id))?.offerId, hOffer.id);
});

test("component position uses max+1 (no collisions after gaps)", async () => {
  const store = new MemoryPlatformStore();
  const a = await addComponent(store, { tripId: "p", kind: "hotel", input: hotelInput });
  await addComponent(store, { tripId: "p", kind: "flight", input: flightInput });
  store.components.delete(a.id); // simulate a removed component
  const c = await addComponent(store, { tripId: "p", kind: "hotel", input: hotelInput });
  const positions = (await store.listComponents("p")).map((x) => x.position);
  assert.equal(new Set(positions).size, positions.length);
  assert.equal(c.position, 2);
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

test("suggestions: Flight -> Hotel and Hotel -> Flight are explicit, read-only and non-binding", async () => {
  const store = new MemoryPlatformStore();
  const flight = await addComponent(store, { tripId: "s", kind: "flight", input: deepFreeze(structuredClone(flightInput)) });
  deepFreeze(flight);

  const s = suggestContext(flight, "hotel");
  assert.deepEqual(s, { destination: "Manila", checkIn: "2026-10-01", checkOut: "2026-10-08", adults: 1, children: 0 });

  const hotel = await addComponentFromSuggestion(store, {
    tripId: "s",
    kind: "hotel",
    sourceComponentId: flight.id,
    complete: (sg) => ({ ...(sg as Partial<HotelInput>), checkIn: "2026-10-02", rooms: 1 }) as HotelInput,
  });
  // receiving component owns its values; the source is unchanged
  assert.equal(hotel.input.checkIn, "2026-10-02");
  assert.deepEqual((await store.getComponent(flight.id))!.input, flightInput);
  // no stored link: editing either does not affect the other
  await updateComponentInput(store, hotel.id, { ...hotel.input, destination: "Cebu" });
  assert.equal((flight.input as FlightInput).legs[0]?.to, "Manila");
  await updateComponentInput(store, flight.id, { ...flightInput, legs: [{ from: "Dubai", to: "Tokyo", departure: "2026-10-01" }] });
  assert.equal(((await store.getComponent(hotel.id))!.input as HotelInput).destination, "Cebu");

  // Hotel -> Flight: origin is unknown, so the suggestion is incomplete until the receiver supplies it
  const hs = suggestContext((await store.getComponent(hotel.id))!, "flight");
  assert.deepEqual(hs, { tripType: "return", legs: [{ to: "Cebu", departure: "2026-10-02" }], returnDate: "2026-10-08", travellers: { adults: 1, children: 0 } });
  await assert.rejects(
    addComponentFromSuggestion(store, { tripId: "s", kind: "flight", sourceComponentId: hotel.id, complete: (sg) => sg as unknown as FlightInput }),
    /from\/to required/
  );
  const f2 = await addComponentFromSuggestion(store, {
    tripId: "s",
    kind: "flight",
    sourceComponentId: hotel.id,
    complete: (sg) => ({ ...(sg as Partial<FlightInput>), legs: [{ from: "Dubai", to: "Cebu", departure: "2026-10-02" }] }) as FlightInput,
  });
  assert.equal(f2.kind, "flight");
});

test("suggestions: unmapped pairs (Rail, missing data) return null rather than inventing fields", async () => {
  const store = new MemoryPlatformStore();
  const rail = await addComponent(store, { tripId: "n", kind: "rail", input: { x: 1 } });
  const hotel = await addComponent(store, { tripId: "n", kind: "hotel", input: hotelInput });
  assert.equal(suggestContext(rail, "hotel"), null);
  assert.equal(suggestContext(hotel, "rail"), null);
  await assert.rejects(addComponentFromSuggestion(store, { tripId: "n", kind: "rail", sourceComponentId: hotel.id, complete: () => ({}) }), /No context mapping/);
});

test("Cruise -> Hotel: suggests pre-cruise stay context without merging or mutating the Cruise", async () => {
  const store = new MemoryPlatformStore();
  const cruiseInput: CruiseInput = { query: "Arabian Gulf cruise", departureDate: "2026-12-05", departurePort: "Dubai" };
  const cruise = await addComponent(store, { tripId: "c", kind: "cruise", input: cruiseInput });

  assert.deepEqual(suggestContext(cruise, "hotel"), { destination: "Dubai", checkOut: "2026-12-05" });
  assert.deepEqual(suggestContext(cruise, "flight"), { legs: [{ to: "Dubai" }] });
  assert.deepEqual(suggestContext(cruise, "experience"), { destination: "Dubai", startDate: "2026-12-05" });
  assert.equal(suggestContext(cruise, "rail"), null);

  const hotel = await addComponentFromSuggestion(store, {
    tripId: "c",
    kind: "hotel",
    sourceComponentId: cruise.id,
    complete: (sg) => ({ ...(sg as Partial<HotelInput>), checkIn: "2026-12-03", rooms: 1, adults: 2, children: 0 }) as HotelInput,
  });
  assert.equal(hotel.kind, "hotel");
  assert.notEqual(hotel.id, cruise.id);

  await updateComponentInput(store, hotel.id, { ...hotel.input, checkOut: "2026-12-04" });
  assert.deepEqual((await store.getComponent(cruise.id))!.input, cruiseInput);
  assert.equal((await store.listComponents("c")).length, 2);

  // a cruise with no source-supplied port yields no hotel suggestion (the free-text query is not a port)
  const bare = await addComponent(store, { tripId: "c2", kind: "cruise", input: { query: "Mediterranean" } });
  assert.equal(suggestContext(bare, "hotel"), null);
});

test("experiences: five categories are distinguishable component context and experience is not a tower", async () => {
  assert.deepEqual([...EXPERIENCE_CATEGORIES], ["attraction", "activity", "private_tour", "group_tour", "transfer"]);
  assert.deepEqual([...TOWER_KINDS], ["hotel", "flight", "rail", "cruise"]);
  assert.ok(!(TOWER_KINDS as readonly string[]).includes("experience"));

  const store = new MemoryPlatformStore();
  for (const category of EXPERIENCE_CATEGORIES) {
    const e = await addComponent(store, { tripId: "x", kind: "experience", input: { category, destination: "Dubai" } });
    assert.equal(e.input.category, category);
  }
  assert.equal((await store.listComponents("x")).length, 5);
  await assert.rejects(addComponent(store, { tripId: "x", kind: "experience", input: { category: "tour" as never } }), /category/);
  await assert.rejects(addComponent(store, { tripId: "x", kind: "experience", input: {} as never }), /category/);
});

test("Phase 2 source boundary: any tower's adapter feeds recordOffer -> selectOffer -> route with tower-specific payloads", async () => {
  const store = new MemoryPlatformStore();
  const cruise = await addComponent(store, { tripId: "b", kind: "cruise", input: { query: "Gulf" } });
  const rail = await addComponent(store, { tripId: "b", kind: "rail", input: { anything: "source-defined" } });

  const cruiseAdapter: SourceAdapter<"cruise"> = {
    id: "fake-cruise-source",
    kind: "cruise",
    async search(input) {
      assert.equal(input.query, "Gulf");
      return [
        { merchant: { slug: "test-line", name: "Test Line" }, externalRef: "c-1", currency: "USD", totalPrice: 900, sourceUrl: "https://line.example/1", payload: { nights: 7, cabin: "balcony" } },
        { merchant: { slug: "test-line", name: "Test Line" }, currency: "USD", totalPrice: 700, sourceUrl: null, payload: { nights: 5 } },
      ];
    },
  };
  const railAdapter: SourceAdapter<"rail"> = {
    id: "fake-rail-source",
    kind: "rail",
    async search() {
      return [{ merchant: { slug: "test-rail", name: "Test Rail" }, currency: "EUR", totalPrice: 55.5, sourceUrl: "https://rail.example/9", payload: { seatClass: "2nd" } }];
    },
  };

  const cruiseOffers = await ingestOffers(store, cruiseAdapter, cruise.id);
  const railOffers = await ingestOffers(store, railAdapter, rail.id);

  assert.equal(store.merchants.size, 2); // merchant ensured once, not duplicated
  assert.deepEqual(cruiseOffers[0]!.payload, { nights: 7, cabin: "balcony" });
  assert.deepEqual(railOffers[0]!.payload, { seatClass: "2nd" });
  assert.deepEqual(cruiseOffers[0]!.provenance, { enteredVia: "source_search", evidenceRefs: ["source:fake-cruise-source"] });
  assert.equal((await store.listOffers(cruise.id)).length, 2);
  assert.equal((await store.listOffers(rail.id)).length, 1);

  await selectOffer(store, { componentId: cruise.id, offerId: cruiseOffers[0]!.id });
  // no access route approved yet -> honest inquiry_only, no URL
  const r = await resolveRouteForComponent(store, { componentId: cruise.id });
  assert.equal(r.routeType, "inquiry_only");
  assert.equal(r.destinationUrl, null);

  // an adapter cannot feed a component of another kind
  await assert.rejects(ingestOffers(store, railAdapter, cruise.id), /serves rail, not cruise/);
});
