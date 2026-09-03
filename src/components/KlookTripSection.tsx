import Script from "next/script";
import {
  KLOOK_EXPERIENCE_CATEGORIES,
  KLOOK_HOTELS_LINK,
  KLOOK_HOTELS_WIDGET_CONFIG,
  KLOOK_HOTELS_WIDGET_SCRIPT_SRC,
  KLOOK_LINK,
  SHOW_KLOOK_HOTELS_NOTE,
} from "@/lib/klook";

// Shown after a real hotel's search results, regardless of whether an
// offer was found - see DECISIONS.md, "Klook's accommodation program,
// added to try."
//
// The top block used to carry a Travelpayouts Tours Widget with real
// Klook experience cards (desert safaris, tours) - removed 2026-09-03
// once Viator's own native Things To Do section (ThingsToDoSection.tsx,
// rendered above this component on /search) started covering that same
// ground with real cards of its own. Keeping both meant the page showed
// two "tours in Dubai" lists back to back, from two different suppliers -
// see DECISIONS.md, "Klook Tours Widget removed - redundant with native
// Viator (2026-09-03)." KLOOK_EXPERIENCE_CATEGORIES was narrowed the same
// day to match: just what Klook still covers and Viator doesn't (airport
// transfers, transport, SIM/eSIM). The "Browse Here" link is now this
// block's only CTA rather than a fallback next to a widget - it points at
// KLOOK_LINK, a real (if generic) Dubai search-results page, not a deep
// link to any one of those categories - see KLOOK_LINK's own comment for
// why that's an honest tradeoff rather than an oversight.
//
// The second block (klook-also-hotels) is Klook's own hotel/accommodation
// offering - see DECISIONS.md, "Klook hotels, brought back with explicit
// not-verified framing," "A dedicated Klook hotels link, Dubai-scoped," and
// "Klook Dynamic Hotel Widget (2026-09-03)." It stays inside this same
// card, visually and textually secondary (smaller type, no big button, and
// the words "not independently verified" right in the copy) precisely so
// it can't be mistaken for another row in the verified comparison above -
// that framing is what makes it safe to show on the same domain, without
// needing the separate-domain plan that's on hold for later.
//
// As of 2026-09-03 this block also carries Klook's own Hotel Widget - real
// Klook hotel cards (name, star tier, rating, review count, AED price),
// sourced live from Klook. This is an <ins class="klk-aff-widget">
// placeholder that affiliate.klook.com's loader script
// (KLOOK_HOTELS_WIDGET_SCRIPT_SRC) scans the DOM for and fills with a real
// iframe, so both the loader script (once) AND the placeholder element are
// required, and the placeholder's data-* attribute names stay in the exact
// mixed case Klook generated (data-cardH, data-lgH, data-edgeValue) - HTML
// attribute matching is case-insensitive, so this is about literal
// fidelity to what Klook generated, not a functional requirement. The
// <ins> element's fallback content (a plain "Klook.com" link) is Klook's
// own fallback for when the loader script doesn't run - kept as-is rather
// than customized.
//
// Switched 2026-09-03 from Klook's destination-algorithm widget to a
// hand-picked "By property" one - see DECISIONS.md, "Klook hotel widget
// switched to a hand-picked 5-star static widget (2026-09-03)," and
// KLOOK_HOTELS_WIDGET_CONFIG's own comment in klook.ts for the full
// reasoning. The only visible effect here: no data-cid/data-tid attributes
// - the static widget has no destination to target, just the fixed
// property list baked into its ad id.
//
// KLOOK_HOTELS_LINK stays below the widget as a second, guaranteed
// fallback: this domain was never reachable from the dev environment to
// inspect directly, and ad-blockers commonly flag third-party
// affiliate-widget domains, so a visitor whose browser blocks the widget
// still has a real, working path to Klook's hotel search rather than a
// silently empty section.
export function KlookTripSection() {
  return (
    <div className="klook-section">
      <div className="klook-eyebrow">Complete your Dubai trip</div>
      <p className="klook-body">
        Rate Manifest only compares hotel rates - for everything else around the trip, Klook covers{" "}
        {KLOOK_EXPERIENCE_CATEGORIES.join(", ").toLowerCase()}.
      </p>
      <a className="btn-ghost klook-cta" href={KLOOK_LINK} target="_blank" rel="noopener noreferrer">
        Browse Here →
      </a>
      <p className="klook-disclosure">
        Klook is a separate partner from the hotel comparison above - booked and paid for on Klook, not through
        Rate Manifest.
      </p>
      {SHOW_KLOOK_HOTELS_NOTE && (
        <div className="klook-also-hotels">
          <p className="klook-also-hotels-intro">
            Klook has also recently added hotels and accommodation. If none of the verified prices above work
            for you, these are real Klook listings below - unlike the offers above, not independently checked by
            Rate Manifest.
          </p>
          <div className="klook-hotels-widget-mount">
            <ins
              className="klk-aff-widget"
              data-adid={KLOOK_HOTELS_WIDGET_CONFIG.adid}
              data-lang={KLOOK_HOTELS_WIDGET_CONFIG.lang}
              data-currency={KLOOK_HOTELS_WIDGET_CONFIG.currency}
              data-cardH={KLOOK_HOTELS_WIDGET_CONFIG.cardH}
              data-padding={KLOOK_HOTELS_WIDGET_CONFIG.padding}
              data-lgH={KLOOK_HOTELS_WIDGET_CONFIG.lgH}
              data-edgeValue={KLOOK_HOTELS_WIDGET_CONFIG.edgeValue}
              data-amount={KLOOK_HOTELS_WIDGET_CONFIG.amount}
              data-prod={KLOOK_HOTELS_WIDGET_CONFIG.prod}
            >
              <a href="//www.klook.com/">Klook.com</a>
            </ins>
            <Script id="klook-hotels-widget" src={KLOOK_HOTELS_WIDGET_SCRIPT_SRC} strategy="lazyOnload" />
          </div>
          <a className="klook-also-hotels-link" href={KLOOK_HOTELS_LINK} target="_blank" rel="noopener noreferrer">
            Browse HOTELS →
          </a>
        </div>
      )}
    </div>
  );
}
