import { KLOOK_EXPERIENCE_CATEGORIES, KLOOK_LINK, SHOW_KLOOK_HOTELS_NOTE } from "@/lib/klook";

// Shown after a real hotel's search results, regardless of whether an
// offer was found - see DECISIONS.md, "Klook's accommodation program,
// added to try." Deliberately a server component with a single plain
// <a>: no per-category links exist yet (see klook.ts), so this never
// implies a specific product or price is one click away - only that
// Klook, as a real named partner, is one click away.
//
// The second block (klook-also-hotels) is Klook's own hotel/accommodation
// offering - see DECISIONS.md, "Klook hotels, brought back with explicit
// not-verified framing." It stays inside this same card, visually and
// textually secondary (smaller type, plain text link, no button, and the
// words "not independently verified" right in the copy) precisely so it
// can't be mistaken for another row in the verified comparison above -
// that framing is what makes it safe to show on the same domain, without
// needing the separate-domain plan that's on hold for later.
export function KlookTripSection() {
  return (
    <div className="klook-section">
      <div className="klook-eyebrow">Complete your Dubai trip</div>
      <p className="klook-body">
        Rate Manifest only compares hotel rates - for everything else around the trip, Klook covers{" "}
        {KLOOK_EXPERIENCE_CATEGORIES.join(", ").toLowerCase()}.
      </p>
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
          <a href={KLOOK_LINK} target="_blank" rel="noopener noreferrer">
            Search hotels on Klook →
          </a>
        </p>
      )}
    </div>
  );
}
