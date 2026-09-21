// Generic commercial access + Finalist handoff across the four towers.
// Deterministic: counting adapters, no network, no DB, no secrets.
// Positive tests use the REAL non-secret production evidence (register + proven adapter
// contracts). *.synthetic.* / *.fixture.* values appear only in negative or mechanism unit
// cases and never stand in for production evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { MemoryPlatformStore } from "./memoryStore";
import { addComponent } from "./service";
import { admitQuarterfinalists, chooseFinalist, narrowToSemifinalists } from "./tournament";
import type { FinalValidation } from "./finalValidation";
import { isOpaqueAttributionId, makeAttributionId } from "./attribution";
import { LINKKIT_PROVEN_BASE_URL, LINKKIT_PROVEN_CID, createLinkKitAdapter, linkKitConfigFromEnv } from "./linkkitAccess";
import { DCM_TUNE_PROVEN, createDcmTuneAdapter, dcmTuneConfigFromEnv } from "./dcmTuneAccess";
import { productionAccessAdapters } from "./accessAdapters";
import type { AccessAdapter, AccessRequest } from "./accessAdapter";
import { MERCHANT_REGISTER, PRODUCTION_DESTINATION_BUILDERS, routeReadiness, type DestinationBuilder } from "./commercialRegister";
import { TRIPCOM_VERIFIED_CITIES, buildTripComHotelsDestination } from "./tripComHotelsDestination";
import { resolveTowerHandoff, type TowerHandoffDeps } from "./handoff";
import { PROOF_ROUTES } from "./proofRoutes";
import type { ComponentInputByKind, TowerKind } from "./types";

const here = __dirname;
const src = join(here, "..", "..");
const code = (abs: string) =>
  readFileSync(abs, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

// ---- fixtures ------------------------------------------------------------------

// Production contracts (real, non-secret): used by every positive test below.
const NOW = () => new Date("2026-09-22T00:00:00Z");
// SYNTHETIC config, used ONLY for negative/unit cases (never stands in for production evidence).
const TUNE = { trackingBaseUrl: "https://tune.fixture.invalid/aff_c", offerId: 252, affiliateId: 172905, paramNames: { offerId: "offer_id", affiliateId: "aff_id", destination: "url", subId: "aff_sub" } };

const linkkit = () => createLinkKitAdapter(linkKitConfigFromEnv({}), { now: NOW });
const tune = () => createDcmTuneAdapter(dcmTuneConfigFromEnv({}), { now: NOW });
const syntheticTune = () => createDcmTuneAdapter(TUNE, { now: NOW });

// The exact manually proven property destinations (production evidence).
const ANANTARA = { id: "anantara-the-palm-dubai", url: "https://www.anantara.com/en/palm-dubai" };
const MARCO_POLO = { id: "gateway-hotel-hong-kong", url: "https://www.marcopolohotels.com/en/gateway-hotel-hong-kong" };
const AGODA = { id: "sofitel-dubai-the-palm", url: "https://www.agoda.com/sofitel-dubai-the-palm-resort-and-spa/hotel/dubai-ae.html" };

const INPUTS: { [K in TowerKind]: ComponentInputByKind[K] } = {
  hotel: { destination: "Bangkok", checkIn: "2026-11-02", checkOut: "2026-11-06", rooms: 1, adults: 2, children: 1, propertyId: "prop-1" },
  flight: { tripType: "return", legs: [{ from: "DEL", to: "DXB", departure: "2026-11-02" }], returnDate: "2026-11-06", travellers: { adults: 1, children: 0 } },
  rail: { origin: "Rome", destination: "Milan", date: "2026-11-02" },
  cruise: { query: "Mediterranean", departureDate: "2026-11-02" },
};

const validationFor = (kind: TowerKind): FinalValidation =>
  kind === "hotel"
    ? { kind: "check_iq", authorized: true, rateVerification: "unavailable" }
    : { kind: "factual_confirmation", confirmed: true, confirmedFacts: ["fare", "conditions"] };

const tournamentFor = (kind: TowerKind, finalist = "finalist-1") =>
  chooseFinalist(narrowToSemifinalists(admitQuarterfinalists(kind, [{ id: finalist }, { id: "other" }]), [finalist, "other"]), finalist, "traveller");

async function setup(kind: TowerKind, extra: Partial<TowerHandoffDeps> = {}) {
  const store = new MemoryPlatformStore();
  const component = await addComponent(store, { tripId: "trip-1", kind, input: INPUTS[kind] as never });
  const deps: TowerHandoffDeps = { store, adapters: { cuelinks: linkkit(), dcm: tune() }, ...extra };
  return { store, component, deps };
}

const decodedTarget = (trackedUrl: string) => new URL(trackedUrl).searchParams.get("url");
const counting = (inner: AccessAdapter) => {
  const calls: AccessRequest[] = [];
  return { calls, adapter: { ...inner, issue: (r: AccessRequest) => (calls.push(r), inner.issue(r)) } as AccessAdapter };
};

// SYNTHETIC builder for exercising the builder path only (its URL contract is not production evidence).
const syntheticBuilder =
  (host: string): DestinationBuilder =>
  ({ finalistId, context }) => ({ url: `https://${host}/hotel/${encodeURIComponent(finalistId)}?in=${context.checkIn}&out=${context.checkOut}` });

// ---- generic Cuelinks (LinkKit) adapter -------------------------------------------

test("generic Cuelinks adapter: LinkKit redirect with CID 319721, source=linkkit, encoded url, and Sub-ID", async () => {
  const id = makeAttributionId();
  const out = await linkkit().issue({ destinationUrl: "https://merchant.example/p?a=1&b=two words", attributionId: id, expectedCampaignId: 13297 });
  assert.ok(out.ok);
  if (!out.ok) return;
  const u = new URL(out.evidence.trackedUrl);
  assert.equal(u.origin + u.pathname, "https://linksredirect.com/");
  assert.equal(LINKKIT_PROVEN_BASE_URL, "https://linksredirect.com/");
  assert.equal(u.searchParams.get("cid"), "319721");
  assert.equal(u.searchParams.get("source"), "linkkit");
  assert.equal(u.searchParams.get("url"), "https://merchant.example/p?a=1&b=two words"); // survives encode/decode exactly
  assert.ok(out.evidence.trackedUrl.includes(encodeURIComponent("a=1&b=two")) || out.evidence.trackedUrl.includes("a%3D1%26b%3Dtwo"), "destination is percent-encoded in the redirect");
  assert.equal(u.searchParams.get("subid"), id);
  assert.equal(out.evidence.method, "cuelinks_linkkit_redirect");
  assert.equal(out.evidence.campaignId, 13297);
  assert.equal(out.evidence.attributionId, id);
});

test("LinkKit adapter refuses rather than guesses: unconfigured/insecure base, bad destination, non-opaque Sub-ID", async () => {
  const id = makeAttributionId();
  const dest = "https://merchant.example/";
  assert.deepEqual(await createLinkKitAdapter({}).issue({ destinationUrl: dest, attributionId: id }), { ok: false, reason: "not_configured" }); // host is never hard-coded
  assert.deepEqual(await createLinkKitAdapter({ baseUrl: "http://insecure.example/", cid: 319721 }).issue({ destinationUrl: dest, attributionId: id }), { ok: false, reason: "not_configured" });
  assert.deepEqual(await createLinkKitAdapter({ baseUrl: LINKKIT_PROVEN_BASE_URL, cid: null }).issue({ destinationUrl: dest, attributionId: id }), { ok: false, reason: "not_configured" });
  assert.deepEqual(await linkkit().issue({ destinationUrl: "/relative", attributionId: id }), { ok: false, reason: "invalid_destination" });
  assert.deepEqual(await linkkit().issue({ destinationUrl: "javascript:alert(1)", attributionId: id }), { ok: false, reason: "invalid_destination" });
  assert.deepEqual(await linkkit().issue({ destinationUrl: dest, attributionId: "rm-anantara-test-01" }), { ok: false, reason: "invalid_attribution_id" });
  // application config: the proven non-secret base and CID are the defaults; env may override
  assert.deepEqual(linkKitConfigFromEnv({}), { baseUrl: "https://linksredirect.com/", cid: 319721 });
  assert.equal(linkKitConfigFromEnv({ CUELINKS_LINKKIT_BASE_URL: "https://override.example/" }).baseUrl, "https://override.example/");
  // CID 319721 is the LinkKit routing identity, not a merchant campaign id
  for (const cap of Object.values(MERCHANT_REGISTER).flatMap((m) => Object.values(m.capabilities))) assert.notEqual(cap.campaignId, LINKKIT_PROVEN_CID);
});

// ---- opaque, non-PII Sub-ID ------------------------------------------------------------

test("Sub-ID is opaque and non-PII: random, fixed format, never the manual test value, refused if it looks like anything else", async () => {
  const ids = new Set(Array.from({ length: 200 }, () => makeAttributionId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^rm_[0-9a-f]{24}$/);
  for (const bad of ["rm-anantara-test-01", "rm_anantara_test_01", "jane.doe@example.com", "+971501234567", "trip-1", "2026-11-02", "rm_" + "A".repeat(24), "rm_" + "a".repeat(23), ""]) {
    assert.equal(isOpaqueAttributionId(bad), false, bad);
    assert.deepEqual(await linkkit().issue({ destinationUrl: "https://merchant.example/", attributionId: bad }), { ok: false, reason: "invalid_attribution_id" });
  }
  assert.ok(!/rm-anantara-test-01/.test(readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => code(join(here, f))).join("\n")), "manual test value must not appear in production code");

  // a real handoff uses the generated id, and the URL carries no trip/traveller data
  const { component, deps } = await setup("hotel");
  const r = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor("hotel", ANANTARA.id), validation: validationFor("hotel"), merchantSlug: "anantara" }, deps);
  assert.equal(r.status, "routed");
  if (r.status !== "routed") return;
  const ev = r.route.attribution.evidence;
  assert.ok(isOpaqueAttributionId(ev?.attributionId));
  assert.equal(new URL(ev!.trackedUrl).searchParams.get("subid"), ev!.attributionId);
  for (const pii of ["trip-1", component.id, "Bangkok"]) assert.ok(!(new URL(ev!.trackedUrl).searchParams.get("subid") ?? "").includes(pii));
});

// ---- Cuelinks hotels: one mechanism for Anantara, Marco Polo, Trip.com --------------------

test("Anantara and Marco Polo resolve their exact proven property destinations through the SAME generic Cuelinks mechanism", async () => {
  const results = [];
  for (const [slug, p, campaign] of [["anantara", ANANTARA, 13297], ["marco-polo-hotels", MARCO_POLO, null]] as const) {
    const { component, deps } = await setup("hotel");
    const c = counting(linkkit());
    const r = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor("hotel", p.id), validation: validationFor("hotel"), merchantSlug: slug }, { ...deps, adapters: { cuelinks: c.adapter } });
    assert.equal(r.status, "routed", slug);
    if (r.status !== "routed") return;
    assert.equal(c.calls.length, 1);
    assert.equal(c.calls[0]!.destinationUrl, p.url); // exact proven property URL, no fallback
    assert.equal(r.route.routeType, "affiliate_outbound");
    assert.equal(r.route.attribution.evidence?.method, "cuelinks_linkkit_redirect");
    const u = new URL(r.route.destinationUrl!);
    assert.equal(u.origin + u.pathname, "https://linksredirect.com/");
    assert.deepEqual([u.searchParams.get("cid"), u.searchParams.get("source"), u.searchParams.get("url")], ["319721", "linkkit", p.url]);
    assert.ok(isOpaqueAttributionId(u.searchParams.get("subid")));
    assert.equal(r.route.attribution.evidence?.campaignId, campaign); // merchant campaign, never the CID
    assert.equal(r.cta.enabled, true);
    results.push(r);
  }
  assert.equal(results.length, 2);
  // production evidence is recorded exactly, and is not a homepage
  assert.equal(MERCHANT_REGISTER.anantara!.capabilities.hotel?.properties?.[ANANTARA.id]?.url, ANANTARA.url);
  assert.equal(MERCHANT_REGISTER["marco-polo-hotels"]!.capabilities.hotel?.properties?.[MARCO_POLO.id]?.url, MARCO_POLO.url);
  assert.notEqual(new URL(ANANTARA.url).pathname, "/");
  // no merchant-specific affiliate code: the adapter/resolver files never name a merchant
  for (const f of ["linkkitAccess.ts", "dcmTuneAccess.ts", "handoff.ts", "accessAdapter.ts", "accessAdapters.ts"]) {
    assert.ok(!/anantara|marco|agoda|air-?india|italia|trip\.?com/i.test(code(join(here, f))), `${f} must stay merchant-neutral`);
  }
});

test("a Finalist without recorded proof gets no route from a proven merchant: no homepage or search fallback", async () => {
  for (const [slug, id] of [["anantara", "some-other-anantara-hotel"], ["marco-polo-hotels", "another-property"], ["agoda", "atlantis-the-royal"]] as const) {
    const { store, component, deps } = await setup("hotel");
    const r = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor("hotel", id), validation: validationFor("hotel"), merchantSlug: slug }, deps);
    assert.equal(r.status, "no_route", slug);
    if (r.status === "no_route") assert.equal(r.reason, "no_destination_evidence");
    assert.equal(store.routes.length, 0);
  }
  assert.equal(routeReadiness("anantara", "hotel", undefined, "some-other-anantara-hotel"), "needs_verified_url_contract");
  assert.equal(routeReadiness("anantara", "hotel", undefined, ANANTARA.id), "routable");
});

const PROVEN_TRIPCOM_URL =
  "https://ae.trip.com/hotels/list?city=359&provinceId=0&countryId=4&checkIn=2026-10-01&checkOut=2026-10-03&lat=0&lon=0&districtId=0&barCurr=AED&searchType=CT&searchWord=Bangkok&searchValue=___&crn=1&adult=2&children=0&searchBoxArg=t&ctm_ref=ix_sb_dl&travelPurpose=0&domestic=false";
const BANGKOK_STAY = { destination: "Bangkok", checkIn: "2026-10-01", checkOut: "2026-10-03", rooms: 1, adults: 2, children: 0, propertyId: "any-bangkok-hotel" };

test("Trip.com Hotels: the proven Bangkok contextual handoff resolves through generic Cuelinks and reproduces the exact proven contract", async () => {
  // the builder reproduces the manually proven destination byte for byte from the component context
  assert.equal(buildTripComHotelsDestination({ tower: "hotel", finalistId: "x", context: BANGKOK_STAY })?.url, PROVEN_TRIPCOM_URL);
  assert.equal(PRODUCTION_DESTINATION_BUILDERS["trip-com:hotel"], buildTripComHotelsDestination);

  const store = new MemoryPlatformStore();
  const component = await addComponent(store, { tripId: "t", kind: "hotel", input: BANGKOK_STAY });
  const c = counting(linkkit());
  const r = await resolveTowerHandoff(
    { componentId: component.id, tournament: tournamentFor("hotel", "any-bangkok-hotel"), validation: validationFor("hotel"), merchantSlug: "trip-com" },
    { store, adapters: { cuelinks: c.adapter } }
  );
  assert.equal(r.status, "routed");
  if (r.status !== "routed") return;
  assert.equal(c.calls[0]!.destinationUrl, PROVEN_TRIPCOM_URL);
  const u = new URL(r.route.destinationUrl!);
  assert.equal(u.origin + u.pathname, "https://linksredirect.com/");
  assert.deepEqual([u.searchParams.get("cid"), u.searchParams.get("source")], ["319721", "linkkit"]);
  assert.equal(u.searchParams.get("url"), PROVEN_TRIPCOM_URL); // survives the LinkKit wrap intact
  assert.equal(r.route.routeType, "affiliate_outbound");
  assert.equal(r.cta.enabled, true);
  assert.equal(MERCHANT_REGISTER["trip-com"]!.capabilities.hotel?.status, "proven_contextual");
  assert.equal(routeReadiness("trip-com", "hotel"), "routable");
});

test("Trip.com Hotels: all six context fields survive (destination, check-in, check-out, rooms, adults, children) plus currency, and nothing undocumented is added", () => {
  const ctx = { destination: "Bangkok", checkIn: "2026-12-20", checkOut: "2026-12-27", rooms: 2, adults: 3, children: 1, currency: "USD" };
  const built = buildTripComHotelsDestination({ tower: "hotel", finalistId: "x", context: ctx });
  assert.ok(built);
  const p = new URL(built!.url).searchParams;
  assert.equal(p.get("searchWord"), "Bangkok");
  assert.equal(p.get("city"), "359"); // from the verified mapping, not from the traveller's text
  assert.equal(p.get("checkIn"), "2026-12-20");
  assert.equal(p.get("checkOut"), "2026-12-27");
  assert.equal(p.get("crn"), "2");
  assert.equal(p.get("adult"), "3");
  assert.equal(p.get("children"), "1");
  assert.equal(p.get("barCurr"), "USD");
  // exactly the proven parameter set, in the proven order; the fixed ones are reproduced verbatim
  assert.deepEqual([...p.keys()], [...new URL(PROVEN_TRIPCOM_URL).searchParams.keys()]);
  for (const k of ["provinceId", "countryId", "lat", "lon", "districtId", "searchType", "searchValue", "searchBoxArg", "ctm_ref", "travelPurpose", "domestic"]) {
    assert.equal(p.get(k), new URL(PROVEN_TRIPCOM_URL).searchParams.get(k), k);
  }
  // destination lookup is case/space tolerant but still only for verified cities
  assert.ok(buildTripComHotelsDestination({ tower: "hotel", finalistId: "x", context: { ...ctx, destination: "  bangkok " } }));
  // currency defaults to the proven AED when the component has none
  assert.equal(new URL(buildTripComHotelsDestination({ tower: "hotel", finalistId: "x", context: { ...BANGKOK_STAY } })!.url).searchParams.get("barCurr"), "AED");
});

test("Trip.com Hotels: an unverified city mapping or invalid context produces NO route (city ids are never invented; no homepage or search fallback)", async () => {
  assert.deepEqual(Object.keys(TRIPCOM_VERIFIED_CITIES), ["bangkok"]);
  for (const destination of ["Dubai", "Phuket", "Bangkok Thailand", "", "constructor", "__proto__"]) {
    assert.equal(buildTripComHotelsDestination({ tower: "hotel", finalistId: "x", context: { ...BANGKOK_STAY, destination } }), null, destination);
  }
  for (const bad of [{ checkIn: "2026-10-03" }, { checkIn: "10/01/2026" }, { rooms: 0 }, { adults: 0 }, { children: -1 }, { adults: "2" }, { currency: "aed" }]) {
    assert.equal(buildTripComHotelsDestination({ tower: "hotel", finalistId: "x", context: { ...BANGKOK_STAY, ...bad } }), null, JSON.stringify(bad));
  }
  const store = new MemoryPlatformStore();
  const component = await addComponent(store, { tripId: "t", kind: "hotel", input: { ...BANGKOK_STAY, destination: "Dubai" } });
  const r = await resolveTowerHandoff(
    { componentId: component.id, tournament: tournamentFor("hotel", "dubai-hotel"), validation: validationFor("hotel"), merchantSlug: "trip-com" },
    { store, adapters: { cuelinks: linkkit() } }
  );
  assert.deepEqual([r.status, r.route], ["no_route", null]);
  if (r.status === "no_route") assert.equal(r.reason, "no_destination_evidence");
  assert.equal(r.cta.enabled, false);
  assert.equal(r.cta.url, null);
  assert.equal(store.routes.length + store.handoffs.size, 0);
  assert.equal(routeReadiness("trip-com", "hotel", {}), "needs_verified_url_contract");
});

test("adapters are not limited to the manually tested hotels: a further property routes only with verified identity + approved access + exact destination, and never falls back", async () => {
  const register = {
    "new-hotel-co": {
      slug: "new-hotel-co",
      name: "New Hotel Co",
      capabilities: {
        hotel: {
          status: "proven_property" as const,
          accessRoute: "cuelinks" as const,
          properties: { "verified-prop": { url: "https://newhotel.example/verified-prop", evidence: "synthetic unit case" } },
          evidence: "synthetic unit case (not production evidence)",
        },
      },
    },
  };
  const { store, component, deps } = await setup("hotel");
  const ok = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor("hotel", "verified-prop"), validation: validationFor("hotel"), merchantSlug: "new-hotel-co" }, { ...deps, register });
  assert.equal(ok.status, "routed"); // the same generic Cuelinks adapter, no adapter change
  const c2 = await addComponent(store, { tripId: "trip-2", kind: "hotel", input: INPUTS.hotel });
  const unmapped = await resolveTowerHandoff({ componentId: c2.id, tournament: tournamentFor("hotel", "unmapped-prop"), validation: validationFor("hotel"), merchantSlug: "new-hotel-co" }, { ...deps, register });
  assert.deepEqual([unmapped.status, unmapped.route], ["no_route", null]); // merchant known, property unmapped: no homepage/search stand-in
  assert.equal(store.routes.length, 1);
});


// ---- proven Flight / Rail / Cruise handoffs (exact Phase-2 evidence) ----------------------------

for (const [tower, slug, campaign] of [["flight", "air-india", 5622], ["rail", "italiarail", 3878], ["cruise", "trip-com", null]] as const) {
  test(`${slug} ${tower}: the exact Phase-2 proof landing is handed off through the generic Cuelinks adapter`, async () => {
    const { store, component, deps } = await setup(tower);
    const proof = PROOF_ROUTES[tower];
    const r = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor(tower), validation: validationFor(tower), merchantSlug: slug }, deps);
    assert.equal(r.status, "routed");
    if (r.status !== "routed") return;
    assert.equal(decodedTarget(r.route.destinationUrl!), proof.landingUrl); // exact evidence, nothing reconstructed
    assert.equal(r.route.attribution.evidence?.campaignId, campaign);
    assert.equal(r.route.attribution.status, "tracked");
    assert.equal(r.cta.enabled, true);
    assert.equal(r.cta.url, r.route.destinationUrl);
    // a priceless handoff: no offer, price, currency or selection was created
    assert.equal(store.offers.size, 0);
    assert.equal(store.selections.size, 0);
    assert.equal(store.handoffs.size, 1);
    assert.equal(store.routes.length, 1);
    assert.equal(r.route.selectionId, null);
    assert.ok(r.route.handoffId);
  });
}

test("Trip.com is modelled ONCE as a merchant and Cuelinks ONCE as an access route across Hotels and Cruises", async () => {
  const store = new MemoryPlatformStore();
  const h = await addComponent(store, { tripId: "t", kind: "hotel", input: INPUTS.hotel });
  const c = await addComponent(store, { tripId: "t", kind: "cruise", input: INPUTS.cruise });
  const deps: TowerHandoffDeps = { store, adapters: { cuelinks: linkkit() }, };
  const a = await resolveTowerHandoff({ componentId: h.id, tournament: tournamentFor("hotel"), validation: validationFor("hotel"), merchantSlug: "trip-com" }, deps);
  const b = await resolveTowerHandoff({ componentId: c.id, tournament: tournamentFor("cruise"), validation: validationFor("cruise"), merchantSlug: "trip-com" }, deps);
  assert.equal(a.status, "routed");
  assert.equal(b.status, "routed");
  assert.equal([...store.merchants.values()].filter((m) => m.slug.startsWith("trip")).length, 1);
  assert.equal(store.accessRoutes.size, 1);
  assert.equal(store.links.length, 1);
  assert.equal(MERCHANT_REGISTER["trip-com"]!.name, "Trip.com");
  assert.ok(!Object.keys(MERCHANT_REGISTER).some((k) => k !== "trip-com" && /trip/.test(k)), "no separate per-vertical Trip.com merchants");
  assert.equal(routeReadiness("trip-com", "hotel"), "routable");
  assert.equal(routeReadiness("trip-com", "cruise"), "routable");
  // cruise handoff never becomes cruise inventory
  assert.equal(store.offers.size, 0);
  assert.match(PROOF_ROUTES.cruise.inventoryGap, /ingestible cruise inventory source open/);
});

// ---- DCM/TUNE (Agoda) ------------------------------------------------------------------------------

test("Agoda/Sofitel resolves through the generic DCM/TUNE adapter: offer 252, affiliate 172905, go.urtrackinglink.com/aff_c, exact clean property URL", async () => {
  const { store, component, deps } = await setup("hotel");
  const c = counting(tune());
  const r = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor("hotel", AGODA.id), validation: validationFor("hotel"), merchantSlug: "agoda" }, { ...deps, adapters: { dcm: c.adapter } });
  assert.equal(r.status, "routed");
  if (r.status !== "routed") return;
  assert.equal(c.calls[0]!.destinationUrl, AGODA.url); // the clean property URL, not a /search URL
  assert.ok(!/\/search|\?/.test(AGODA.url));
  assert.deepEqual(c.calls[0]!.expectedIdentity, { offerId: 252, affiliateId: 172905 });
  const tracked = r.route.destinationUrl!;
  assert.ok(tracked.startsWith("https://go.urtrackinglink.com/aff_c?offer_id=252&aff_id=172905&url="));
  const u = new URL(tracked);
  assert.equal(u.searchParams.get("url"), AGODA.url);
  assert.equal(r.route.attribution.evidence?.method, "dcm_tune_tracking_link");
  assert.equal(r.route.routeType, "affiliate_outbound");
  assert.ok(isOpaqueAttributionId(r.route.attribution.evidence?.attributionId));
  // commercial infrastructure only: no offer/price/rate was created
  assert.equal(store.offers.size, 0);
  assert.equal(store.selections.size, 0);
  // no API credential is needed or read to construct the proven link
  assert.ok(!/API_KEY|API_TOKEN|SECRET|PASSWORD|Authorization/i.test(code(join(here, "dcmTuneAccess.ts"))));
  assert.deepEqual(DCM_TUNE_PROVEN, { trackingBaseUrl: "https://go.urtrackinglink.com/aff_c", offerId: 252, affiliateId: 172905, paramNames: { offerId: "offer_id", affiliateId: "aff_id", destination: "url" } });
  // production access adapters are executable with the proven defaults, without any secret env
  const prod = productionAccessAdapters({});
  assert.deepEqual(Object.keys(prod).sort(), ["cuelinks", "dcm"]);
  const viaProd = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor("hotel", AGODA.id), validation: validationFor("hotel"), merchantSlug: "agoda" }, { store, adapters: prod });
  assert.equal(viaProd.status, "routed");
});

test("DCM/TUNE preserves any macros already on the tracking base URL and sends the Sub-ID only when its parameter name is configured", async () => {
  const id = makeAttributionId();
  const req: AccessRequest = { destinationUrl: AGODA.url, attributionId: id, expectedIdentity: { offerId: 252, affiliateId: 172905 } };
  const withMacros = createDcmTuneAdapter({ ...dcmTuneConfigFromEnv({}), trackingBaseUrl: "https://go.urtrackinglink.com/aff_c?aff_sub2={transaction_id}&pub={publisher}" });
  const out = await withMacros.issue(req);
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.ok(out.evidence.trackedUrl.startsWith("https://go.urtrackinglink.com/aff_c?aff_sub2={transaction_id}&pub={publisher}&offer_id=252&aff_id=172905&url="), out.evidence.trackedUrl); // macros untouched (braces not encoded)
  // no Sub-ID parameter unless one is configured (its name is not in the recovered evidence)
  assert.ok(!/aff_sub=/.test(out.evidence.trackedUrl));
  const withSub = await createDcmTuneAdapter(dcmTuneConfigFromEnv({ DCM_TUNE_PARAM_SUBID: "aff_sub" })).issue(req);
  assert.ok(withSub.ok);
  if (withSub.ok) assert.equal(new URL(withSub.evidence.trackedUrl).searchParams.get("aff_sub"), id);
});

test("DCM/TUNE refuses on missing config or identity mismatch, and never echoes configuration in results", async () => {
  const id = makeAttributionId();
  const req: AccessRequest = { destinationUrl: AGODA.url, attributionId: id, expectedIdentity: { offerId: 252, affiliateId: 172905 } };
  assert.deepEqual(await createDcmTuneAdapter({}).issue(req), { ok: false, reason: "not_configured" });
  assert.deepEqual(await createDcmTuneAdapter({ ...TUNE, paramNames: { offerId: "offer_id" } }).issue(req), { ok: false, reason: "not_configured" }); // param names are never guessed
  assert.deepEqual(await createDcmTuneAdapter({ ...TUNE, trackingBaseUrl: "http://tune.fixture.invalid/" }).issue(req), { ok: false, reason: "not_configured" });
  assert.deepEqual(await tune().issue({ ...req, expectedIdentity: undefined }), { ok: false, reason: "identity_missing" });
  assert.deepEqual(await tune().issue({ ...req, expectedIdentity: { offerId: 999, affiliateId: 172905 } }), { ok: false, reason: "identity_mismatch" });
  assert.deepEqual(await tune().issue({ ...req, attributionId: "rm-anantara-test-01" }), { ok: false, reason: "invalid_attribution_id" });
  assert.deepEqual(await tune().issue({ ...req, destinationUrl: "/relative" }), { ok: false, reason: "invalid_destination" });

  const SECRET = "s3cr3t-token-value";
  const secret = createDcmTuneAdapter({ ...TUNE, trackingBaseUrl: `https://tune.fixture.invalid/aff_c/${SECRET}` });
  const refused = await secret.issue({ ...req, destinationUrl: "/nope" });
  assert.ok(!JSON.stringify(refused).includes(SECRET));
  // env overrides win; nothing else is read from env
  assert.equal(dcmTuneConfigFromEnv({ DCM_TUNE_OFFER_ID: "253" }).offerId, 253);
  assert.equal(dcmTuneConfigFromEnv({}).offerId, 252);
});


// ---- unverified / missing evidence => no route ---------------------------------------------------------

test("unverified destination builders cannot generate commercial routes (Trip.com Flights, Rail, Flight+Hotel and Tours are TO VERIFY)", async () => {
  for (const tower of ["flight", "rail"] as const) {
    const { store, component, deps } = await setup(tower, { builders: { [`trip-com:${tower}`]: () => ({ url: "https://trip.synthetic.example/anything" }) } });
    const r = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor(tower), validation: validationFor(tower), merchantSlug: "trip-com" }, deps);
    assert.deepEqual([r.status, r.route], ["no_route", null]);
    if (r.status === "no_route") assert.equal(r.reason, "capability_unverified");
    assert.equal(store.routes.length + store.handoffs.size, 0);
    assert.equal(r.cta.enabled, false);
    assert.equal(r.cta.url, null);
  }
  for (const key of ["flight_hotel", "private_tours", "group_tours"] as const) assert.equal(MERCHANT_REGISTER["trip-com"]!.capabilities[key]?.status, "to_verify");
  assert.equal(routeReadiness("trip-com", "flight"), "to_verify");
  // the only production destination builder is Trip.com Hotels, built from its one proven contract
  assert.deepEqual(Object.keys(PRODUCTION_DESTINATION_BUILDERS), ["trip-com:hotel"]);
  // exact proven property destinations are routable in production
  for (const m of ["anantara", "marco-polo-hotels", "agoda"]) assert.equal(routeReadiness(m, "hotel"), "routable", m);
  for (const [m, t] of [["air-india", "flight"], ["italiarail", "rail"], ["trip-com", "cruise"]] as const) assert.equal(routeReadiness(m, t), "routable", m);
});

test("missing evidence results in no route and a disabled CTA, never a fabricated fallback", async () => {
  const good = (o: object = {}) => ({ tournament: tournamentFor("flight"), validation: validationFor("flight"), ...o });
  const run = async (merchantSlug: string, over: Partial<TowerHandoffDeps> = {}, tower: TowerKind = "flight", finalist?: string) => {
    const { store, component, deps } = await setup(tower, over);
    const r = await resolveTowerHandoff({ componentId: component.id, ...good({ tournament: tournamentFor(tower, finalist), validation: validationFor(tower) }), merchantSlug }, deps);
    assert.equal(store.routes.length, 0);
    assert.equal(r.cta.enabled, false);
    assert.equal(r.cta.url, null);
    return r;
  };
  assert.equal((await run("unknown-merchant")).status, "no_route");
  assert.equal(((await run("unknown-merchant")) as { reason: string }).reason, "merchant_not_registered");
  assert.equal(((await run("air-india", {}, "hotel")) as { reason: string }).reason, "capability_not_registered"); // Air India has no hotel capability
  assert.equal(((await run("anantara", {}, "hotel")) as { reason: string }).reason, "no_destination_evidence"); // proven merchant, but this Finalist has no recorded proof: no homepage fallback
  assert.equal(((await run("air-india", { adapters: {} })) as { reason: string }).reason, "access_adapter_unavailable");
  assert.equal(((await run("air-india", { adapters: { cuelinks: createLinkKitAdapter({}) } })) as { reason: string }).reason, "access_refused_not_configured");
  assert.equal(((await run("air-india", { newAttributionId: () => "rm-anantara-test-01" })) as { reason: string }).reason, "access_refused_invalid_attribution_id");
  assert.equal(((await run("agoda", { adapters: { dcm: createDcmTuneAdapter({}) } }, "hotel", AGODA.id)) as { reason: string }).reason, "access_refused_not_configured");
  // a builder that returns nothing / an invalid URL yields no destination (synthetic builder cases)
  assert.equal(((await run("trip-com", { builders: { "trip-com:hotel": () => null } }, "hotel")) as { reason: string }).reason, "no_destination_evidence");
  assert.equal(((await run("trip-com", { builders: { "trip-com:hotel": () => ({ url: "/stub-booking?x=1" }) } }, "hotel")) as { reason: string }).reason, "no_destination_evidence");
});

// ---- no commercial CTA before the applicable final decision stage ------------------------------------------

test("no commercial CTA, adapter call, handoff or route before the applicable final decision stage", async () => {
  for (const tower of ["hotel", "flight", "rail", "cruise"] as const) {
    const slug = { hotel: "anantara", flight: "air-india", rail: "italiarail", cruise: "trip-com" }[tower];
    const { store, component, deps } = await setup(tower);
    const c = counting(linkkit());
    const d = { ...deps, adapters: { cuelinks: c.adapter } };
    const quarter = admitQuarterfinalists(tower, [{ id: "a" }, { id: "b" }]);
    const semi = narrowToSemifinalists(quarter, ["a", "b"]);
    const stages = [
      [quarter, validationFor(tower)], // only quarterfinalists, even with a validation lying around
      [semi, validationFor(tower)], // Compare set without a chosen Finalist
      [chooseFinalist(semi, "a", "traveller"), null], // Finalist but no final validation yet
    ] as const;
    for (const [tournament, validation] of stages) {
      const r = await resolveTowerHandoff({ componentId: component.id, tournament, validation, merchantSlug: slug }, d);
      assert.equal(r.status, "blocked_stage", tower);
      assert.equal(r.cta.enabled, false);
      assert.equal(r.cta.url, null);
    }
    assert.equal(c.calls.length, 0, "the access network is never contacted before the decision is complete");
    assert.equal(store.routes.length + store.handoffs.size + store.offers.size, 0);
  }
});

test("Hotel commercial action cannot bypass Check IQ", async () => {
  const { store, component, deps } = await setup("hotel");
  const t = tournamentFor("hotel", ANANTARA.id);
  for (const validation of [null, { kind: "check_iq", authorized: false, rateVerification: "unavailable" } as FinalValidation, { kind: "factual_confirmation", confirmed: true, confirmedFacts: ["x"] } as FinalValidation]) {
    const r = await resolveTowerHandoff({ componentId: component.id, tournament: t, validation, merchantSlug: "anantara" }, deps);
    assert.equal(r.status, "blocked_stage");
  }
  assert.equal(store.routes.length, 0);
  const ok = await resolveTowerHandoff({ componentId: component.id, tournament: t, validation: validationFor("hotel"), merchantSlug: "anantara" }, deps);
  assert.equal(ok.status, "routed");
});

test("resolving a handoff never changes the tournament or the component's decision inputs", async () => {
  const { store, component, deps } = await setup("flight");
  const t = tournamentFor("flight");
  const before = JSON.stringify(t);
  const inputBefore = JSON.stringify(component.input);
  const r = await resolveTowerHandoff({ componentId: component.id, tournament: t, validation: validationFor("flight"), merchantSlug: "air-india" }, deps);
  assert.equal(r.status, "routed");
  assert.equal(JSON.stringify(t), before);
  assert.equal(JSON.stringify((await store.getComponent(component.id))!.input), inputBefore);
  assert.equal((await store.getComponent(component.id))!.status, "draft"); // no offer selection was fabricated
  await assert.rejects(() => resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor("hotel"), validation: validationFor("hotel"), merchantSlug: "air-india" }, deps), /Tournament is for hotel/);
});

// ---- boundaries: StayingAPI, cards, Hotel journey -----------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
  }
  return out;
}

test("StayingAPI stays unreachable: the new commercial/decision modules import nothing from suppliers/search/StayingAPI", () => {
  const NEW = ["tournament.ts", "finalValidation.ts", "attribution.ts", "accessAdapter.ts", "linkkitAccess.ts", "dcmTuneAccess.ts", "commercialRegister.ts", "handoff.ts", "priceWatch.ts", "accessAdapters.ts"];
  for (const f of NEW) {
    const c = code(join(here, f));
    for (const l of c.split("\n").filter((x) => /^\s*(import|export)\b.*from\s/.test(x))) {
      assert.ok(!/suppliers|stayingapi|\/search|price-discovery|hotel\/|browse/i.test(l), `${f}: forbidden import ${l}`);
    }
    assert.ok(!/stayingApi|staying_api|runSearch|ensureLiveCheckTriggered|pollLiveCheck|SUPPLIER_ADAPTERS/.test(c), `${f} must not reference StayingAPI execution`);
  }
});

test("Discover/Compare cards and the live Hotel journey do not use the new commercial modules (no affiliate links in cards, no regression)", () => {
  const NEW_API = /resolveTowerHandoff|createLinkKitAdapter|createDcmTuneAdapter|linkKitConfigFromEnv|dcmTuneConfigFromEnv|MERCHANT_REGISTER|commercialRegister|handoff"|linkkitAccess|dcmTuneAccess/;
  for (const f of walk(join(src, "app")).concat(walk(join(src, "components")))) {
    assert.ok(!NEW_API.test(code(f)), `${f} must not reach the new commercial layer`);
  }
  // Hotel production modules are untouched by this layer and still never use fixture proof routes
  for (const f of readdirSync(join(src, "lib", "hotel")).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    assert.ok(!/commercialRegister|linkkitAccess|dcmTuneAccess|platform\/handoff|tournament/.test(code(join(src, "lib", "hotel", f))), f);
  }
  // Discover / Compare cards contain no external hrefs
  for (const f of ["components/HotelSelectionGrid.tsx", "components/HotelCard.tsx"]) {
    try {
      assert.ok(!/href=\{?["'`]?https?:/.test(code(join(src, f))), `${f} must not carry external links`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
});

test("no fixture/synthetic destination masquerades as production evidence, and production evidence is exact and non-secret", () => {
  for (const f of readdirSync(here).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    assert.ok(!/\.fixture\.|\.synthetic\.|fixture\.invalid/.test(code(join(here, f))), `${f} must not contain fixture destinations`);
  }
  const urls = Object.values(MERCHANT_REGISTER).flatMap((m) =>
    Object.values(m.capabilities).flatMap((c) => [c.landingUrl, ...Object.values(c.properties ?? {}).map((p) => p.url)].filter((u): u is string => !!u))
  );
  assert.ok(urls.includes(ANANTARA.url) && urls.includes(MARCO_POLO.url) && urls.includes(AGODA.url));
  for (const u of urls) {
    assert.match(u, /^https:\/\//);
    assert.ok(!/[?&](token|key|secret|api_?key|password)=/i.test(u), u);
  }
  assert.ok(!urls.some((u) => /\/search\b/.test(u)), "no session-heavy search URLs");
});

test("register hygiene: no inventory, price or ranking data anywhere in the merchant register", () => {
  const text = JSON.stringify(MERCHANT_REGISTER);
  assert.ok(!/price|totalPrice|rate\b|score|rank|recommend|commission|payout/i.test(text.replace(/rate-manifest|Rate Manifest/gi, "")));
  for (const m of Object.values(MERCHANT_REGISTER)) for (const cap of Object.values(m.capabilities)) if (cap.status === "proven_landing") assert.ok(cap.landingUrl, `${m.slug} landing evidence`);
});

test("DCM/TUNE: offer_id, aff_id, offer 252, affiliate 172905 and the aff_c base are confirmed; an unconfirmed Sub-ID parameter name does not block the proven Agoda route", async () => {
  assert.deepEqual(DCM_TUNE_PROVEN, { trackingBaseUrl: "https://go.urtrackinglink.com/aff_c", offerId: 252, affiliateId: 172905, paramNames: { offerId: "offer_id", affiliateId: "aff_id", destination: "url" } });
  const cfg = dcmTuneConfigFromEnv({});
  assert.equal(cfg.paramNames?.subId, undefined); // Sub-ID parameter name is UNCONFIRMED: never defaulted or guessed
  const { component, deps } = await setup("hotel");
  const r = await resolveTowerHandoff({ componentId: component.id, tournament: tournamentFor("hotel", AGODA.id), validation: validationFor("hotel"), merchantSlug: "agoda" }, deps);
  assert.equal(r.status, "routed"); // routes without any Sub-ID parameter
  if (r.status !== "routed") return;
  const u = new URL(r.route.destinationUrl!);
  assert.deepEqual([...u.searchParams.keys()], ["offer_id", "aff_id", "url"]); // exactly the confirmed parameters, nothing guessed
  assert.equal(u.searchParams.get("offer_id"), "252");
  assert.equal(u.searchParams.get("aff_id"), "172905");
  assert.equal(u.searchParams.get("url"), AGODA.url);
  assert.ok(isOpaqueAttributionId(r.route.attribution.evidence?.attributionId)); // still recorded internally
});

test("invariant: AED belongs to the proven Bangkok Trip.com contract only, not a global Rate Manifest currency default", () => {
  const file = readFileSync(join(here, "tripComHotelsDestination.ts"), "utf8");
  assert.match(file, /AED is the currency of the currently proven Bangkok Trip\.com\s*\/\/ contract ONLY/);
  assert.match(file, /NOT a\s*\/\/ global Rate Manifest currency default/);
  // the only production reference to AED is that one scoped constant
  for (const f of readdirSync(here).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    const hits = code(join(here, f)).match(/["']AED["']/g) ?? [];
    assert.equal(hits.length, f === "tripComHotelsDestination.ts" ? 1 : 0, `${f}: AED must not be a shared default`);
  }
  // a component's own currency always wins; only a currency-less context falls back to the proven contract's AED
  const ctx = { destination: "Bangkok", checkIn: "2026-10-01", checkOut: "2026-10-03", rooms: 1, adults: 2, children: 0 };
  assert.equal(new URL(buildTripComHotelsDestination({ tower: "hotel", finalistId: "x", context: { ...ctx, currency: "GBP" } })!.url).searchParams.get("barCurr"), "GBP");
  // no other tower/merchant route carries a currency at all
  for (const kind of ["flight", "rail", "cruise"] as const) assert.ok(!("currency" in INPUTS[kind]));
});
