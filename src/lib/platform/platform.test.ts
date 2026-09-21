// Phase 1A shared-foundation tests. Uses Node's test runner via tsx and the
// in-memory store — no database, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
import { assertRouteInvariants } from "./route";
import type { CruiseInput, FlightInput, HotelInput } from "./types";

const hotel: HotelInput = { destination: "Dubai", checkIn: "2026-11-01", checkOut: "2026-11-05", rooms: 1, adults: 2, children: 0 };
const flight: FlightInput = {
  tripType: "return",
  legs: [{ from: "LHR", to: "DXB", departure: "2026-11-01" }],
  returnDate: "2026-11-08",
  travellers: { adults: 2, children: 0 },
  cabin: "economy",
};
const cruise: CruiseInput = { query: "Mediterranean", departureDate: "2027-05-10" };
const rail = { note: "shape decided in Phase 2", stations: ["A", "B"] };

async function fourComponents(store: MemoryPlatformStore, tripId = "trip-1") {
  const h = await addComponent(store, { tripId, kind: "hotel", input: hotel });
  const f = await addComponent(store, { tripId, kind: "flight", input: flight });
  const r = await addComponent(store, { tripId, kind: "rail", input: rail });
  const c = await addComponent(store, { tripId, kind: "cruise", input: cruise });
  return { h, f, r, c };
}

test("1+2: one Trip holds Hotel, Flight, Rail and Cruise (+ experience) and adding never overwrites", async () => {
  const store = new MemoryPlatformStore();
  const { h, f, r, c } = await fourComponents(store);
  const e = await addComponent(store, { tripId: "trip-1", kind: "experience", input: { category: "activity", destination: "Dubai" } });

  const list = await store.listComponents("trip-1");
  assert.deepEqual(list.map((x) => x.kind), ["hotel", "flight", "rail", "cruise", "experience"]);
  assert.deepEqual(list.map((x) => x.position), [0, 1, 2, 3, 4]);
  assert.equal(new Set([h.id, f.id, r.id, c.id, e.id]).size, 5);
  // a second hotel component is a new row, not a replacement
  await addComponent(store, { tripId: "trip-1", kind: "hotel", input: { ...hotel, destination: "Abu Dhabi" } });
  assert.equal((await store.listComponents("trip-1")).filter((x) => x.kind === "hotel").length, 2);
  assert.deepEqual((await store.getComponent(h.id))?.input, hotel);
});

test("3: component payloads stay independent (editing one leaves the others untouched)", async () => {
  const store = new MemoryPlatformStore();
  const { h, f, r, c } = await fourComponents(store);
  await updateComponentInput(store, h.id, { ...hotel, checkIn: "2026-11-02" });

  assert.equal(((await store.getComponent(h.id))!.input as HotelInput).checkIn, "2026-11-02");
  assert.deepEqual((await store.getComponent(f.id))!.input, flight);
  assert.deepEqual((await store.getComponent(r.id))!.input, rail);
  assert.deepEqual((await store.getComponent(c.id))!.input, cruise);
  // hotel dates are independent of flight dates
  assert.notEqual(((await store.getComponent(h.id))!.input as HotelInput).checkIn, (flight.legs[0] as { departure: string }).departure);
});

test("component input is validated per tower; rail stays an open boundary", async () => {
  const store = new MemoryPlatformStore();
  await assert.rejects(addComponent(store, { tripId: "t", kind: "hotel", input: { ...hotel, rooms: 0 } }), /rooms/);
  await assert.rejects(addComponent(store, { tripId: "t", kind: "flight", input: { ...flight, returnDate: undefined } }), /returnDate/);
  await assert.rejects(addComponent(store, { tripId: "t", kind: "cruise", input: { query: "" } }), /query/);
  await addComponent(store, { tripId: "t", kind: "rail", input: { anything: true } });
});

async function seedCommerce(store: MemoryPlatformStore) {
  const trip = await ensureMerchant(store, { slug: "trip-com", name: "Trip.com" });
  const network = await ensureAccessRoute(store, { slug: "cuelinks", name: "Cuelinks", kind: "affiliate_network" });
  const direct = await ensureAccessRoute(store, { slug: "direct", name: "Direct", kind: "direct" });
  return { trip, network, direct };
}

test("4: a selected offer is associated with the correct component and selections are per-component", async () => {
  const store = new MemoryPlatformStore();
  const { h, f } = await fourComponents(store);
  await seedCommerce(store);

  const hOffer = await recordOffer(store, {
    componentId: h.id, merchantSlug: "trip-com", currency: "AED", totalPrice: 1000, sourceUrl: "https://example.com/h",
    provenance: { enteredVia: "source_search", evidenceRefs: [] },
  });
  const fOffer = await recordOffer(store, {
    componentId: f.id, merchantSlug: "trip-com", currency: "AED", totalPrice: 2000, sourceUrl: "https://example.com/f",
    provenance: { enteredVia: "source_search", evidenceRefs: [] },
  });

  const hSel = await selectOffer(store, { componentId: h.id, offerId: hOffer.id });
  const fSel = await selectOffer(store, { componentId: f.id, offerId: fOffer.id });
  assert.equal(hSel.offerId, hOffer.id);
  assert.equal(fSel.offerId, fOffer.id);

  // cross-component selection is rejected
  await assert.rejects(selectOffer(store, { componentId: f.id, offerId: hOffer.id }), /does not belong/);

  // re-selecting on one component replaces only that component's selection (id stable)
  const hOffer2 = await recordOffer(store, {
    componentId: h.id, merchantSlug: "trip-com", currency: "AED", totalPrice: 900, sourceUrl: "https://example.com/h2",
    provenance: { enteredVia: "compare_shortlist", evidenceRefs: ["e1"] },
  });
  const hSel2 = await selectOffer(store, { componentId: h.id, offerId: hOffer2.id });
  assert.equal(hSel2.id, hSel.id);
  assert.equal(hSel2.offerId, hOffer2.id);
  assert.equal((await store.getSelectionForComponent(f.id))?.offerId, fOffer.id);
  assert.equal((await store.getComponent(h.id))?.status, "selected");
});

test("5: merchant identity and commercial-network identity are separate; one merchant, many networks", async () => {
  const store = new MemoryPlatformStore();
  const { trip, network, direct } = await seedCommerce(store);
  assert.notEqual(trip.id, network.id);
  assert.equal(await ensureMerchant(store, { slug: "trip-com", name: "Trip.com" }).then((m) => m.id), trip.id); // no duplicate merchant

  await linkMerchantToAccessRoute(store, { merchantId: trip.id, accessRouteId: network.id, status: "approved" });
  await linkMerchantToAccessRoute(store, { merchantId: trip.id, accessRouteId: direct.id, status: "approved" });
  await linkMerchantToAccessRoute(store, { merchantId: trip.id, accessRouteId: network.id, status: "approved" }); // idempotent
  assert.equal(store.merchants.size, 1);
  assert.equal((await store.listMerchantAccessLinks(trip.id)).length, 2);
  assert.equal(await store.getMerchantBySlug("cuelinks"), null); // a network is not a merchant
  assert.equal(await store.getAccessRouteBySlug("trip-com"), null); // a merchant is not a network
});

async function routedComponent(store: MemoryPlatformStore, opts: { sourceUrl: string | null; provenance?: { enteredVia: string; evidenceRefs: string[] } }) {
  const c = await addComponent(store, { tripId: "trip-x", kind: "flight", input: flight });
  const offer = await recordOffer(store, {
    componentId: c.id, merchantSlug: "trip-com", currency: "AED", totalPrice: 500, sourceUrl: opts.sourceUrl,
    provenance: opts.provenance ?? { enteredVia: "source_search", evidenceRefs: [] },
  });
  await selectOffer(store, { componentId: c.id, offerId: offer.id });
  return { c, offer };
}

test("6: decision provenance and commercial attribution are stored and evolve separately", async () => {
  const store = new MemoryPlatformStore();
  const { trip, network } = await seedCommerce(store);
  await linkMerchantToAccessRoute(store, { merchantId: trip.id, accessRouteId: network.id, status: "approved" });

  const a = await routedComponent(store, { sourceUrl: "https://merchant.example/a", provenance: { enteredVia: "partner_package", evidenceRefs: ["x"] } });
  const b = await routedComponent(store, { sourceUrl: "https://merchant.example/a", provenance: { enteredVia: "compare_shortlist", evidenceRefs: [] } });
  const evidence = { method: "network_link_conversion", trackedUrl: "https://track.example/?u=a", verifiedAt: "2026-09-21T00:00:00Z" };

  const ra = await resolveRouteForComponent(store, { componentId: a.c.id, trackingEvidence: evidence });
  const rb = await resolveRouteForComponent(store, { componentId: b.c.id, trackingEvidence: evidence });

  // provenance differs, attribution/route identical in kind
  assert.notDeepEqual(a.offer.provenance, b.offer.provenance);
  assert.equal(ra.routeType, rb.routeType);
  assert.deepEqual(ra.attribution, rb.attribution);
  // no cross-contamination of fields
  assert.ok(!("provenance" in ra) && !("provenance" in ra.attribution));
  assert.ok(!("attribution" in a.offer) && !("trackingEvidence" in a.offer.provenance));
  assert.ok(!("enteredVia" in ra.attribution));
});

test("7: no eligible affiliate attribution without tracking evidence", async () => {
  const store = new MemoryPlatformStore();
  const { trip, network } = await seedCommerce(store);
  await linkMerchantToAccessRoute(store, { merchantId: trip.id, accessRouteId: network.id, status: "approved" });
  const { c } = await routedComponent(store, { sourceUrl: "https://merchant.example/x" });

  // no evidence -> ineligible, no URL, no attribution claim (and the raw source URL is NOT handed off)
  const noEv = await resolveRouteForComponent(store, { componentId: c.id });
  assert.equal(noEv.routeType, "affiliate_outbound");
  assert.equal(noEv.eligibility, "ineligible");
  assert.equal(noEv.destinationUrl, null);
  assert.equal(noEv.attribution.status, "none");
  assert.equal(noEv.reason, "attribution_unverified");

  // invalid evidence (relative/stub URL) is not evidence
  const bad = await resolveRouteForComponent(store, {
    componentId: c.id,
    trackingEvidence: { method: "x", trackedUrl: "/stub-booking?x=1", verifiedAt: "2026-09-21T00:00:00Z" },
  });
  assert.equal(bad.eligibility, "ineligible");

  // valid evidence -> eligible, uses the tracked URL
  const ok = await resolveRouteForComponent(store, {
    componentId: c.id,
    trackingEvidence: { method: "network_link_conversion", trackedUrl: "https://track.example/?u=1", verifiedAt: "2026-09-21T00:00:00Z" },
  });
  assert.equal(ok.eligibility, "eligible");
  assert.equal(ok.attribution.status, "tracked");
  assert.equal(ok.destinationUrl, "https://track.example/?u=1");

  // invariants reject hand-built dishonest routes
  assert.throws(() => assertRouteInvariants({ routeType: "affiliate_outbound", eligibility: "eligible", destinationUrl: "https://a.example", attribution: { status: "none", evidence: null } }));
  assert.throws(() => assertRouteInvariants({ routeType: "affiliate_outbound", eligibility: "eligible", destinationUrl: "https://a.example", attribution: { status: "tracked", evidence: null } }));
  assert.throws(() => assertRouteInvariants({ routeType: "direct_outbound", eligibility: "eligible", destinationUrl: "https://a.example", attribution: { status: "tracked", evidence: { method: "m", trackedUrl: "https://t.example", verifiedAt: "x" } } }));
});

test("route states: no access route -> inquiry_only; bad/stub source URL -> unavailable; direct -> eligible with no attribution claim", async () => {
  const store = new MemoryPlatformStore();
  const { trip, direct } = await seedCommerce(store);

  const noRoute = await routedComponent(store, { sourceUrl: "https://merchant.example/1" });
  const r1 = await resolveRouteForComponent(store, { componentId: noRoute.c.id });
  assert.equal(r1.routeType, "inquiry_only");
  assert.equal(r1.destinationUrl, null);

  await linkMerchantToAccessRoute(store, { merchantId: trip.id, accessRouteId: direct.id, status: "approved" });
  const stub = await routedComponent(store, { sourceUrl: "/stub-booking?hotel=1" });
  const r2 = await resolveRouteForComponent(store, { componentId: stub.c.id });
  assert.equal(r2.routeType, "unavailable");
  assert.equal(r2.reason, "no_booking_url");

  const ok = await routedComponent(store, { sourceUrl: "https://merchant.example/2" });
  const r3 = await resolveRouteForComponent(store, { componentId: ok.c.id });
  assert.equal(r3.routeType, "direct_outbound");
  assert.equal(r3.eligibility, "eligible");
  assert.equal(r3.attribution.status, "none"); // direct handoff never claims tracking
  assert.equal(store.routes.length, 3);
});

test("StayingAPI isolation: src/lib/platform imports nothing from suppliers/search/StayingAPI", () => {
  const dir = __dirname;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    const importLines = readFileSync(join(dir, f), "utf8")
      .split("\n")
      .filter((l) => /^\s*(import|export)\b.*from\s/.test(l));
    for (const l of importLines) {
      assert.ok(!/suppliers|stayingapi|\/search|price-discovery|commercial\/(?!cuelinks)/i.test(l), `${f} has a forbidden import: ${l}`);
    }
  }
});
