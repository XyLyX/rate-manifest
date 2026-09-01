// Klook is Layer 2 (Monetization) only - see DECISIONS.md, "Two-layer
// architecture, and the roadmap beyond Booking.com." It never enters the
// Layer 1 hotel comparison (still StayingAPI-verified sellers only), and
// this file should stay that way: nothing here is a SupplierAdapter, and
// nothing here should ever get imported by src/lib/search.ts or the scoring
// code.
//
// KLOOK_LINK is the one real affiliate link generated so far via
// Travelpayouts' Links tool for Ratemanifest (2026-09-01), pointed at
// klook.com's homepage - not a deep link to any specific product or
// category page, because the Links tool's "Destination page" field was
// filled in as https://klook.com and nothing more specific was picked.
// Every category listed in KLOOK_EXPERIENCE_CATEGORIES is real (Klook does
// sell all of these), but none of them has its own tracked link yet - so
// this section must not imply per-category deep links (no "Desert Safari"
// button that actually lands on the homepage). One real link, one real
// button, honest copy about what's on the other side of it.
export const KLOOK_LINK = "https://klook.tpm.lv/2vSljl8m";

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
