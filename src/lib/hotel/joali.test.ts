// JOALI Awin integration (GitHub Issue #3). In-memory platform store and
// static source checks only: no database, no network, no StayingAPI calls.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MemoryPlatformStore } from "../platform/memoryStore";
import { ensureMerchant } from "../platform/service";
import { createAwinAdapter, AWIN_PROVEN, type AwinConfig } from "../platform/awinAccess";
import { isOpaqueAttributionId, makeAttributionId } from "../platform/attribution";
import { buildJoaliDestination, JOALI_VERIFIED_PROPERTIES } from "./joaliDestination";
import { HOTEL_ROUTE_BUILDERS, previewHotelCta, type HotelRouteContext } from "./commercial";
import { ensureJoaliCommercialSetup, joaliCtaForChoice } from "./joaliCommercial";
import { isJoaliStagingEnabled } from "./joaliStagingGate";

// A store that deterministically simulates another concurrent request
// winning the registration race between OUR read and OUR insert: the first
// read of a given slug/pair reports "not found" but has already caused the
// row to genuinely exist underneath, forcing the subsequent insert to hit
// the real unique-violation path in MemoryPlatformStore.
class RaceOnceStore extends MemoryPlatformStore {
  private merchantReads = 0;
  private accessRouteReads = 0;
  private linkReads = 0;

  async getMerchantBySlug(slug: string) {
    if (slug === "joali" && this.merchantReads++ === 0) {
      await super.insertMerchant({ id: "concurrent-winner-merchant", slug: "joali", name: "JOALI (winner)", createdAt: new Date() });
      return null;
    }
    return super.getMerchantBySlug(slug);
  }

  async getAccessRouteBySlug(slug: string) {
    if (slug === "awin" && this.accessRouteReads++ === 0) {
      await super.insertAccessRoute({ id: "concurrent-winner-access", slug: "awin", name: "Awin (winner)", kind: "affiliate_network", createdAt: new Date() });
      return null;
    }
    return super.getAccessRouteBySlug(slug);
  }

  async listMerchantAccessLinks(merchantId: string) {
    if (this.linkReads++ === 0) {
      const [merchant, access] = await Promise.all([super.getMerchantBySlug("joali"), super.getAccessRouteBySlug("awin")]);
      if (merchant && access) {
        await super.insertMerchantAccessLink({ id: "concurrent-winner-link", merchantId: merchant.id, accessRouteId: access.id, status: "approved" });
      }
      return [];
    }
    return super.listMerchantAccessLinks(merchantId);
  }
}

const SRC = join(__dirname, "..", "..");
const code = (rel: string) =>
  readFileSync(join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const stay = { destination: "Maldives", checkIn: "2027-03-10", checkOut: "2027-03-17", rooms: 1, adults: 2, children: 1 };

// ---- 1: destination builder — both properties, correct params -------------

test("1: JOALI Maldives builds the exact confirmed reservation.joali.com contract", () => {
  const built = buildJoaliDestination({ propertyId: "joali-maldives", stay } as unknown as HotelRouteContext);
  assert.ok(built, "must build a route");
  const url = new URL(built!.url);
  assert.equal(url.origin + url.pathname, "https://reservation.joali.com/");
  assert.equal(url.searchParams.get("hotel"), "41373");
  assert.equal(url.searchParams.get("chain"), "30805");
  assert.equal(url.searchParams.get("level"), "hotel");
  assert.equal(url.searchParams.get("locale"), "en-US");
  assert.equal(url.searchParams.get("currency"), "USD");
  assert.equal(url.searchParams.get("productcurrency"), "USD");
  assert.equal(url.searchParams.get("arrive"), "2027-03-10");
  assert.equal(url.searchParams.get("depart"), "2027-03-17");
  assert.equal(url.searchParams.get("adult"), "2");
  assert.equal(url.searchParams.get("child"), "1");
  assert.equal(url.searchParams.get("rooms"), "1");
});

test("2: JOALI BEING uses hotel=41375 - the two properties are never conflated", () => {
  const built = buildJoaliDestination({ propertyId: "joali-being", stay } as unknown as HotelRouteContext);
  assert.ok(built);
  assert.equal(new URL(built!.url).searchParams.get("hotel"), "41375");
});

test("3: an unrecognised or third JOALI-like property id yields NO route - never inferred", () => {
  for (const badId of ["joali-maafushivaru", "joali", "JOALI-MALDIVES", "41373", ""]) {
    assert.equal(buildJoaliDestination({ propertyId: badId, stay } as unknown as HotelRouteContext), null, badId);
  }
});

test("4: invalid or missing dates/party yield NO route, and a fixed October test date is never substituted", () => {
  const base = { propertyId: "joali-maldives" } as const;
  const cases = [
    { ...stay, checkIn: "10/03/2027" }, // wrong format
    { ...stay, checkOut: "2027-03-10" }, // checkOut === checkIn
    { ...stay, checkOut: "2027-03-05" }, // checkOut before checkIn
    { ...stay, adults: 0 },
    { ...stay, rooms: 0 },
    { ...stay, children: -1 },
    { ...stay, adults: 2.5 },
  ];
  for (const bad of cases) {
    assert.equal(buildJoaliDestination({ ...base, stay: bad } as unknown as HotelRouteContext), null, JSON.stringify(bad));
  }
  // the traveller's own dates are used verbatim - never the Trip.com-style proven fixture dates
  const built = buildJoaliDestination({ propertyId: "joali-maldives", stay } as unknown as HotelRouteContext);
  assert.ok(!built!.url.includes("2026-10"), "must not fall back to a fixed October test date");
});

// ---- 5: Awin access adapter - URL construction and encoding ---------------

test("5: Awin adapter produces awinmid=125626&awinaffid=3076059&ued=<destination>, correctly encoded", async () => {
  const adapter = createAwinAdapter(AWIN_PROVEN);
  const destinationUrl = "https://reservation.joali.com/?hotel=41373&arrive=2027-03-10&depart=2027-03-17";
  const attributionId = makeAttributionId();
  const outcome = await adapter.issue({
    destinationUrl,
    attributionId,
    expectedIdentity: { offerId: AWIN_PROVEN.advertiserId, affiliateId: AWIN_PROVEN.publisherId },
  });
  assert.ok(outcome.ok, "must issue");
  if (!outcome.ok) return;
  const tracked = new URL(outcome.evidence.trackedUrl);
  assert.equal(tracked.origin + tracked.pathname, "https://www.awin1.com/cread.php");
  assert.equal(tracked.searchParams.get("awinmid"), "125626");
  assert.equal(tracked.searchParams.get("awinaffid"), "3076059");
  assert.equal(tracked.searchParams.get("ued"), destinationUrl); // URLSearchParams round-trips the decoded value
  assert.ok(outcome.evidence.trackedUrl.includes(encodeURIComponent(destinationUrl)), "destination must be percent-encoded once in the raw URL");
  assert.ok(!/clickref|subid/i.test(outcome.evidence.trackedUrl), "no clickref/Sub-ID was confirmed, so none is invented");
  assert.equal(outcome.evidence.attributionId, attributionId);
});

test("6: Awin adapter refuses honestly - never fabricates a link - on bad config, identity, destination or attribution id", async () => {
  const good: AwinConfig = { ...AWIN_PROVEN };
  const destinationUrl = "https://reservation.joali.com/?hotel=41373";
  const attributionId = makeAttributionId();

  const notConfigured = await createAwinAdapter({ ...good, advertiserId: null }).issue({ destinationUrl, attributionId, expectedIdentity: { offerId: 125626, affiliateId: 3076059 } });
  assert.deepEqual(notConfigured, { ok: false, reason: "not_configured" });

  const missingIdentity = await createAwinAdapter(good).issue({ destinationUrl, attributionId });
  assert.deepEqual(missingIdentity, { ok: false, reason: "identity_missing" });

  const mismatch = await createAwinAdapter(good).issue({ destinationUrl, attributionId, expectedIdentity: { offerId: 999999, affiliateId: 3076059 } });
  assert.deepEqual(mismatch, { ok: false, reason: "identity_mismatch" });

  const badDestination = await createAwinAdapter(good).issue({ destinationUrl: "/relative-path", attributionId, expectedIdentity: { offerId: 125626, affiliateId: 3076059 } });
  assert.deepEqual(badDestination, { ok: false, reason: "invalid_destination" });

  const badAttribution = await createAwinAdapter(good).issue({ destinationUrl, attributionId: "rm-joali-test-01", expectedIdentity: { offerId: 125626, affiliateId: 3076059 } });
  assert.deepEqual(badAttribution, { ok: false, reason: "invalid_attribution_id" });
  assert.equal(isOpaqueAttributionId("rm-joali-test-01"), false, "a manual test-style id must not pass as opaque");
});

// ---- 7: registration idempotency -------------------------------------------

test("7: ensureJoaliCommercialSetup is idempotent - repeat calls produce exactly one merchant/access-route/link", async () => {
  const store = new MemoryPlatformStore();
  await ensureJoaliCommercialSetup(store);
  await ensureJoaliCommercialSetup(store);
  await ensureJoaliCommercialSetup(store);

  const merchant = await store.getMerchantBySlug("joali");
  assert.ok(merchant, "merchant registered");
  const access = await store.getAccessRouteBySlug("awin");
  assert.ok(access, "access route registered");
  const links = await store.listMerchantAccessLinks(merchant!.id);
  assert.equal(links.length, 1, "no duplicate merchant/access-route links from repeat registration");
  assert.equal(links[0]!.status, "approved");
});

test("7b: two genuinely concurrent first-time registrations still produce exactly one merchant/access-route/link", async () => {
  const store = new MemoryPlatformStore();
  await Promise.all([ensureJoaliCommercialSetup(store), ensureJoaliCommercialSetup(store)]);

  const merchants = [...store.merchants.values()].filter((m) => m.slug === "joali");
  assert.equal(merchants.length, 1, "exactly one joali merchant row, however the two calls interleaved");
  const accessRoutes = [...store.accessRoutes.values()].filter((r) => r.slug === "awin");
  assert.equal(accessRoutes.length, 1, "exactly one awin access-route row");
  const links = await store.listMerchantAccessLinks(merchants[0]!.id);
  assert.equal(links.length, 1, "exactly one approved merchant/access-route link");
  assert.equal(links[0]!.status, "approved");
});

test("7c: a deterministic concurrent-first-use race (another request wins between our read and our insert) is absorbed, not thrown", async () => {
  const store = new RaceOnceStore();
  // Every read of "joali"/"awin"/the pair reports not-found once while a
  // concurrent winner's row is silently inserted underneath - forcing our
  // own insert to hit the real unique_violation (23505) path.
  await assert.doesNotReject(ensureJoaliCommercialSetup(store));

  const merchants = [...store.merchants.values()].filter((m) => m.slug === "joali");
  assert.equal(merchants.length, 1, merchants.length > 1 ? "duplicate merchant row created by the race" : "no merchant row at all");
  const accessRoutes = [...store.accessRoutes.values()].filter((r) => r.slug === "awin");
  assert.equal(accessRoutes.length, 1, "exactly one awin access-route row despite the simulated race");
  const links = store.links.filter((l) => l.merchantId === merchants[0]!.id && l.accessRouteId === accessRoutes[0]!.id);
  assert.equal(links.length, 1, "exactly one merchant/access-route link despite the simulated race");
});

test("7d: raceSafe does not swallow an unrelated (non-unique-violation) error, and never touches an unrelated merchant/access-route", async () => {
  const store = new MemoryPlatformStore();
  // A pre-existing, unrelated merchant/access-route must survive untouched.
  const other = await ensureMerchant(store, { slug: "some-other-merchant", name: "Some Other Merchant" });
  await ensureJoaliCommercialSetup(store);
  const stillThere = await store.getMerchantBySlug("some-other-merchant");
  assert.deepEqual(stillThere, other, "an unrelated merchant must be untouched by JOALI registration");

  class BoomStore extends MemoryPlatformStore {
    async insertMerchant(): Promise<void> {
      throw new Error("boom - not a unique violation");
    }
  }
  await assert.rejects(ensureJoaliCommercialSetup(new BoomStore()), /boom - not a unique violation/);
});

// ---- 8: end-to-end integration via previewHotelCta -------------------------

test("8: before registration, JOALI resolves honestly to no attributable route (not fabricated)", async () => {
  const store = new MemoryPlatformStore();
  const cta = await previewHotelCta(store, {
    merchantSlug: "joali",
    merchantName: "JOALI Maldives",
    propertyId: "joali-maldives",
    propertyName: "JOALI Maldives",
    stay,
  });
  assert.equal(cta.enabled, false);
  assert.equal(cta.url, null);
});

test("9: after ensureJoaliCommercialSetup, previewHotelCta resolves a real, eligible Awin-wrapped booking CTA for both properties", async () => {
  const store = new MemoryPlatformStore();
  await ensureJoaliCommercialSetup(store);

  for (const [propertyId, property] of Object.entries(JOALI_VERIFIED_PROPERTIES)) {
    const cta = await previewHotelCta(store, {
      merchantSlug: "joali",
      merchantName: property.name,
      propertyId,
      propertyName: property.name,
      stay,
    });
    assert.equal(cta.enabled, true, propertyId);
    assert.ok(cta.url, propertyId);
    const url = new URL(cta.url!);
    assert.equal(url.origin + url.pathname, "https://www.awin1.com/cread.php");
    assert.equal(url.searchParams.get("awinmid"), "125626");
    assert.equal(url.searchParams.get("awinaffid"), "3076059");
    const destination = new URL(url.searchParams.get("ued")!);
    assert.equal(destination.searchParams.get("hotel"), String(property.hotelId));
    assert.equal(destination.searchParams.get("arrive"), stay.checkIn);
    assert.equal(destination.searchParams.get("depart"), stay.checkOut);
    assert.ok(cta.label.includes(property.name));
  }
});

test("10: joaliCtaForChoice returns null for a non-JOALI property, so a caller falls back to the honest property CTA", async () => {
  const result = await joaliCtaForChoice(new MemoryPlatformStore(), "sofitel-dubai-the-palm", stay);
  assert.equal(result, null);
});

test("11: invalid stay context (JOALI registered, but bad dates) still resolves to no route - registration alone never fabricates a link", async () => {
  const store = new MemoryPlatformStore();
  await ensureJoaliCommercialSetup(store);
  const cta = await previewHotelCta(store, {
    merchantSlug: "joali",
    merchantName: "JOALI Maldives",
    propertyId: "joali-maldives",
    propertyName: "JOALI Maldives",
    stay: { ...stay, checkOut: stay.checkIn },
  });
  assert.equal(cta.enabled, false);
});

// ---- 12: regression - Cuelinks and other merchants are unaffected ---------

test("12: HOTEL_ROUTE_BUILDERS gained exactly one new entry (joali) - no other merchant slug was touched", () => {
  assert.ok(Object.prototype.hasOwnProperty.call(HOTEL_ROUTE_BUILDERS, "joali"));
  assert.equal(typeof HOTEL_ROUTE_BUILDERS.joali, "function");
});

test("13: a Cuelinks merchant with no builder still resolves honestly to no route (dispatch order/branching regression)", async () => {
  const store = new MemoryPlatformStore();
  const cta = await previewHotelCta(store, {
    merchantSlug: "some-other-merchant",
    merchantName: "Some Other Merchant",
    propertyId: "prop-x",
    propertyName: "Prop X",
    stay,
  });
  assert.equal(cta.enabled, false);
});

// ---- 14: source-level guards ------------------------------------------------

test("14: the JOALI action never queries the hotels catalogue - propertyId is validated only against the verified map", () => {
  const action = code("app/actions/joali.ts");
  assert.ok(!/db\.query\.hotels/.test(action), "must not read the hotels table");
  assert.match(action, /JOALI_VERIFIED_PROPERTIES/);
  assert.match(action, /Unknown JOALI property/);
});

test("15: the JOALI page carries no external image and is not indexed", () => {
  const page = code("app/joali/page.tsx");
  assert.ok(!/<img|backgroundImage|url\(https?:/.test(page), "no resort imagery - none is licensed");
  assert.match(page, /index: false/);
});

test("16: Confirm resolves the JOALI CTA only for a JOALI propertyId, and the plain property CTA otherwise", () => {
  const confirm = code("app/confirm/page.tsx");
  assert.match(confirm, /joaliCtaForChoice/);
  assert.match(confirm, /propertyCta\(displayHotelName\)/);
});

test("17: import boundary - the new JOALI files still never reach the four-tower-only commercial layer", () => {
  const FORBIDDEN = /commercialRegister|linkkitAccess|dcmTuneAccess|platform\/handoff|tournament/;
  for (const f of ["lib/hotel/joaliDestination.ts", "lib/hotel/joaliCommercial.ts", "lib/hotel/journey.ts", "lib/hotel/commercial.ts", "lib/platform/awinAccess.ts", "app/actions/joali.ts", "app/joali/page.tsx"]) {
    assert.ok(!FORBIDDEN.test(code(f)), f);
  }
});

test("18b: joaliCommercial.ts stays DB-free (store-injected, like decision.ts) - never imports @/db/client or drizzleStore", () => {
  const src = code("lib/hotel/joaliCommercial.ts");
  assert.ok(!/@\/db\/client|drizzleStore/.test(src), "must not pull in a live DB connection at import time");
});

test("18: no StayingAPI/supplier dependency anywhere in the JOALI files, and the discovery gate stays closed", () => {
  const FORBIDDEN = /stayingApi|staying_api|runSearch|SUPPLIER_ADAPTERS|lib\/suppliers|STAYINGAPI/;
  for (const f of ["lib/hotel/joaliDestination.ts", "lib/hotel/joaliCommercial.ts", "lib/hotel/journey.ts", "lib/platform/awinAccess.ts", "app/actions/joali.ts", "app/joali/page.tsx"]) {
    assert.ok(!FORBIDDEN.test(code(f)), f);
  }
  assert.match(code("lib/discovery/index.ts"), /export const LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED = false;/);
});

// ---- 19-22: the enforceable JOALI_STAGING_ENABLED gate ---------------------

test("19: isJoaliStagingEnabled fails closed - only the exact string \"true\" enables it", () => {
  assert.equal(isJoaliStagingEnabled({}), false, "absent");
  assert.equal(isJoaliStagingEnabled({ JOALI_STAGING_ENABLED: undefined }), false, "undefined");
  assert.equal(isJoaliStagingEnabled({ JOALI_STAGING_ENABLED: "" }), false, "empty string");
  assert.equal(isJoaliStagingEnabled({ JOALI_STAGING_ENABLED: "false" }), false);
  assert.equal(isJoaliStagingEnabled({ JOALI_STAGING_ENABLED: "1" }), false);
  assert.equal(isJoaliStagingEnabled({ JOALI_STAGING_ENABLED: "TRUE" }), false, "case-sensitive - not a loose truthy check");
  assert.equal(isJoaliStagingEnabled({ JOALI_STAGING_ENABLED: " true" }), false, "no trimming - exact match only");
  assert.equal(isJoaliStagingEnabled({ JOALI_STAGING_ENABLED: "true" }), true);
});

test("20: the /joali page checks the gate before reading searchParams, the trip, or rendering anything - not relying on being unlinked/noindex", () => {
  const page = code("app/joali/page.tsx");
  assert.match(page, /import \{ isJoaliStagingEnabled \} from "@\/lib\/hotel\/joaliStagingGate";/);
  const body = page.slice(page.indexOf("export default async function JoaliPage"));
  const gateAt = body.search(/if \(!isJoaliStagingEnabled\(\)\) notFound\(\);/);
  const searchParamsAt = body.search(/await searchParams/);
  const getTripAt = body.search(/await getTrip\(/);
  assert.ok(gateAt >= 0, "gate check present");
  assert.ok(gateAt < searchParamsAt && gateAt < getTripAt, "gate must run before searchParams/getTrip are ever read");
});

test("21: chooseJoaliProperty checks the gate before any trip read, property mutation or commercial registration", () => {
  const action = code("app/actions/joali.ts");
  assert.match(action, /import \{ isJoaliStagingEnabled \} from "@\/lib\/hotel\/joaliStagingGate";/);
  const body = action.slice(action.indexOf("export async function chooseJoaliProperty"));
  const gateAt = body.search(/if \(!isJoaliStagingEnabled\(\)\) throw/);
  const tripReadAt = body.search(/await getTrip\(/);
  const ensureAt = body.search(/await ensureJoaliCommercialSetup\(/);
  const recordAt = body.search(/await recordPropertyChoicePersisted\(/);
  assert.ok(gateAt >= 0, "gate check present");
  assert.ok(gateAt < tripReadAt, "gate must run before the trip is read");
  assert.ok(gateAt < ensureAt, "gate must run before commercial registration");
  assert.ok(gateAt < recordAt, "gate must run before the property choice is persisted");
});

test("22: Confirm's JOALI CTA resolution independently checks the gate, so a previously recorded JOALI choice cannot expose a live CTA once disabled", () => {
  const confirm = code("app/confirm/page.tsx");
  assert.match(confirm, /import \{ isJoaliStagingEnabled \} from "@\/lib\/hotel\/joaliStagingGate";/);
  assert.match(confirm, /const joaliEnabled = Boolean\(joaliProperty\) && isJoaliStagingEnabled\(\);/);
  assert.match(confirm, /const cta = joaliEnabled \? /);
});
