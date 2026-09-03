import Script from "next/script";
import {
  KLOOK_ESSENTIALS_WIDGET_CONFIG,
  KLOOK_EXPERIENCE_CATEGORIES,
  KLOOK_HOTELS_LINK,
  KLOOK_HOTELS_WIDGET_CONFIG,
  KLOOK_LINK,
  KLOOK_WIDGET_SCRIPT_SRC,
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
// transfers, transport, SIM/eSIM).
//
// That removal left this block as just a sentence and a generic "Browse
// Here" button for a few hours - no real cards, unlike the rich Viator
// grid above it. Fixed the same day with a real widget of its own: see
// DECISIONS.md, "Klook travel-essentials widget added (2026-09-03)," and
// KLOOK_ESSENTIALS_WIDGET_CONFIG's own comment in klook.ts for how the
// right tag id was found. "Browse Here" (KLOOK_LINK, a real if generic
// Dubai search-results page) stays below the widget as a fallback for a
// visitor whose browser blocks it - see KLOOK_LINK's own comment for why
// that's an honest tradeoff rather than an oversight.
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
// Both widgets below are <ins class="klk-aff-widget"> placeholders that
// affiliate.klook.com's loader script (KLOOK_WIDGET_SCRIPT_SRC) scans the
// whole DOM for and fills with real iframes, so the placeholder's data-*
// attribute names stay in the exact mixed case Klook generated
// (data-cardH, data-lgH, data-edgeValue) - HTML attribute matching is
// case-insensitive, so this is about literal fidelity to what Klook
// generated, not a functional requirement. Each <ins> element's fallback
// content (a plain "Klook.com" link) is Klook's own fallback for when the
// loader script doesn't run - kept as-is rather than customized. The
// loader script itself is included ONCE, below both widgets, rather than
// once per widget - it fills every `.klk-aff-widget` element it finds in
// a single pass, so a second <Script> tag would just load the same file
// twice for no benefit.
//
// The hotels widget's config switched 2026-09-03 from Klook's
// destination-algorithm widget to a hand-picked "By property" one - see
// DECISIONS.md, "Klook hotel widget switched to a hand-picked 5-star
// static widget (2026-09-03)," and KLOOK_HOTELS_WIDGET_CONFIG's own
// comment in klook.ts for the full reasoning. The only visible effect
// here: no data-cid/data-tid attributes on that one - the static widget
// has no destination to target, just the fixed property list baked into
// its ad id. The essentials widget above it is NOT static - it keeps
// data-cid/data-tid, since it's Klook's destination+tag algorithm doing
// the picking there.
//
// KLOOK_HOTELS_LINK stays below the hotels widget as a second, guaranteed
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
      <div className="klook-widget-mount">
        <ins
          className="klk-aff-widget"
          data-adid={KLOOK_ESSENTIALS_WIDGET_CONFIG.adid}
          data-lang={KLOOK_ESSENTIALS_WIDGET_CONFIG.lang}
          data-currency={KLOOK_ESSENTIALS_WIDGET_CONFIG.currency}
          data-cardH={KLOOK_ESSENTIALS_WIDGET_CONFIG.cardH}
          data-padding={KLOOK_ESSENTIALS_WIDGET_CONFIG.padding}
          data-lgH={KLOOK_ESSENTIALS_WIDGET_CONFIG.lgH}
          data-edgeValue={KLOOK_ESSENTIALS_WIDGET_CONFIG.edgeValue}
          data-cid={KLOOK_ESSENTIALS_WIDGET_CONFIG.cid}
          data-tid={KLOOK_ESSENTIALS_WIDGET_CONFIG.tid}
          data-amount={KLOOK_ESSENTIALS_WIDGET_CONFIG.amount}
          data-prod={KLOOK_ESSENTIALS_WIDGET_CONFIG.prod}
        >
          <a href="//www.klook.com/">Klook.com</a>
        </ins>
      </div>
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
          </div>
          <a className="klook-also-hotels-link" href={KLOOK_HOTELS_LINK} target="_blank" rel="noopener noreferrer">
            Browse HOTELS →
          </a>
        </div>
      )}
      <Script id="klook-widgets-loader" src={KLOOK_WIDGET_SCRIPT_SRC} strategy="lazyOnload" />
    </div>
  );
}
