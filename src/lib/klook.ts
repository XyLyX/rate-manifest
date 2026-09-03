// Klook is Layer 2 (Monetization) only - see DECISIONS.md, "Two-layer
// architecture, and the roadmap beyond Booking.com." It never enters the
// Layer 1 hotel comparison (still StayingAPI-verified sellers only), and
// this file should stay that way: nothing here is a SupplierAdapter, and
// nothing here should ever get imported by src/lib/search.ts or the scoring
// code.
//
// KLOOK_LINK is the main "Browse Klook" experiences CTA's link, generated
// via Travelpayouts' Links tool for Ratemanifest. Originally pointed at
// klook.com's bare homepage; updated 2026-09-01 to Klook's own Dubai
// search-results page (https://www.klook.com/search/result/?query=dubai&
// search_scope=main_search) instead - same purpose, a much more useful
// landing spot than the homepage. Still not a deep link to any specific
// product or category page, though - every category listed in
// KLOOK_EXPERIENCE_CATEGORIES is real (Klook does sell all of these), but
// none of them has its own tracked link, so this section must not imply
// per-category deep links (no "Desert Safari" button that actually lands
// somewhere generic). One real link, one real button, honest copy about
// what's on the other side of it.
export const KLOOK_LINK = "https://klook.tpm.lv/JaftNQHL";

// Deliberately excludes "Hotels & accommodation" even though Klook does
// sell it - see DECISIONS.md, "Klook accommodation kept out of the trip
// section (2026-09-01)." This list is what actually renders in
// KlookTripSection, on a page that's mid hotel comparison - naming Klook
// as a hotel source right there reads as "does Klook also do what Rate
// Manifest does," which is exactly the confusion to avoid. A hotel-specific
// Klook path, if built later, is a separate, clearly distinct surface, not
// a line item here.
export const KLOOK_EXPERIENCE_CATEGORIES = [
  "Activities & experiences",
  "Tours & attractions",
  "Airport transfers",
  "Transport",
  "SIM/eSIM",
] as const;

// 2026-09-01: reversed the "leave hotels out entirely" decision above -
// the user opted to build the Klook hotels/accommodation path too and
// test whether it actually earns anything, switching it off later if it
// doesn't. This flag is the switch: KlookTripSection renders its
// secondary "also on Klook" hotels note only when this is true, so
// turning it off later (see DECISIONS.md) is a one-line change, not a
// re-edit of the component. It stays a clearly-labeled secondary block
// even while on - see KlookTripSection.tsx - so the "does Klook do what
// Rate Manifest does" confusion stays addressed by honest copy instead
// of by leaving it out.
export const SHOW_KLOOK_HOTELS_NOTE = true;

// A second, dedicated link for the hotels note above - generated the same
// way as KLOOK_LINK (Travelpayouts' Links tool), pointed specifically at
// Klook's Dubai hotels listing rather than the generic homepage or a
// worldwide hotels page - everything else in this section, including its
// own "Complete your Dubai trip" copy, is Dubai-specific, so a worldwide
// hotel search from here would be a mismatch. Kept separate from
// KLOOK_LINK so the two CTAs point at what they actually say they point
// at, and so Travelpayouts' own per-link analytics can tell experiences
// clicks apart from hotels clicks. Regenerated 2026-09-01 (O3Coxqyz
// replacing the original RqxKw5oy) - same intent, refreshed link.
export const KLOOK_HOTELS_LINK = "https://klook.tpm.lv/O3Coxqyz";

// Travelpayouts' "Specific City/Category Tours Widget" for Klook - a
// third-party script that renders real, live Klook product cards (name,
// rating, review count, real price) for a given city/category, with the
// referral marker baked in. This is the actual answer to the "no
// fabricated numbers" constraint everywhere else in this file: real prices
// sourced live from Klook itself, not written by us. See DECISIONS.md,
// "Klook Tours Widget" entries.
//
// city_id=78 is Dubai, category=4 is whatever category the user selected
// in the Travelpayouts widget builder when this was generated - swapping
// categories later is just regenerating the widget and replacing this one
// URL, nothing else in the integration needs to change.
export const KLOOK_TOURS_WIDGET_SRC =
  "https://tpwgts.com/content?currency=AED&trs=568981&shmarker=772385&locale=en&city_id=78&category=4&amount=3&powered_by=true&campaign_id=137&promo_id=4497";

// Klook's own "Dynamic Widgets" tool for Hotels - generated directly in the
// Klook Affiliate Dashboard (My Ads -> Other tools -> Hotels -> Dynamic
// Widgets), separate from the Travelpayouts-mediated Tours Widget above.
// Mechanically different, not just a second copy of the same pattern: this
// is Klook's own affiliate infrastructure (affiliate.klook.com), reached
// through the same Travelpayouts-mediated Klook program access used
// everywhere else in this file - see DECISIONS.md, "Klook Dynamic Hotel
// Widget (2026-09-03)." The loader script scans the DOM for
// `.klk-aff-widget` elements and fills each one with a real iframe, rather
// than the Tours Widget's single self-contained <script src="...content?..."
// > tag - so this needs BOTH the loader script (once) AND a placeholder
// <ins> element with the data-* config below (see KlookTripSection.tsx).
export const KLOOK_HOTELS_WIDGET_SCRIPT_SRC =
  "https://affiliate.klook.com/widget/fetch-iframe-init.js";

// The <ins class="klk-aff-widget"> placeholder's data-* config, exactly as
// generated by the Klook dashboard form - kept as one object rather than
// separate constants so the values stay visibly tied to the single "Save
// and generate code" action that produced them together. Live preview at
// generation time confirmed three real Dubai hotel cards (The S Hotel Al
// Barsha, Rove Expo City, Park Regis Business Bay Hotel) with real ratings,
// review counts, and AED prices - this is not a mock/sample config.
//
// - adid: this Rate Manifest Klook affiliate account's ad id.
// - cid "78": Klook's Dubai destination id - same id already used as
//   city_id=78 in KLOOK_TOURS_WIDGET_SRC above, so both widgets on this
//   page are pointed at the same city.
// - amount "3": three cards, matching the Tours Widget's amount=3 above -
//   kept equal so neither section visually dominates the other.
// - currency "AED": set explicitly rather than left on Klook's default, to
//   match every other price shown on Rate Manifest.
// - cardH/padding/lgH/edgeValue: Klook's own generated layout sizing for
//   this widget - not something to hand-tune, since these numbers are
//   whatever the loader script's iframe expects for a 3-card AED layout at
//   generation time. Left exactly as generated.
// - lang left "" (Klook's own "User Browser Language" default) and tid left
//   "" (not offered/required in this form) - both exactly as generated,
//   neither one blank by omission.
// - prod "hotel_dynamic_widget": identifies this as the Hotels dynamic
//   widget product to Klook's loader, as opposed to a Things To Do widget.
//
// Label 1/2/3 (set in the Klook dashboard form itself, not part of this
// data-* config - Klook's own ad performance tracking, per the dashboard's
// tooltip: "track and identify your ads... by ad placement, activity
// category, destination, or else"): "search-page-hotels-note" (placement -
// this is the /search page's Klook hotels note), "hotels" (category),
// "dubai" (destination). Recorded here for reference in case the widget is
// ever regenerated and these should be reused.
export const KLOOK_HOTELS_WIDGET_CONFIG = {
  adid: "1413929",
  lang: "",
  currency: "AED",
  cardH: "126",
  padding: "92",
  lgH: "470",
  edgeValue: "655",
  cid: "78",
  tid: "",
  amount: "3",
  prod: "hotel_dynamic_widget",
} as const;
