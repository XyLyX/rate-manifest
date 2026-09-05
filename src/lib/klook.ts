// Klook is Layer 2 (Monetization) only - see DECISIONS.md, "Two-layer
// architecture, and the roadmap beyond Booking.com." It never enters the
// Layer 1 hotel comparison (still StayingAPI-verified sellers only), and
// this file should stay that way: nothing here is a SupplierAdapter, and
// nothing here should ever get imported by src/lib/search.ts or the scoring
// code.
//
// KLOOK_LINK is the main "Browse Klook" experiences CTA's link - the
// "Explore Activities"/"Explore Things To Do" buttons on the homepage and
// the "Browse Here" button in KlookTripSection on /search. Originally a
// Travelpayouts Links-tool link pointed at klook.com's bare homepage;
// updated 2026-09-01 to Klook's own Dubai search-results page instead -
// same purpose, a more useful landing spot than the homepage. Replaced
// again 2026-09-04 with a link the user provided directly, generated from
// Klook's own affiliate short-link tool (affiliate.klook.com/sl/...)
// rather than through Travelpayouts - chat, 2026-09-04: "Link for -
// Explore Activities- https://affiliate.klook.com/sl/1DjS3Cm." Same
// tradeoff as before still applies - every category listed in
// KLOOK_EXPERIENCE_CATEGORIES is real (Klook does sell all of these), but
// none of them has its own tracked link, so this section must not imply
// per-category deep links (no "Desert Safari" button that actually lands
// somewhere generic). One real link, one real button, honest copy about
// what's on the other side of it.
export const KLOOK_LINK = "https://affiliate.klook.com/sl/1DjS3Cm";

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

// A second, dedicated link for the hotels note above (KlookTripSection's
// "also on Klook" block, used on both /search and, since Sprint 3, the
// homepage) - pointed specifically at Klook's Dubai hotels listing rather
// than the generic homepage or a worldwide hotels page - everything else
// in this section is Dubai-specific (the fixed four-property widget is
// Dubai-only), so a worldwide hotel search from here would be a mismatch.
// Kept separate from KLOOK_LINK so the two CTAs point at what they
// actually say they point at, and so each link's own analytics can tell
// experiences clicks apart from hotels clicks.
// Regenerated 2026-09-01 (O3Coxqyz replacing the original RqxKw5oy) via
// Travelpayouts, same intent; replaced again 2026-09-04 with a link the
// user provided directly, generated from Klook's own affiliate short-link
// tool instead - chat, 2026-09-04: "Link for View Hotels-
// https://affiliate.klook.com/sl/1yrhErq."
export const KLOOK_HOTELS_LINK = "https://affiliate.klook.com/sl/1yrhErq";

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

// Klook's own "Dynamic Widgets" tool - generated directly in the Klook
// Affiliate Dashboard (My Ads -> Other tools), reached through the same
// Travelpayouts-mediated Klook program access used everywhere else in this
// file. Originally added for Hotels only - see DECISIONS.md, "Klook
// Dynamic Hotel Widget (2026-09-03)" and "Klook hotel widget switched to a
// hand-picked 5-star static widget (2026-09-03)." Renamed from
// KLOOK_HOTELS_WIDGET_SCRIPT_SRC 2026-09-03 once KLOOK_ESSENTIALS_WIDGET_CONFIG
// below started using this exact same URL for a second, non-hotels widget -
// see DECISIONS.md, "Klook travel-essentials widget added (2026-09-03)."
// One loader script covers every widget on the page: it scans the whole
// DOM for `.klk-aff-widget` elements and fills each one with a real
// iframe, so KlookTripSection.tsx includes this <Script> tag ONCE and
// relies on it to fill both this file's <ins> placeholders (essentials and
// hotels), rather than loading it twice.
export const KLOOK_WIDGET_SCRIPT_SRC =
  "https://affiliate.klook.com/widget/fetch-iframe-init.js";

// Klook's own "Dynamic Widgets" tool again, this time NOT scoped to
// Hotels - see DECISIONS.md, "Klook travel-essentials widget added
// (2026-09-03)." Built to answer the "the categories widget vanished"
// question: KLOOK_EXPERIENCE_CATEGORIES above (airport transfers,
// transport, SIM/eSIM) was always just copy, never backed by real cards,
// once the old Tours Widget was removed - this is the fix, a single real
// widget covering exactly those three categories together.
//
// Klook's dashboard exposes this via a "tid" (tag id) rather than a named
// category dropdown, so getting the right one took two tries - the user
// generated two widgets and sent screenshots of both:
// - tid "5" (this one, adid "1413967"): confirmed live to show exactly
//   the right content - "Dubai International Airport Lounge Service",
//   "Dubai Private Car Charter", "5G eSIM United Arab Emirates" - a real
//   match for all three KLOOK_EXPERIENCE_CATEGORIES in one widget, no
//   separate widget needed per category after all.
// - tid "21" (adid "1413968", NOT used here): came back as attraction
//   tickets - Sky Views Observatory, At The Top (Burj Khalifa), The View
//   At The Palm. Real Klook content, but attractions/tours, which is
//   exactly the category Viator's native Things To Do section already
//   covers - using this one would recreate the same redundancy the old
//   Tours Widget removal was meant to fix. Left unused on purpose; the
//   adid is recorded here only so it isn't regenerated by accident.
export const KLOOK_ESSENTIALS_WIDGET_CONFIG = {
  adid: "1413967",
  lang: "",
  currency: "AED",
  cardH: "126",
  padding: "92",
  lgH: "470",
  edgeValue: "655",
  cid: "78",
  tid: "5",
  amount: "3",
  prod: "dynamic_widget",
} as const;

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
