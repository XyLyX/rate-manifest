import Script from "next/script";
import {
  KLOOK_HOTELS_LINK,
  KLOOK_HOTELS_WIDGET_CONFIG,
  KLOOK_WIDGET_SCRIPT_SRC,
} from "@/lib/klook";

// The homepage's first browsing surface - see DECISIONS.md, "Klook browsing
// moved to the top of the homepage (2026-09-04)." Chat, 2026-09-04: "this
// needs to check thru klook or any supplier. why is rate manifest first?????
// ... let the customer search broadly: Dubai -> dates -> guests ->
// hotels/properties. They see the Klook hotel inventory and can browse as
// many properties as they want. No expensive StayingAPI intelligence needs
// to run here."
//
// What this component honestly can and can't do, and why - this is the one
// thing to get right here, because the literal request (an embedded search
// box where a visitor types dates and guests and Klook's whole Dubai hotel
// inventory searches in place, inside RateManifest) does not exist as a
// capability Klook offers. Confirmed twice now, independently:
//   - Gate 1 (established earlier in this project): Klook's public partner
//     API is OCTO-based - tours/activities/attractions only, no hotel-search
//     endpoint at all. There is nothing to build a real search UI against.
//   - Klook's affiliate *widget* program (what KLOOK_HOTELS_WIDGET_CONFIG
//     below actually is - see klook.ts) is advertising, not search: a fixed
//     panel of properties the user hand-picked in Klook's dashboard ("By
//     property" mode), rendered by Klook's own script inside an iframe we
//     don't control. It has no dates/guests inputs and can't be given any -
//     it always shows the same four hand-picked 5-star Dubai hotels.
// So "browse as many properties as they want, searched by their own dates
// and guests" is real, but only on klook.com itself - KLOOK_HOTELS_LINK
// below is a tracked link straight to Klook's own Dubai hotels search
// results, where a visitor sets their own dates and guest count and sees
// Klook's actual live inventory. That's the honest version of "search
// broadly through Klook": a real widget for a first taste, then one click
// to Klook's real search - not a fabricated in-page search experience.
//
// Zero StayingAPI cost either way - this whole component never touches
// stayingApiRefresh.ts or runSearch(). See src/app/hotel/page.tsx and
// DECISIONS.md, "The Analyse This Hotel gate," for where the one paid
// lookup actually happens, further down the funnel from here.
export function KlookHomeBrowse() {
  return (
    <div className="klook-home-browse">
      <div className="hero-eyebrow klook-home-eyebrow">Start browsing</div>
      <h2 className="klook-home-title">Browse Dubai hotels through Klook</h2>
      <p className="klook-home-body">
        A first look at Klook&apos;s Dubai hotels below, or open Klook&apos;s own site to search its full
        inventory by your own dates and guests. Free to browse - nothing is spent checking a rate until you
        pick a property and ask RateManifest to verify it.
      </p>
      <div className="klook-home-widget-mount">
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
      <a
        className="btn klook-home-cta"
        href={KLOOK_HOTELS_LINK}
        target="_blank"
        rel="noopener noreferrer sponsored"
      >
        Search all Klook hotels - pick your dates &amp; guests →
      </a>
      <p className="klook-home-disclosure">
        Klook is a separate partner, not RateManifest&apos;s own inventory - the four properties above are a
        fixed set Klook shows every visitor, and searching by date and guest count only happens once you
        follow the link through to Klook&apos;s own site. Booked and paid for on Klook, not through
        RateManifest.
      </p>
      <Script id="klook-widgets-loader-home" src={KLOOK_WIDGET_SCRIPT_SRC} strategy="lazyOnload" />
    </div>
  );
}
