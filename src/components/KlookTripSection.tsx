import Script from "next/script";
import {
  KLOOK_EXPERIENCE_CATEGORIES,
  KLOOK_HOTELS_LINK,
  KLOOK_HOTELS_WIDGET_CONFIG,
  KLOOK_HOTELS_WIDGET_SCRIPT_SRC,
  KLOOK_LINK,
  KLOOK_TOURS_WIDGET_SRC,
  SHOW_KLOOK_HOTELS_NOTE,
} from "@/lib/klook";

// Shown after a real hotel's search results, regardless of whether an
// offer was found - see DECISIONS.md, "Klook's accommodation program,
// added to try," and "Klook Tours Widget."
//
// The widget below is a third-party script (Travelpayouts' Klook Tours
// Widget) that renders real, live product cards - real names, ratings,
// prices - sourced from Klook itself, not written by us. Loaded via
// next/script with strategy="lazyOnload" so it never competes with the
// page's own load, and so it only touches the DOM after React has already
// hydrated (this component has no client-side state and nothing above it
// re-renders once it mounts, so there's nothing for the widget's DOM
// insertions to collide with). It was never inspected directly - the
// domain isn't reachable from this environment - so the plain "Browse
// Klook" link/button stays as a guaranteed fallback for anyone whose
// browser blocks the widget script (ad blockers commonly flag exactly
// this kind of third-party affiliate-widget domain), and the category
// list stays as the text description either way.
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
// As of 2026-09-03 this block also carries Klook's own Dynamic Hotel
// Widget - real Klook hotel cards (name, star tier, rating, review count,
// AED price), sourced live from Klook the same way the Tours Widget above
// sources live Klook experience cards. Mechanically different from that
// widget though: this is an <ins class="klk-aff-widget"> placeholder that
// affiliate.klook.com's loader script (KLOOK_HOTELS_WIDGET_SCRIPT_SRC)
// scans the DOM for and fills with a real iframe, rather than a single
// self-contained <script src="...content?..."> tag - so both the loader
// script AND the placeholder element are required, and the placeholder's
// data-* attribute names must stay in the exact mixed case Klook generated
// (data-cardH, data-lgH, data-edgeValue) - HTML attribute matching is
// case-insensitive, so this is about literal fidelity to what Klook
// generated, not a functional requirement. The <ins> element's fallback
// content (a plain "Klook.com" link) is Klook's own fallback for when the
// loader script doesn't run - kept as-is rather than customized.
//
// KLOOK_HOTELS_LINK stays below the widget as a second, guaranteed
// fallback (same reasoning as the Tours Widget above: this domain was
// never reachable from the dev environment to inspect directly, and
// ad-blockers commonly flag third-party affiliate-widget domains) so a
// visitor whose browser blocks the widget still has a real, working path
// to Klook's hotel search rather than a silently empty section.
export function KlookTripSection() {
  return (
    <div className="klook-section">
      <div className="klook-eyebrow">Complete your Dubai trip</div>
      <p className="klook-body">
        Rate Manifest only compares hotel rates - for everything else around the trip, Klook covers{" "}
        {KLOOK_EXPERIENCE_CATEGORIES.join(", ").toLowerCase()}.
      </p>
      <div className="klook-widget-mount">
        <Script id="klook-tours-widget" src={KLOOK_TOURS_WIDGET_SRC} strategy="lazyOnload" />
      </div>
      <a className="btn-ghost klook-cta" href={KLOOK_LINK} target="_blank" rel="noopener noreferrer">
        Browse Klook →
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
              data-cid={KLOOK_HOTELS_WIDGET_CONFIG.cid}
              data-tid={KLOOK_HOTELS_WIDGET_CONFIG.tid}
              data-amount={KLOOK_HOTELS_WIDGET_CONFIG.amount}
              data-prod={KLOOK_HOTELS_WIDGET_CONFIG.prod}
            >
              <a href="//www.klook.com/">Klook.com</a>
            </ins>
            <Script id="klook-hotels-widget" src={KLOOK_HOTELS_WIDGET_SCRIPT_SRC} strategy="lazyOnload" />
          </div>
          <a className="klook-also-hotels-link" href={KLOOK_HOTELS_LINK} target="_blank" rel="noopener noreferrer">
            Browse Hotels on Klook →
          </a>
        </div>
      )}
    </div>
  );
}
