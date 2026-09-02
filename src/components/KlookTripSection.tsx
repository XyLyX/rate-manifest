import Script from "next/script";
import {
  KLOOK_EXPERIENCE_CATEGORIES,
  KLOOK_HOTELS_LINK,
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
// not-verified framing," and "A dedicated Klook hotels link, Dubai-scoped."
// It stays inside this same card, visually and textually secondary
// (smaller type, plain text link, no button, and the words "not
// independently verified" right in the copy) precisely so it can't be
// mistaken for another row in the verified comparison above - that framing
// is what makes it safe to show on the same domain, without needing the
// separate-domain plan that's on hold for later. Unlike the experiences
// CTA, this one now has its own dedicated, Dubai-scoped link
// (KLOOK_HOTELS_LINK) rather than reusing the generic homepage link.
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
        <p className="klook-also-hotels">
          Klook has also recently added hotels and accommodation. If none of the verified prices above work for
          you, you can search this stay on Klook as well - unlike the offers above, that listing is not one Rate
          Manifest has independently checked.{" "}
          <a href={KLOOK_HOTELS_LINK} target="_blank" rel="noopener noreferrer">
            Browse Hotels →
          </a>
        </p>
      )}
    </div>
  );
}
