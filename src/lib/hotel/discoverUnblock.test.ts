// Discover unblock: property discovery from the factual catalogue, with no
// price, availability, seller or StayingAPI content. Static source checks (the
// runtime walk exercises the same paths against a real database).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "..");
const code = (rel: string) =>
  readFileSync(join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

// Anything that would read as a price, saving, seller, rate plan, condition or availability claim.
const CLAIMS =
  /\bAED\b|\bUSD\b|\$\s?\d|totalPrice|nightlyPrice|cheapest|saving|per night|crossed|breakfast|cancell|payment|taxes|verdict|seller|supplier|rooms? left|rooms? available|available (hotels?|rooms?|now|tonight)|live availability|live rates?|bookable|in stock|sold out/i;

const shortlistSection = () => {
  const page = code("app/page.tsx");
  const start = page.indexOf('id="shortlist"');
  assert.ok(start > 0, "shortlist section present");
  return page.slice(start, page.indexOf("</section>", start));
};

test("1: a catalogued destination returns property candidates: page resolves the trip's city against the catalogue and searches it", () => {
  const page = code("app/page.tsx");
  assert.match(page, /db\.select\(\{ city: schema\.hotels\.city \}\)\.from\(schema\.hotels\)/);
  assert.match(page, /cities\.find\(\(c\) => normalise\(c\) === normalise\(trip\.destination\)\)/);
  assert.match(page, /activeDiscoverySource\.search\(\{ destination: tripCity \}\)/);
  assert.match(page, /trip && tripCity && shortlistHotels\.length > 0/); // only for a real trip + catalogued destination
  // the form is given the real city list (suggestions/exact match) and does not show "curating" for a supported city
  assert.match(page, /cities=\{cities\}/);
  assert.match(page, /destinationSupported=\{Boolean\(tripCity\)\}/);
  assert.match(code("components/DiscoverForm.tsx"), /useState\(Boolean\(defaultDestination\) && !destinationSupported\)/);
  // the catalogue source only reads the hotels table by city
  assert.match(code("lib/discovery/curatedCatalogSource.ts"), /eq\(schema\.hotels\.city, destination\)/);
});

test("2+3+4: hotel cards carry factual property identity only - no price, availability, seller, rate plan or verdict", () => {
  const grid = code("components/HotelSelectionGrid.tsx");
  assert.ok(!CLAIMS.test(grid), "grid must contain no price/availability/seller claim");
  // what a card does render
  for (const field of ["hotel.name", "hotel.area", "hotel.starRating", "hotel.imageUrl"]) assert.ok(grid.includes(field), `${field} rendered`);
  // the discovered-hotel contract has no commercial fields at all
  const types = code("lib/discovery/types.ts");
  assert.ok(!/price|rate|total|cheapest|seller|supplier|availab/i.test(types));
  // the shortlist section copy claims nothing about rates or availability and says so
  const section = shortlistSection().replace("Rates and availability aren&apos;t shown here.", "");
  assert.ok(!CLAIMS.test(section), "shortlist section copy makes no price/availability claim");
  assert.match(shortlistSection(), /Rates and availability aren&apos;t shown here\./);
  assert.match(shortlistSection(), /property catalogue — factual property details only/);
});

test("5: Discover adds no StayingAPI / runSearch / supplier / cache / refresh / polling dependency", () => {
  for (const f of ["app/page.tsx", "components/DiscoverForm.tsx", "components/HotelSelectionGrid.tsx", "lib/discovery/index.ts", "lib/discovery/curatedCatalogSource.ts", "app/compare/page.tsx"]) {
    assert.ok(!/stayingApi|staying_api|runSearch|ensureLiveCheckTriggered|pollLiveCheck|SUPPLIER_ADAPTERS|lib\/suppliers|lib\/search|lib\/browse|STAYINGAPI/.test(code(f)), `${f} reaches StayingAPI/supplier code`);
  }
});

test("6: the shortlist keeps its maximum of five and never silently replaces a selection", () => {
  const grid = code("components/HotelSelectionGrid.tsx");
  assert.match(grid, /const MAX_SELECTION = 5;/);
  assert.match(grid, /if \(current\.length >= MAX_SELECTION\) \{[\s\S]*?setLimitNotice\(true\);[\s\S]*?return current;/);
  assert.match(code("app/compare/page.tsx"), /MAX_COMPARE/);
  assert.match(code("app/compare/page.tsx"), /\.slice\(0, MAX_COMPARE\)/);
});

test("7+8: selected hotel ids and the trip's dates/party reach Compare", () => {
  const grid = code("components/HotelSelectionGrid.tsx");
  assert.match(grid, /`\/compare\?hotels=\$\{selected\.join\(","\)\}`/);
  assert.match(grid, /`&checkin=\$\{checkIn\}&checkout=\$\{checkOut\}`/);
  assert.match(grid, /tripId \? `&trip=\$\{tripId\}` : ""/);
  // the homepage passes the TRIP's own dates and id (nothing re-entered)
  const page = code("app/page.tsx");
  assert.match(page, /const checkIn = trip \? trip\.checkIn : defaultCheckIn\(\);/);
  assert.match(page, /<HotelSelectionGrid hotels=\{shortlistHotels\} checkIn=\{checkIn\} checkOut=\{checkOut\} tripId=\{trip\.id\} \/>/);
  // createTrip records destination/dates/rooms/adults/children (via the
  // shared V2A validation contract - src/lib/tripIntent.ts, see
  // tripIntent.test.ts and createTrip.test.ts) and returns to the shortlist
  const actions = code("app/actions/trip.ts");
  for (const f of ["destination: core.value.destination", "checkIn: new Date(core.value.checkIn)", "checkOut: new Date(core.value.checkOut)", "adults: core.value.adults", "children: core.value.children", "rooms: core.value.rooms"]) {
    assert.ok(actions.includes(f), `createTrip stores ${f}`);
  }
  assert.match(actions, /parseTripCoreFields\(/);
  // GitHub Issue #3 follow-up (2026-09-23): createTrip's redirect now uses
  // the id from its shared createTripFromFormData helper's return value.
  assert.match(actions, /redirect\(`\/\?trip=\$\{result\.trip\.id\}#shortlist`\)/);
  // Compare reads the ids list; Check IQ reads party/rooms from the trip
  assert.match(code("app/compare/page.tsx"), /\(params\.hotels \?\? ""\)\.split\(","\)/);
  const checkIq = code("app/check-iq/page.tsx");
  for (const f of ["trip?.adults", "trip?.children", "trip?.rooms"]) assert.ok(checkIq.includes(f), `${f} read from the trip`);
});

test("9+10: Compare stays factual and price-free, labels the catalogue neutrally, and links to the authorized Check IQ", () => {
  const compare = code("app/compare/page.tsx");
  assert.ok(!CLAIMS.test(compare.replace("no prices, availability or rate claims", "").replace("isn&apos;t showing rates or availability", "")), "Compare makes no price/availability claim");
  assert.match(compare, /Rate Manifest property catalogue/);
  assert.ok(!/curated catalog|live verification|Analyse with/.test(compare));
  assert.match(compare, /no prices, availability or rate claims here/);
  assert.match(compare, /href=\{`\/check-iq\?hotel=\$\{hotel\.id\}&checkin=\$\{checkIn\}&checkout=\$\{checkOut\}\$\{tripQuery\}&authorized=1`\}/);
});

test("stale copy: Complete Your Trip no longer says Rate Manifest compares hotel rates; the footer no longer implies rates are shown", () => {
  const klook = code("components/KlookTripSection.tsx");
  assert.ok(!/only compares hotel rates/i.test(klook));
  assert.match(klook, /For everything else around your trip, Klook covers/);
  const footer = code("components/Footer.tsx");
  assert.ok(!/affect the rates shown|rates shown/i.test(footer));
  assert.match(footer, /may earn a referral fee/);
  assert.match(footer, /influence which properties or information Rate Manifest shows you/);
});

// ---- V2A hotel-card visual refinement -------------------------------------
// The grid still renders exactly the same facts (no price/availability/
// seller claim - CLAIMS above already guards that), the shortlist cap and
// Compare behaviour are untouched, and a missing image still degrades to an
// honest, non-photographic fallback - only its presentation changed.

test("V2A refinement: the shortlist grid is three-per-row on desktop, two on tablet, one on mobile", () => {
  const css = code("app/globals.css");
  const gridBlock = css.slice(css.indexOf(".home-hotel-grid {"), css.indexOf("Selected state overrides"));
  assert.match(gridBlock, /\.home-hotel-grid \{\s*grid-template-columns: repeat\(3, 1fr\);/); // desktop
  assert.match(gridBlock, /@media \(max-width: 1000px\) \{[\s\S]*?grid-template-columns: repeat\(2, 1fr\);/); // tablet
  assert.match(gridBlock, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-columns: 1fr;/); // mobile
});

test("V2A refinement: the card is a dark surface (not the white base .hotel-card), not just a colour tweak on hover", () => {
  const css = code("app/globals.css");
  assert.match(css, /\.home-hotel-card \{[\s\S]*?background: rgba\(255, 255, 255, 0\.04\);/);
  assert.match(css, /\.home-hotel-card \{[\s\S]*?border-color: rgba\(255, 255, 255, 0\.1\);/);
  // hotel name/meta text get explicit light colours - the base .hotel-card
  // rules (near-black text) would be unreadable on the new dark surface
  assert.match(css, /\.home-hotel-card \.hotel-card-name \{[\s\S]*?color: #ffffff;/);
  assert.match(css, /\.home-hotel-card \.hotel-card-meta \{\s*color: rgba\(255, 255, 255, 0\.5\);/);
});

test("V2A refinement: the image area is a prominent 16:10 box, and a missing image never falls back to another hotel's or destination's photo", () => {
  const css = code("app/globals.css");
  assert.match(css, /\.home-hotel-card-image \{[\s\S]*?aspect-ratio: 16 \/ 10;/);
  const grid = code("components/HotelSelectionGrid.tsx");
  assert.match(grid, /hotel\.imageUrl \?/); // a real image is still shown first, when present
  assert.match(grid, /<img className="home-hotel-card-img" src=\{hotel\.imageUrl\} alt=\{`\$\{hotel\.name\} property`\} \/>/);
  assert.ok(!/picsum|unsplash|placeholder\.com|placehold|stock/i.test(grid), "no external stock/placeholder photo service");
  // the fallback is decorative markup (SVG) plus honest text, not an <img> of any kind
  const fallback = grid.slice(grid.indexOf("home-hotel-card-image-unavailable"), grid.indexOf("Property image unavailable") + 40);
  assert.match(fallback, /<svg/);
  assert.ok(!/<img/.test(fallback));
});

test("V2A refinement: selected state is never colour-only - the persistent text hint changes too, and the shortlist cap/Compare flow is untouched", () => {
  const css = code("app/globals.css");
  assert.match(css, /\.home-hotel-card\.hotel-card-selected \{[\s\S]*?border-color: #d4a853;/);
  assert.match(css, /\.home-hotel-card\.hotel-card-selected \.home-hotel-card-shortlist-hint \{\s*color: #d4a853;/);
  const grid = code("components/HotelSelectionGrid.tsx");
  assert.match(grid, /const MAX_SELECTION = 5;/);
  assert.match(grid, /isSelected \? "✓ Shortlisted" : "Select to shortlist"/);
  assert.match(grid, /`\/compare\?hotels=\$\{selected\.join\(","\)\}`/);
});

test("V2A refinement: the card keeps its accessible toggle semantics and gets a visible keyboard focus ring", () => {
  const grid = code("components/HotelSelectionGrid.tsx");
  for (const f of ['role="button"', "tabIndex={0}", "aria-pressed={isSelected}", 'event.key === "Enter" || event.key === " "']) {
    assert.ok(grid.includes(f), `HotelSelectionGrid must keep ${f}`);
  }
  const css = code("app/globals.css");
  assert.match(css, /\.home-hotel-card:focus-visible \{\s*outline: 2px solid #d4a853;/);
});

// ---- V2A legacy hotel catalogue retirement (2026-09-22) -------------------
// The retired 37-hotel UAE catalogue must never be recreated by a fresh
// initialization, and the public homepage must never expose it merely
// because rows happen to exist in the `hotels` table - discovery being live
// is an explicit, code-level decision, not a side effect of table content.

test("retirement 1: initialization can never reseed the retired 37-hotel catalogue", () => {
  const route = code("app/api/admin/init-db/route.ts");
  // matches the real SQL statement shape (with its column list), not this
  // test file's or route.ts's own prose mentioning the phrase
  assert.ok(!/INSERT INTO hotels \(/.test(route), "init-db must not insert any hotel row");
  assert.ok(!/INSERT INTO rooms \(/.test(route), "init-db must not insert any room row for a retired hotel");
  assert.ok(!/UPDATE hotels SET featured_in_iq/.test(route), "init-db must not flag any retired hotel id as featured");
  // real table shape is untouched - a fresh environment still gets every
  // real table/column (including V2A's own preferences_json)
  assert.match(route, /CREATE TABLE IF NOT EXISTS hotels \(/);
  assert.match(route, /CREATE TABLE IF NOT EXISTS rooms \(/);
  assert.match(route, /ALTER TABLE trips ADD COLUMN IF NOT EXISTS preferences_json text;/);
  // suppliers (real Commercial Router config, unrelated to the retired
  // catalogue) are unaffected
  assert.match(route, /INSERT INTO suppliers \(/);
  assert.match(route, /VALUES\s*\('supplier-booking', 'booking', 'Booking\.com'/);
});

test("retirement 2: no cleanup DELETE was added to the initialization endpoint - that stays a separate, staging-only, explicitly-approved step", () => {
  const route = code("app/api/admin/init-db/route.ts");
  // the pre-existing, already-approved single/six-id DELETEs for hotels
  // retired *before* this task (ibis-deira-city-centre, the six fictional
  // demo hotels) are untouched precedent, not something this task added
  assert.match(route, /DELETE FROM hotels WHERE id = 'ibis-deira-city-centre';/);
  assert.match(route, /DELETE FROM hotels WHERE id = 'marina-skyline';/);
  // none of the 37 retired real-catalogue ids get a DELETE statement here
  for (const id of ["sofitel-dubai-the-palm", "atlantis-the-royal", "armani-hotel-dubai", "oberoi-beach-resort-al-zorah"]) {
    assert.ok(!route.includes(`DELETE FROM hotels WHERE id = '${id}'`), `${id} must not be deleted by init-db - cleanup is separate`);
  }
});

test("retirement 3: the homepage's public discovery gate is explicit - it does not derive from hotels-table row content", () => {
  const page = code("app/page.tsx");
  assert.match(page, /import \{ activeDiscoverySource, LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED \} from "@\/lib\/discovery";/);
  // the hotels table is not even queried while the gate is closed
  assert.match(page, /const catalogueCities = LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED\s*\n\s*\? await db\.select\(\{ city: schema\.hotels\.city \}\)\.from\(schema\.hotels\)\s*\n\s*: \[\];/);
  // tripCity can only ever resolve when the gate is open - never merely
  // because `cities`/`hotels` happens to contain a matching row
  assert.match(page, /const tripCity =\s*\n\s*LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED && trip\s*\n\s*\? cities\.find/);
  const discovery = code("lib/discovery/index.ts");
  assert.match(discovery, /export const LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED = false;/);
});

test("retirement 4: every destination - including Dubai - shows the curating gate and interest form while the discovery gate is closed", () => {
  const page = code("app/page.tsx");
  assert.match(page, /destinationSupported=\{Boolean\(tripCity\)\}/);
  // with LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED false, tripCity is always
  // undefined (see retirement 3), so destinationSupported is always false
  // for every destination string, including "Dubai" - DiscoverForm's own
  // `unsupported` initial state (Boolean(defaultDestination) && !destinationSupported)
  // is therefore true for any non-empty destination once a trip exists.
  const form = code("components/DiscoverForm.tsx");
  assert.match(form, /useState\(Boolean\(defaultDestination\) && !destinationSupported\)/);
  assert.match(form, /We&apos;re curating this destination\./);
  // the destination-interest form (name/email -> recordDestinationInterest) stays reachable
  assert.match(form, /import \{ recordDestinationInterest \} from "@\/app\/actions\/destinationInterest";/);
  assert.match(form, /const result = await recordDestinationInterest\(destInput, interestName, interestEmail\);/);
  assert.match(form, /id="interest-name"/);
  assert.match(form, /id="interest-email"/);
});

test("retirement 5: no StayingAPI discovery call is reachable while the catalogue is retired", () => {
  // same StayingAPI/supplier-adapter isolation guard as test 5 above,
  // re-affirmed for the files this task touched
  for (const f of ["app/page.tsx", "lib/discovery/index.ts", "lib/discovery/curatedCatalogSource.ts"]) {
    assert.ok(
      !/stayingApi|staying_api|runSearch|ensureLiveCheckTriggered|pollLiveCheck|SUPPLIER_ADAPTERS|lib\/suppliers|STAYINGAPI/.test(code(f)),
      `${f} reaches StayingAPI/supplier code`
    );
  }
  // runSearch() (the one function that ever calls a supplier adapter) still
  // requires a real, existing hotel row before it calls any adapter - with
  // the catalogue retired/empty, it returns null first
  const search = code("lib/search.ts");
  assert.match(search, /const hotel = await db\.query\.hotels\.findFirst\(\{ where: eq\(schema\.hotels\.id, hotelId\) \}\);/);
  assert.match(search, /if \(!hotel\) return null;/);
});
