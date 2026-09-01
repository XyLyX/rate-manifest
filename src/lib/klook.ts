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
// way as KLOOK_LINK (Travelpayouts' Links tool), but pointed specifically
// at Klook's Dubai hotels listing (https://www.klook.com/en-US/hotels/
// city/78-dubai-hotels/) rather than the generic homepage. Deliberately
// the Dubai-scoped page, not Klook's global hotels page - everything else
// in this section, including its own "Complete your Dubai trip" copy, is
// Dubai-specific, so sending someone to a worldwide hotel search from here
// would be a mismatch. Kept separate from KLOOK_LINK so the two CTAs point
// at what they actually say they point at, and so Travelpayouts' own
// per-link analytics can tell experiences clicks apart from hotels clicks.
export const KLOOK_HOTELS_LINK = "https://klook.tpm.lv/RqxKw5oy";

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
