// Hotel V1 (H1) tests. In-memory platform store and static source checks only:
// no database, no network, no StayingAPI calls.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { MemoryPlatformStore } from "../platform/memoryStore";
import { addComponent, ensureAccessRoute, ensureMerchant, linkMerchantToAccessRoute } from "../platform/service";
import { getHotelDecision, recordHotelDecision, type HotelDecisionInput } from "./decision";
import {
  ctaFromRoute,
  HOTEL_ROUTE_BUILDERS,
  previewHotelCta,
  resolveHotelActionForTrip,
  type HotelRouteBuilder,
  type HotelRouteContext,
} from "./commercial";
import type { CommercialRoute } from "../platform/types";
import type { CuelinksConversionResult } from "../commercial/cuelinks";

const SRC = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
// Source with comments removed, so checks look at code, not prose.
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((x) => !x.trim().startsWith("//"))
    .join("\n");
const code = (rel: string) => stripComments(read(rel));
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

const stay = { destination: "Dubai", checkIn: "2026-11-02", checkOut: "2026-11-06", rooms: 1, adults: 2, children: 0 };
const evidence = (sellerSlug: string, sellerName: string) => ({ sellerSlug, sellerName, totalPrice: 4500.5, currency: "AED", verdictId: "v1", rateId: "r1" });
const decisionInput = (sellerSlug = "test-merchant", sellerName = "Test Merchant", tripId = "trip-1"): HotelDecisionInput => ({
  tripId,
  propertyId: "prop-1",
  propertyName: "Test Property",
  stay,
  evidence: evidence(sellerSlug, sellerName),
});

// FIXTURE builder (not a production deeplink): a contextual URL from property + stay.
const fixtureBuilder: HotelRouteBuilder = (ctx: HotelRouteContext) => ({
  url: `https://merchant.example/hotels/${ctx.propertyId}?in=${ctx.stay.checkIn}&out=${ctx.stay.checkOut}&adults=${ctx.stay.adults}`,
  expectedCampaignId: 77,
});
const BUILDERS = { "test-merchant": fixtureBuilder };
const affiliatedConvert = async (url: string): Promise<CuelinksConversionResult> => ({ originalUrl: url, trackingUrl: `https://track.example/?u=${encodeURIComponent(url)}`, affiliated: true, campaignId: 77, campaignName: "c" });
const unaffiliatedConvert = async (url: string): Promise<CuelinksConversionResult> => ({ originalUrl: url, trackingUrl: `https://track.example/?u=${encodeURIComponent(url)}`, affiliated: false, campaignId: 77, campaignName: "c" });

async function withCuelinksApproved(store: MemoryPlatformStore, slug = "test-merchant", name = "Test Merchant") {
  const m = await ensureMerchant(store, { slug, name });
  const cuelinks = await ensureAccessRoute(store, { slug: "cuelinks", name: "Cuelinks", kind: "affiliate_network" });
  await linkMerchantToAccessRoute(store, { merchantId: m.id, accessRouteId: cuelinks.id, status: "approved" });
  return m;
}

// ---- 1 & 2: Discover and Compare never touch StayingAPI or prices ---------

const FORBIDDEN = /stayingApi|staying_api|lib\/suppliers|lib\/search|runSearch|ensureLiveCheckTriggered|lib\/browse|SUPPLIER_ADAPTERS/;

test("1: Discover (page, form, grid, catalogue discovery) has no StayingAPI/supplier/search dependency", () => {
  const files = ["app/page.tsx", "components/DiscoverForm.tsx", "components/HotelSelectionGrid.tsx", ...readdirSync(join(SRC, "lib/discovery")).map((n) => `lib/discovery/${n}`)];
  for (const f of files) assert.ok(!FORBIDDEN.test(code(f)), `${f} references StayingAPI/supplier/search code`);
  // the only price-bearing legacy helper (browse.ts) has no importers at all
  const importers = walk(SRC).filter((p) => !p.endsWith(join("lib", "browse.ts")) && /from "@\/lib\/browse"/.test(readFileSync(p, "utf8")));
  assert.deepEqual(importers, []);
});

test("2: Compare (page + price-discovery contract) has no StayingAPI/supplier/search dependency", () => {
  const files = ["app/compare/page.tsx", ...readdirSync(join(SRC, "lib/price-discovery")).map((n) => `lib/price-discovery/${n}`)];
  for (const f of files) {
    assert.ok(!FORBIDDEN.test(code(f)), `${f} references StayingAPI/supplier/search code`);
  }
});

// ---- 3: Check IQ only after explicit authorisation -------------------------

test("3: Check IQ stays behind the authorized=1 gate that Compare supplies, and after it makes ZERO StayingAPI/runSearch calls", () => {
  const page = code("app/check-iq/page.tsx");
  assert.ok(page.indexOf('authorized !== "1"') > 0, "authorization gate present");
  assert.ok(!/ensureLiveCheckTriggered|runSearch|stayingApi|SUPPLIER_ADAPTERS|pollLiveCheck/.test(page), "Check IQ must not call StayingAPI or runSearch");
  assert.match(read("app/compare/page.tsx"), /authorized=1/);
  // the live-check trigger is called from nowhere outside the quarantined implementation
  const callers = walk(SRC).filter((p) => !p.endsWith(".test.ts") && !p.includes("suppliers") && /ensureLiveCheckTriggered\(/.test(stripComments(readFileSync(p, "utf8"))));
  assert.deepEqual(callers, []);
});

// ---- 9: no fabricated Hotel price before Check IQ -------------------------

test("9: no price exists in Discover/Compare types or pages, and none is created before an explicit Check IQ selection", async () => {
  assert.ok(!/price|rate|total|cheapest/i.test(code("lib/discovery/types.ts")));
  assert.ok(!/totalPrice|nightlyPrice|cheapestTotal|taxesFees/.test(read("app/compare/page.tsx")));
  assert.match(read("app/compare/page.tsx"), /no prices, availability or rate claims/i);

  const store = new MemoryPlatformStore();
  await addComponent(store, { tripId: "trip-1", kind: "hotel", input: { ...stay, propertyId: "prop-1" } }); // shortlist/choice context only
  assert.equal(store.offers.size, 0);
  assert.equal(await getHotelDecision(store, "trip-1"), null);
});

// ---- 4: evidence is not attribution ---------------------------------------

test("4: StayingAPI-style evidence does not create commercial attribution or use the rate-source URL", async () => {
  const store = new MemoryPlatformStore();
  await recordHotelDecision(store, decisionInput("agoda", "Agoda"));
  const [offer] = [...store.offers.values()];
  assert.equal(offer!.sourceUrl, null); // rate-source URL is not carried as a destination
  assert.equal(offer!.payload.evidenceSource, "stayingapi");
  assert.deepEqual(offer!.provenance, { enteredVia: "check_iq_verification", evidenceRefs: ["verdict:v1", "rate:r1"] });
  assert.ok(!("attribution" in offer!) && !("trackingEvidence" in offer!.provenance));

  // merchant exists (identity), but with no approved access route there is no route and no attribution
  const action = await resolveHotelActionForTrip(store, "trip-1", { builders: BUILDERS });
  assert.ok(action);
  assert.equal(action!.route.routeType, "inquiry_only");
  assert.equal(action!.route.attribution.status, "none");
  assert.equal(action!.cta.enabled, false);
  assert.equal(action!.cta.url, null);
  assert.equal(store.routes.length, 1);
});

// ---- 5 & 6: eligibility is mandatory ---------------------------------------

test("5: unaffiliated / unattributable / unbuildable merchants never produce an enabled CTA", async () => {
  // approved Cuelinks route, builder exists, but affiliated:false -> ineligible, no URL
  const s1 = new MemoryPlatformStore();
  await withCuelinksApproved(s1);
  await recordHotelDecision(s1, decisionInput());
  const a1 = await resolveHotelActionForTrip(s1, "trip-1", { builders: BUILDERS, convert: unaffiliatedConvert });
  assert.equal(a1!.route.routeType, "affiliate_outbound");
  assert.equal(a1!.route.eligibility, "ineligible");
  assert.equal(a1!.cta.enabled, false);
  assert.equal(a1!.cta.url, null);

  // approved route but no verified contextual builder (production registry is empty) -> unavailable, no CTA
  assert.deepEqual(Object.keys(HOTEL_ROUTE_BUILDERS), []);
  const s2 = new MemoryPlatformStore();
  await withCuelinksApproved(s2);
  await recordHotelDecision(s2, decisionInput());
  const a2 = await resolveHotelActionForTrip(s2, "trip-1");
  assert.equal(a2!.route.routeType, "unavailable");
  assert.equal(a2!.cta.enabled, false);

  // the legacy bug shape: a route carrying a URL while ineligible must NOT enable the CTA
  const legacyShape = {
    routeType: "affiliate_outbound", eligibility: "ineligible", destinationUrl: "https://merchant.example/book",
    attribution: { status: "none", evidence: null }, reason: "attribution_unverified",
  } as unknown as CommercialRoute;
  const cta = ctaFromRoute(legacyShape, "Test Merchant");
  assert.equal(cta.enabled, false);
  assert.equal(cta.url, null);
  // and an eligible route with an invalid URL does not either
  assert.equal(ctaFromRoute({ ...legacyShape, eligibility: "eligible", destinationUrl: "/stub-booking" } as CommercialRoute, "X").enabled, false);
});

test("6: an eligible, proven, attributable route produces the appropriate CTA (contextual destination + evidence)", async () => {
  const store = new MemoryPlatformStore();
  await withCuelinksApproved(store);
  await recordHotelDecision(store, decisionInput());
  const action = await resolveHotelActionForTrip(store, "trip-1", { builders: BUILDERS, convert: affiliatedConvert });
  assert.equal(action!.route.eligibility, "eligible");
  assert.equal(action!.route.attribution.status, "tracked");
  assert.equal(action!.route.attribution.evidence?.campaignId, 77);
  assert.equal(action!.cta.enabled, true);
  assert.equal(action!.cta.label, "Book on Test Merchant");
  assert.match(action!.cta.url!, /^https:\/\/track\.example\//);
  assert.match(decodeURIComponent(action!.cta.url!), /hotels\/prop-1\?in=2026-11-02&out=2026-11-06&adults=2/); // stay context preserved in the destination
  assert.match(action!.cta.note, /may earn a commission/);
});

// ---- 7: one policy for Check IQ and Confirm --------------------------------

test("7: Check IQ (preview per seller) and Confirm (persisted) resolve the same CTA under the same policy", async () => {
  const cases: [string, typeof affiliatedConvert][] = [["eligible", affiliatedConvert], ["ineligible", unaffiliatedConvert]];
  for (const [, convert] of cases) {
    const store = new MemoryPlatformStore();
    await withCuelinksApproved(store);
    await recordHotelDecision(store, decisionInput());
    const preview = await previewHotelCta(
      store,
      { merchantSlug: "test-merchant", merchantName: "Test Merchant", propertyId: "prop-1", propertyName: "Test Property", stay },
      { builders: BUILDERS, convert }
    );
    const confirm = await resolveHotelActionForTrip(store, "trip-1", { builders: BUILDERS, convert });
    assert.deepEqual(preview, confirm!.cta);
  }
  // an unregistered seller (never seen by the platform) previews as no-route, never as a CTA
  const bare = await previewHotelCta(new MemoryPlatformStore(), { merchantSlug: "new-seller", merchantName: "New Seller", propertyId: "p", stay }, { builders: { "new-seller": fixtureBuilder } });
  assert.equal(bare.enabled, false);
  assert.equal(bare.routeType, "inquiry_only");
});

// ---- 8: Trip state continuity ---------------------------------------------

test("8: Hotel trip state survives Check IQ -> Complete Your Trip -> Confirm as ONE decision identity", async () => {
  const store = new MemoryPlatformStore();
  await withCuelinksApproved(store);
  const first = await recordHotelDecision(store, decisionInput());

  // Check IQ decision
  const atCheckIq = await getHotelDecision(store, "trip-1");
  assert.equal(atCheckIq!.component.input.propertyId, "prop-1");
  assert.deepEqual({ ...atCheckIq!.component.input, propertyId: undefined }, { ...stay, propertyId: undefined });

  // Complete Your Trip: experiences are additive components; the hotel decision is untouched
  await addComponent(store, { tripId: "trip-1", kind: "experience", input: { category: "activity", destination: "Dubai" } });
  await addComponent(store, { tripId: "trip-1", kind: "experience", input: { category: "private_tour", destination: "Dubai" } });
  const atCompleteTrip = await getHotelDecision(store, "trip-1");
  assert.deepEqual(atCompleteTrip!.component.input, atCheckIq!.component.input);
  assert.equal(atCompleteTrip!.selection.id, atCheckIq!.selection.id);

  // Confirm: same decision, same component, same selection; stay context feeds the route
  const atConfirm = await resolveHotelActionForTrip(store, "trip-1", { builders: BUILDERS, convert: affiliatedConvert });
  assert.equal(atConfirm!.decision.component.id, first.componentId);
  assert.equal(atConfirm!.decision.selection.id, first.selectionId);
  assert.equal(atConfirm!.route.selectionId, first.selectionId);
  assert.equal(atConfirm!.route.componentId, first.componentId);

  // re-selecting a different seller for the same stay keeps ONE hotel component and its trip facts
  await recordHotelDecision(store, decisionInput("other-seller", "Other Seller"));
  const hotels = (await store.listComponents("trip-1")).filter((c) => c.kind === "hotel");
  assert.equal(hotels.length, 1);
  assert.equal(hotels[0]!.id, first.componentId);
  assert.equal((await getHotelDecision(store, "trip-1"))!.selection.id, first.selectionId);
  assert.equal((await store.listComponents("trip-1")).filter((c) => c.kind === "experience").length, 2);

  // changing the stay context invalidates the old decision (no stale routing) but not the experiences
  await recordHotelDecision(store, { ...decisionInput(), stay: { ...stay, checkIn: "2026-11-03" } });
  assert.equal((await getHotelDecision(store, "trip-1"))!.component.input.checkIn, "2026-11-03");
  assert.equal((await store.listComponents("trip-1")).filter((c) => c.kind === "experience").length, 2);
});

// ---- Wiring: the legacy bypass and legacy router are out of the journey ----

test("wiring: active journey uses property choice + the Hotel V1 policy; no rate-source link, legacy router or StayingAPI seller mapping", () => {
  const confirm = code("app/confirm/page.tsx");
  assert.ok(!/resolveCommercialRoute|lib\/commercial"/.test(confirm), "legacy router not used by Confirm");
  assert.match(confirm, /cta\.enabled/);
  assert.match(confirm, /propertyCta\(/);
  assert.match(code("app/check-iq/page.tsx"), /selectProperty/);
  const actions = code("app/actions/trip.ts");
  assert.ok(!/recordHotelDecisionSafe|selectDeal|recordHotelDecision\(/.test(actions), "no seller/rate decision path in the active actions");
  assert.match(actions, /export async function selectProperty/);
  // the dormant priced-selection path is not wired to the platform (no StayingAPI seller -> merchant)
  assert.ok(!/journey"|hotel\/decision|platform\//.test(code("app/actions/legacyPricedSelection.ts")));
  // Phase 2 fixture landing URLs are not wired into Hotel V1
  for (const f of readdirSync(join(SRC, "lib/hotel")).filter((n) => !n.endsWith(".test.ts"))) {
    assert.ok(!/proofRoutes|PROOF_ROUTES/.test(read(`lib/hotel/${f}`)), `${f} must not use fixture proof routes`);
  }
});

