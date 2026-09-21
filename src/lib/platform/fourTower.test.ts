// Phase 2: four-tower COMMERCIAL foundation proof.
//
// One Trip holds Hotel, Flight, Rail and Cruise components; each carries its
// own merchant, access route and attribution via a commercial handoff. No
// offers, no prices and no inventory are involved: the proof routes come from
// the Source Research & Implementation Register and are commercial-only.
// The Cuelinks conversion is stubbed here (no network) except one test that
// drives the real convertCuelinksUrl primitive through a mocked fetch.

import { test } from "node:test";
import assert from "node:assert/strict";

import { MemoryPlatformStore } from "./memoryStore";
import { addComponent, ensureMerchant, recordHandoff, resolveRouteForHandoff, updateComponentInput } from "./service";
import { cuelinksEvidenceFor } from "./cuelinksAccess";
import { ensureProofRoutes, PROOF_ROUTES } from "./proofRoutes";
import { suggestContext } from "./context";
import { calculateSelectedTotal } from "./totals";
import type { CuelinksConversionResult } from "../commercial/cuelinks";
import type { CruiseInput, FlightInput, HotelInput, TowerKind } from "./types";

const hotel: HotelInput = { destination: "Phuket", checkIn: "2026-11-02", checkOut: "2026-11-06", rooms: 1, adults: 2, children: 0 };
const flight: FlightInput = {
  tripType: "return",
  legs: [{ from: "Dubai", to: "Delhi", departure: "2026-11-01" }],
  returnDate: "2026-11-10",
  travellers: { adults: 2, children: 0 },
  cabin: "economy",
};
const rail = { from: "Rome", to: "Florence", date: "2026-11-04" }; // open boundary: source-defined
const cruise: CruiseInput = { query: "Mediterranean", departureDate: "2026-12-05" };

// Stubbed Cuelinks responses keyed by merchant host, mirroring the Register's proven campaigns.
const CAMPAIGN_BY_HOST: Record<string, number> = { "www.anantara.com": 13297, "www.airindia.com": 5622, "www.italiarail.com": 3878, "www.trip.com": 4242 };
async function stubConvert(url: string): Promise<CuelinksConversionResult> {
  const host = new URL(url).host;
  return {
    originalUrl: url,
    trackingUrl: `https://track.example/${host}?u=1`,
    affiliated: true,
    campaignId: CAMPAIGN_BY_HOST[host] ?? null,
    campaignName: `campaign for ${host}`,
  };
}

async function fourTowerTrip() {
  const store = new MemoryPlatformStore();
  const { accessRoute, merchants } = await ensureProofRoutes(store);
  const inputs = { hotel, flight, rail, cruise } as const;
  const components = {
    hotel: await addComponent(store, { tripId: "t4", kind: "hotel", input: hotel }),
    flight: await addComponent(store, { tripId: "t4", kind: "flight", input: flight }),
    rail: await addComponent(store, { tripId: "t4", kind: "rail", input: rail }),
    cruise: await addComponent(store, { tripId: "t4", kind: "cruise", input: cruise }),
  };

  async function handoffAndRoute(tower: TowerKind, convert = stubConvert) {
    const p = PROOF_ROUTES[tower];
    const handoff = await recordHandoff(store, {
      componentId: components[tower].id,
      merchantSlug: p.merchant.slug,
      landingUrl: p.landingUrl,
      provenance: { enteredVia: "commercial_handoff", evidenceRefs: [`register:${p.merchant.slug}`] },
    });
    const outcome = await cuelinksEvidenceFor(p.landingUrl, { convert, expectedCampaignId: p.expectedCampaignId });
    const route = await resolveRouteForHandoff(store, { handoffId: handoff.id, trackingEvidence: outcome.evidence });
    return { handoff, outcome, route };
  }
  return { store, accessRoute, merchants, components, inputs, handoffAndRoute };
}

test("four towers: one Trip, four components, four independent merchants/handoffs/routes/attribution", async () => {
  const { store, accessRoute, merchants, components, handoffAndRoute } = await fourTowerTrip();
  assert.deepEqual((await store.listComponents("t4")).map((c) => c.kind), ["hotel", "flight", "rail", "cruise"]);

  const results = {} as Record<TowerKind, Awaited<ReturnType<typeof handoffAndRoute>>>;
  for (const t of ["hotel", "flight", "rail", "cruise"] as TowerKind[]) results[t] = await handoffAndRoute(t);

  const routes = Object.values(results).map((r) => r.route);
  for (const [tower, r] of Object.entries(results) as [TowerKind, (typeof results)[TowerKind]][]) {
    assert.equal(r.route.componentId, components[tower].id);
    assert.equal(r.route.merchantId, merchants[tower].id);
    assert.equal(r.route.accessRouteId, accessRoute.id);
    assert.equal(r.route.routeType, "affiliate_outbound");
    assert.equal(r.route.eligibility, "eligible");
    assert.equal(r.route.selectionId, null); // routed by handoff, not by a priced selection
    assert.equal(r.route.handoffId, r.handoff.id);
    assert.equal(r.route.attribution.status, "tracked");
    assert.equal(r.route.attribution.evidence?.method, "cuelinks_v3_convert");
    assert.equal(r.route.attribution.evidence?.campaignId, CAMPAIGN_BY_HOST[new URL(PROOF_ROUTES[tower].landingUrl).host]);
    assert.equal(r.route.destinationUrl, r.route.attribution.evidence?.trackedUrl);
  }
  // merchants, handoffs, attribution URLs are all distinct per tower; the network is one shared access route record
  assert.equal(new Set(routes.map((r) => r.merchantId)).size, 4);
  assert.equal(new Set(routes.map((r) => r.handoffId)).size, 4);
  assert.equal(new Set(routes.map((r) => r.destinationUrl)).size, 4);
  assert.equal(store.accessRoutes.size, 1);
  // merchant vs access route are separate records: the network is not a merchant, no merchant is a network
  assert.equal(await store.getMerchantBySlug("cuelinks"), null);
  for (const p of Object.values(PROOF_ROUTES)) assert.equal(await store.getAccessRouteBySlug(p.merchant.slug), null);
  // latest route readable per component
  for (const t of ["hotel", "flight", "rail", "cruise"] as TowerKind[]) {
    assert.equal((await store.getLatestRouteForComponent(components[t].id))?.id, results[t].route.id);
  }
});

test("no inventory or price is created or required: commercial handoff is not an offer", async () => {
  const { store, components, handoffAndRoute } = await fourTowerTrip();
  for (const t of ["hotel", "flight", "rail", "cruise"] as TowerKind[]) {
    const { handoff } = await handoffAndRoute(t);
    assert.ok(!("totalPrice" in handoff) && !("currency" in handoff));
  }
  assert.equal(store.offers.size, 0);
  assert.equal(store.selections.size, 0);
  for (const c of Object.values(components)) assert.deepEqual(await store.listOffers(c.id), []);
  assert.deepEqual(await calculateSelectedTotal(store, "t4"), { ok: false, reason: "nothing_selected" });

  // the Register's inventory gaps are preserved, not resolved
  for (const p of Object.values(PROOF_ROUTES)) {
    assert.equal(p.ingestibleInventory, false);
    assert.ok(p.inventoryGap.length > 0);
  }
  assert.match(PROOF_ROUTES.cruise.inventoryGap, /ingestible cruise inventory source open/);
  assert.match(PROOF_ROUTES.hotel.inventoryGap, /StayingAPI excluded/);
});

test("cruise handoff proves commercial routing only: a routed Cruise still has zero cruise inventory", async () => {
  const { store, components, handoffAndRoute } = await fourTowerTrip();
  const { route } = await handoffAndRoute("cruise");
  assert.equal(route.eligibility, "eligible");
  assert.equal((await store.listOffers(components.cruise.id)).length, 0);
  assert.equal(await store.getSelectionForComponent(components.cruise.id), null);
});

test("independence: changing Hotel or Flight never changes the other components; a stale handoff is refused until re-recorded", async () => {
  const { store, components, handoffAndRoute } = await fourTowerTrip();
  const h = await handoffAndRoute("hotel");
  const f = await handoffAndRoute("flight");
  const r = await handoffAndRoute("rail");
  const c = await handoffAndRoute("cruise");
  const snap = async (t: TowerKind) => structuredClone(await store.getComponent(components[t].id));

  // change Hotel
  const [fB, rB, cB] = [await snap("flight"), await snap("rail"), await snap("cruise")];
  await updateComponentInput(store, components.hotel.id, { ...hotel, checkIn: "2026-11-03" });
  assert.deepEqual([await snap("flight"), await snap("rail"), await snap("cruise")], [fB, rB, cB]);
  await assert.rejects(resolveRouteForHandoff(store, { handoffId: h.handoff.id }), /stale/);
  for (const other of [f, r, c]) {
    assert.equal((await resolveRouteForHandoff(store, { handoffId: other.handoff.id, trackingEvidence: other.route.attribution.evidence })).eligibility, "eligible");
  }

  // change Flight
  const [hB, rB2, cB2] = [await snap("hotel"), await snap("rail"), await snap("cruise")];
  await updateComponentInput(store, components.flight.id, { ...flight, cabin: "business" });
  assert.deepEqual([await snap("hotel"), await snap("rail"), await snap("cruise")], [hB, rB2, cB2]);
  await assert.rejects(resolveRouteForHandoff(store, { handoffId: f.handoff.id }), /stale/);

  // re-recording the handoff against the new context resolves again, on the same merchant
  const fresh = await recordHandoff(store, {
    componentId: components.flight.id,
    merchantSlug: PROOF_ROUTES.flight.merchant.slug,
    landingUrl: PROOF_ROUTES.flight.landingUrl,
    provenance: { enteredVia: "commercial_handoff", evidenceRefs: [] },
  });
  const ev = (await cuelinksEvidenceFor(PROOF_ROUTES.flight.landingUrl, { convert: stubConvert })).evidence;
  assert.equal((await resolveRouteForHandoff(store, { handoffId: fresh.id, trackingEvidence: ev })).eligibility, "eligible");
});

test("honest commercial states: unaffiliated, failed, mismatched, no access route, no landing URL", async () => {
  const { store, components, handoffAndRoute } = await fourTowerTrip();

  // Qatar-style: Cuelinks returns a tracking URL but affiliated:false -> not monetisable
  const qatar = await ensureMerchant(store, { slug: "qatar-airways", name: "Qatar Airways" });
  const { linkMerchantToAccessRoute } = await import("./service");
  const cuelinks = (await store.getAccessRouteBySlug("cuelinks"))!;
  await linkMerchantToAccessRoute(store, { merchantId: qatar.id, accessRouteId: cuelinks.id, status: "approved" });
  const qFlight = await addComponent(store, { tripId: "t4", kind: "flight", input: flight });
  const qHandoff = await recordHandoff(store, { componentId: qFlight.id, merchantSlug: "qatar-airways", landingUrl: "https://www.qatarairways.com/", provenance: { enteredVia: "commercial_handoff", evidenceRefs: [] } });
  const qOutcome = await cuelinksEvidenceFor("https://www.qatarairways.com/", {
    convert: async (url) => ({ originalUrl: url, trackingUrl: "https://track.example/qr?u=1", affiliated: false, campaignId: 903, campaignName: "qr" }),
  });
  assert.equal(qOutcome.reason, "not_affiliated");
  const qRoute = await resolveRouteForHandoff(store, { handoffId: qHandoff.id, trackingEvidence: qOutcome.evidence });
  assert.equal(qRoute.routeType, "affiliate_outbound");
  assert.equal(qRoute.eligibility, "ineligible");
  assert.equal(qRoute.destinationUrl, null);
  assert.equal(qRoute.attribution.status, "none");
  assert.equal(qRoute.reason, "attribution_unverified");

  // the Air India route on the same trip is unaffected
  assert.equal((await handoffAndRoute("flight")).route.eligibility, "eligible");
  assert.notEqual((await store.getLatestRouteForComponent(components.flight.id))?.componentId, qFlight.id);

  // conversion failure and campaign mismatch never produce evidence
  const failed = await cuelinksEvidenceFor("https://www.airindia.com/", { convert: async () => { throw new Error("network down"); } });
  assert.equal(failed.reason, "conversion_failed");
  assert.equal(failed.evidence, null);
  const mismatch = await cuelinksEvidenceFor("https://www.airindia.com/", { convert: stubConvert, expectedCampaignId: 1 });
  assert.equal(mismatch.reason, "campaign_mismatch");
  assert.equal(mismatch.evidence, null);
  const noUrl = await cuelinksEvidenceFor("https://www.airindia.com/", { convert: async (url) => ({ originalUrl: url, trackingUrl: null, affiliated: true, campaignId: 1, campaignName: null }) });
  assert.equal(noUrl.reason, "no_tracking_url");

  // no approved access route -> inquiry_only; no landing URL -> unavailable
  const lone = await ensureMerchant(store, { slug: "lone-merchant", name: "Lone" });
  const c1 = await addComponent(store, { tripId: "t5", kind: "cruise", input: cruise });
  const h1 = await recordHandoff(store, { componentId: c1.id, merchantSlug: lone.slug, landingUrl: "https://lone.example/", provenance: { enteredVia: "commercial_handoff", evidenceRefs: [] } });
  const r1 = await resolveRouteForHandoff(store, { handoffId: h1.id });
  assert.equal(r1.routeType, "inquiry_only");
  assert.equal(r1.destinationUrl, null);
  const h2 = await recordHandoff(store, { componentId: c1.id, merchantSlug: "anantara", landingUrl: null, provenance: { enteredVia: "commercial_handoff", evidenceRefs: [] } });
  assert.equal((await resolveRouteForHandoff(store, { handoffId: h2.id })).routeType, "unavailable");
});

test("cross-tower suggestions still work alongside handoffs and stay editable/non-binding", async () => {
  const { store, components, handoffAndRoute } = await fourTowerTrip();
  await handoffAndRoute("flight");
  const flightComp = (await store.getComponent(components.flight.id))!;
  const before = structuredClone(flightComp);

  assert.deepEqual(suggestContext(flightComp, "hotel"), { destination: "Delhi", checkIn: "2026-11-01", checkOut: "2026-11-10", adults: 2, children: 0 });
  assert.deepEqual(suggestContext(await store.getComponent(components.rail.id) as never, "hotel"), null); // no Rail mapping without a real Rail source
  await updateComponentInput(store, components.hotel.id, { ...hotel, destination: "Goa" });
  assert.deepEqual(await store.getComponent(components.flight.id), before);
});

test("Cuelinks reuse: the real convertCuelinksUrl primitive drives evidence; affiliated:true is authoritative, tracking_url alone is not", async () => {
  const realFetch = global.fetch;
  const realKey = process.env.CUELINKS_API_KEY;
  process.env.CUELINKS_API_KEY = "test-key";
  const respond = (data: unknown) => {
    global.fetch = (async () => new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  };
  try {
    respond({ affiliated: true, tracking_url: "https://t.example/air-india?x=1", original_url: "https://www.airindia.com/", campaign: { id: 5622, name: "Air India" } });
    const ok = await cuelinksEvidenceFor("https://www.airindia.com/", { expectedCampaignId: 5622 });
    assert.equal(ok.reason, "ok");
    assert.equal(ok.evidence?.trackedUrl, "https://t.example/air-india?x=1");
    assert.equal(ok.evidence?.campaignId, 5622);

    respond({ affiliated: false, tracking_url: "https://t.example/qatar?x=1", original_url: "https://www.qatarairways.com/", campaign: { id: 903, name: "Qatar" } });
    const no = await cuelinksEvidenceFor("https://www.qatarairways.com/");
    assert.equal(no.reason, "not_affiliated");
    assert.equal(no.evidence, null);
  } finally {
    global.fetch = realFetch;
    if (realKey === undefined) delete process.env.CUELINKS_API_KEY;
    else process.env.CUELINKS_API_KEY = realKey;
  }
});

