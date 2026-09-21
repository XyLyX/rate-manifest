// H2A tests: Return-to-rate-check authorization, commercial route reuse
// (Cuelinks call behaviour), and the explicit Anantara blocked state.
// In-memory store + static source checks only; the Cuelinks conversion is a
// counting stub, no network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MemoryPlatformStore } from "../platform/memoryStore";
import { ensureAccessRoute, ensureMerchant, linkMerchantToAccessRoute } from "../platform/service";
import { recordHotelDecision, type HotelDecisionInput } from "./decision";
import { HOTEL_ROUTE_BUILDERS, previewHotelCtaForTrip, resolveHotelActionForTrip, type HotelRouteBuilder, type HotelRouteContext } from "./commercial";
import { rateCheckReturnHref } from "./links";
import type { CuelinksConversionResult } from "../commercial/cuelinks";

const SRC = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((x) => !x.trim().startsWith("//"))
    .join("\n");
const code = (rel: string) => stripComments(read(rel));

// ---- 1 & 2: Return to rate check ------------------------------------------

test("Return to rate check: Confirm's link carries authorization and the trip/hotel/date context", () => {
  const href = rateCheckReturnHref({ hotelId: "prop-1", checkIn: "2026-11-02", checkOut: "2026-11-06", tripId: "trip-1" });
  const u = new URL(href, "https://example.test");
  assert.equal(u.pathname, "/check-iq");
  assert.equal(u.searchParams.get("authorized"), "1");
  assert.equal(u.searchParams.get("hotel"), "prop-1");
  assert.equal(u.searchParams.get("checkin"), "2026-11-02");
  assert.equal(u.searchParams.get("checkout"), "2026-11-06");
  assert.equal(u.searchParams.get("trip"), "trip-1"); // occupancy is re-read from this trip by Check IQ

  // Confirm builds the link only through the helper (no hand-built, unauthorized check-iq URL)
  const confirm = code("app/confirm/page.tsx");
  assert.match(confirm, /rateCheckReturnHref\(/);
  assert.ok(!/`\/check-iq\?/.test(confirm), "Confirm must not hand-build a /check-iq URL");
  // Check IQ reads occupancy from the trip it is given
  assert.match(code("app/check-iq/page.tsx"), /trip\?\.adults/);
  assert.match(code("app/check-iq/page.tsx"), /trip\?\.children/);
});

test("Authorization gate unchanged: a fresh /check-iq entry without authorized=1 is still redirected to Compare", () => {
  const page = code("app/check-iq/page.tsx");
  // the gate condition depends on the authorized param alone (a trip/hotel param cannot substitute for it)
  assert.match(page, /if \(authorized !== "1"\) \{[\s\S]*?redirect\(compareUrl\);[\s\S]*?\}/);
  assert.match(page, /const authorized = params\.authorized;/);
  // and after it, Check IQ makes no StayingAPI/runSearch call at all
  assert.ok(page.indexOf('authorized !== "1"') > 0);
  assert.ok(!/ensureLiveCheckTriggered|runSearch|stayingApi/.test(page));

  // a fresh entry (no authorized param) fails the page's predicate; the Confirm return passes it
  const fresh = new URL("/check-iq?hotel=prop-1&checkin=2026-11-02&checkout=2026-11-06&trip=trip-1", "https://example.test");
  const ret = new URL(rateCheckReturnHref({ hotelId: "prop-1", checkIn: "2026-11-02", checkOut: "2026-11-06", tripId: "trip-1" }), "https://example.test");
  assert.equal(fresh.searchParams.get("authorized") !== "1", true);
  assert.equal(ret.searchParams.get("authorized") !== "1", false);
});

// ---- 3: route reuse / Cuelinks call behaviour ------------------------------

const stay = { destination: "Dubai", checkIn: "2026-11-02", checkOut: "2026-11-06", rooms: 1, adults: 2, children: 0 };
const input = (slug = "fixture-merchant", tripId = "trip-1", s = stay): HotelDecisionInput => ({
  tripId,
  propertyId: "prop-1",
  propertyName: "Test Property",
  stay: s,
  evidence: { sellerSlug: slug, sellerName: slug, totalPrice: 100, currency: "AED", verdictId: "v", rateId: "r" },
});
// FIXTURE builder only (not a production deeplink).
const builder: HotelRouteBuilder = (c: HotelRouteContext) => ({
  url: `https://fixture.example/p/${c.propertyId}?in=${c.stay.checkIn}&out=${c.stay.checkOut}`,
  expectedCampaignId: 5,
});
const BUILDERS = { "fixture-merchant": builder };

function counting(affiliated = true) {
  const calls: string[] = [];
  const convert = async (url: string): Promise<CuelinksConversionResult> => {
    calls.push(url);
    return { originalUrl: url, trackingUrl: `https://track.example/?u=${encodeURIComponent(url)}`, affiliated, campaignId: 5, campaignName: "c" };
  };
  return { calls, convert };
}

async function setup(store = new MemoryPlatformStore()) {
  const m = await ensureMerchant(store, { slug: "fixture-merchant", name: "Fixture Merchant" });
  const cl = await ensureAccessRoute(store, { slug: "cuelinks", name: "Cuelinks", kind: "affiliate_network" });
  await linkMerchantToAccessRoute(store, { merchantId: m.id, accessRouteId: cl.id, status: "approved" });
  await recordHotelDecision(store, input());
  return { store, merchant: m, cuelinks: cl };
}

test("reuse: an eligible route resolved for the decision is reused by Confirm reloads and by Check IQ return - one conversion, one row", async () => {
  const { store } = await setup();
  const c = counting();
  const opts = { builders: BUILDERS, convert: c.convert };

  const first = await resolveHotelActionForTrip(store, "trip-1", opts); // Confirm
  const second = await resolveHotelActionForTrip(store, "trip-1", opts); // Confirm reload
  const ctx: HotelRouteContext = { merchantSlug: "fixture-merchant", merchantName: "Fixture Merchant", propertyId: "prop-1", stay };
  const atCheckIq = await previewHotelCtaForTrip(store, "trip-1", ctx, opts); // return to Check IQ, same decision

  assert.equal(c.calls.length, 1);
  assert.equal(store.routes.length, 1);
  assert.equal(first!.cta.enabled, true);
  assert.deepEqual(second!.cta, first!.cta);
  assert.deepEqual(atCheckIq, first!.cta); // same policy, same result
  assert.equal(second!.route.id, first!.route.id);
});

test("reuse is refused when the decision or its context changed", async () => {
  const { store } = await setup();
  const c = counting();
  const opts = { builders: BUILDERS, convert: c.convert };
  await resolveHotelActionForTrip(store, "trip-1", opts);
  assert.equal(c.calls.length, 1);

  // a stay change (re-selection) -> new selection time -> old route not reused
  await new Promise((r) => setTimeout(r, 3));
  await recordHotelDecision(store, input("fixture-merchant", "trip-1", { ...stay, checkIn: "2026-11-03" }));
  const a = await resolveHotelActionForTrip(store, "trip-1", opts);
  assert.equal(c.calls.length, 2);
  assert.match(decodeURIComponent(a!.cta.url!), /in=2026-11-03/);

  // a different seller selected -> resolved afresh
  await new Promise((r) => setTimeout(r, 3));
  await recordHotelDecision(store, input("other-seller", "trip-1", { ...stay, checkIn: "2026-11-03" }));
  const b = await resolveHotelActionForTrip(store, "trip-1", opts);
  assert.equal(b!.cta.enabled, false); // no builder/route for this seller
  assert.equal(c.calls.length, 2);

  // Check IQ preview for a DIFFERENT stay than the decision does not borrow the decision's route
  await new Promise((r) => setTimeout(r, 3));
  await recordHotelDecision(store, input("fixture-merchant", "trip-1", { ...stay, checkIn: "2026-11-03" }));
  await resolveHotelActionForTrip(store, "trip-1", opts);
  const before = c.calls.length;
  const otherStay: HotelRouteContext = { merchantSlug: "fixture-merchant", merchantName: "Fixture Merchant", propertyId: "prop-1", stay: { ...stay, checkIn: "2026-12-01" } };
  const p = await previewHotelCtaForTrip(store, "trip-1", otherStay, opts);
  assert.equal(c.calls.length, before + 1); // resolved on its own, not reused
  assert.match(decodeURIComponent(p.url!), /in=2026-12-01/);
});

test("reuse is refused when the merchant's approved access route is revoked", async () => {
  const { store, merchant, cuelinks } = await setup();
  const c = counting();
  const opts = { builders: BUILDERS, convert: c.convert };
  assert.equal((await resolveHotelActionForTrip(store, "trip-1", opts))!.cta.enabled, true);

  const link = store.links.find((l) => l.merchantId === merchant.id && l.accessRouteId === cuelinks.id)!;
  link.status = "inactive";
  const after = await resolveHotelActionForTrip(store, "trip-1", opts);
  assert.equal(after!.cta.enabled, false);
  assert.equal(after!.route.routeType, "inquiry_only");
});

test("non-bookable outcomes are re-evaluated (retried) but never append duplicate rows", async () => {
  const { store } = await setup();
  const c = counting(false); // affiliated:false -> ineligible
  const opts = { builders: BUILDERS, convert: c.convert };
  for (let i = 0; i < 3; i++) {
    const a = await resolveHotelActionForTrip(store, "trip-1", opts);
    assert.equal(a!.cta.enabled, false);
  }
  assert.equal(c.calls.length, 3); // ineligible is retried, not reused
  assert.equal(store.routes.length, 1); // but a single identical row is kept

  // no builder in production: same idempotence, no conversion at all
  const s2 = await setup();
  const c2 = counting();
  await resolveHotelActionForTrip(s2.store, "trip-1", { convert: c2.convert });
  await resolveHotelActionForTrip(s2.store, "trip-1", { convert: c2.convert });
  assert.equal(c2.calls.length, 0);
  assert.equal(s2.store.routes.length, 1);
});

// ---- Anantara blocked state -------------------------------------------------

test("Anantara: production builder remains BLOCKED - no builder, no URL guess, no catalogue mapping, no name matching", () => {
  assert.deepEqual(Object.keys(HOTEL_ROUTE_BUILDERS), []);
  for (const f of readdirSync(join(SRC, "lib/hotel")).filter((n) => !n.endsWith(".test.ts"))) {
    assert.ok(!/anantara/i.test(code(`lib/hotel/${f}`)), `${f} must not reference Anantara until the proven destination is recovered`);
  }
  assert.ok(!/anantara/i.test(code("db/seed.ts")), "no seeded Anantara hotel");
});
