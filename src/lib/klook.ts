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
//
// Also narrowed 2026-09-03 (see DECISIONS.md, "Klook Tours Widget removed
// - redundant with native Viator (2026-09-03)") to drop "Activities &
// experiences" and "Tours & attractions" - once the Viator integration
// shipped its own native Things To Do cards, keeping those two words here
// (next to the Klook Tours Widget that used to sit below this copy) meant
// the page effectively advertised the same category of content twice, from
// two different suppliers, right next to each other. What's left is
// exactly what Klook still covers and Viator doesn't.
export const KLOOK_EXPERIENCE_CATEGORIES = ["Airport transfers", "Transport", "SIM/eSIM"] as const;

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

// Travelpayouts' "Specific City/Category Tours Widget" for Klook used to
// live here (KLOOK_TOURS_WIDGET_SRC, a third-party script rendering real
// Klook experience cards - Desert Safari Tours, eSIM, etc.). Removed
// 2026-09-03 - once Viator's native Things To Do section shipped its own
// real cards for the same kind of content, this widget was showing the
// user a second "tours in Dubai" list right below the first one, from a
// different supplier. See DECISIONS.md, "Klook Tours Widget removed -
// redundant with native Viator (2026-09-03)," for the full reasoning
// (including the DOM-placement bug that was fixed the same day this was
// removed - moot now, but documented there for the record). The old URL,
// for reference if this is ever reconsidered:
// https://tpwgts.com/content?currency=AED&trs=568981&shmarker=772385&locale=en&city_id=78&category=4&amount=3&powered_by=true&campaign_id=137&promo_id=4497

// Klook's own "Dynamic Widgets" tool for Hotels - generated directly in the
// Klook Affiliate Dashboard (My Ads -> Other tools -> Hotels -> Dynamic
// Widgets). This is Klook's own affiliate infrastructure
// (affiliate.klook.com), reached through the same Travelpayouts-mediated
// Klook program access used everywhere else in this file - see
// DECISIONS.md, "Klook Dynamic Hotel Widget (2026-09-03)" and "Klook hotel
// widget switched to a hand-picked 5-star static widget (2026-09-03)."
// This loader script itself is unchanged by that second decision - it's
// the same URL for both the original destination-algorithm ("dynamic")
// widget and the current hand-picked ("static") one below, since the
// "Dynamic Widgets" tool is Klook's name for the whole generator, covering
// both selection modes. It scans the DOM for `.klk-aff-widget` elements
// and fills each one with a real iframe, so this needs BOTH the loader
// script (once) AND a placeholder <ins> element with the data-* config
// below (see KlookTripSection.tsx).
export const KLOOK_HOTELS_WIDGET_SCRIPT_SRC =
  "https://affiliate.klook.com/widget/fetch-iframe-init.js";

// The <ins class="klk-aff-widget"> placeholder's data-* config, exactly as
// generated by the Klook dashboard form - kept as one object rather than
// separate constants so the values stay visibly tied to the single "Save
// and generate code" action that produced them together.
//
// Replaced 2026-09-03 (see DECISIONS.md, "Klook hotel widget switched to a
// hand-picked 5-star static widget (2026-09-03)"). The original config
// above (prod "hotel_dynamic_widget", cid "78") was Klook's own
// destination-level algorithm picking Dubai hotels automatically - it
// surfaced a 3-star property (Rove Expo City) alongside 5-star ones, which
// is what prompted this replacement. This config was built in Klook's "By
// property" mode instead: the user hand-searched and added specific 5-star
// Dubai properties in the Klook Affiliate Dashboard, so the resulting
// widget - "hotel_static_widget" - has no destination id at all (no cid,
// no tid: there's no algorithm left to target, just the fixed property
// list baked into this ad id). Live preview at generation time confirmed
// four real 5-star ("Luxury") Dubai cards: Bvlgari Resort Dubai, Four
// Seasons Resort Dubai at Jumeirah Beach, Mandarin Oriental Jumeira Dubai,
// and a fourth shown only via the widget's own "See more" - this is not a
// mock/sample config.
//
// - adid "1413948": a new ad id, distinct from the old dynamic widget's
//   "1413929" - Klook issues a fresh ad id per "Save and generate code"
//   action, so this identifies this specific static, hand-picked ad.
// - amount "4": four hand-picked properties, up from the old dynamic
//   widget's 3 - the count is whatever the user added in "By property"
//   mode, not a fixed layout choice.
// - currency "AED": set explicitly rather than left on Klook's default, to
//   match every other price shown on Rate Manifest.
// - cardH/padding/lgH/edgeValue: Klook's own generated layout sizing for
//   this widget - not something to hand-tune, unchanged from the previous
//   config since the card layout itself didn't change, only which
//   properties fill it.
// - lang left "" (Klook's own "User Browser Language" default) - exactly
//   as generated, blank by generation rather than by omission.
// - prod "hotel_static_widget": identifies this as a static (hand-picked
//   property list) Hotels widget to Klook's loader, as opposed to the
//   previous "hotel_dynamic_widget" (destination-algorithm) or a Things To
//   Do widget.
export const KLOOK_HOTELS_WIDGET_CONFIG = {
  adid: "1413948",
  lang: "",
  currency: "AED",
  cardH: "126",
  padding: "92",
  lgH: "470",
  edgeValue: "655",
  amount: "4",
  prod: "hotel_static_widget",
} as const;
