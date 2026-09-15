import Link from "next/link";
import { inArray } from "drizzle-orm";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatStayDates(checkIn: string, checkOut: string): string {
  const inDate = new Date(checkIn + "T00:00:00Z");
  const outDate = new Date(checkOut + "T00:00:00Z");
  const nights = Math.round((outDate.getTime() - inDate.getTime()) / 86400000);
  const inStr = `${inDate.getUTCDate()} ${MONTHS[inDate.getUTCMonth()]}`;
  const outStr = `${outDate.getUTCDate()} ${MONTHS[outDate.getUTCMonth()]} ${outDate.getUTCFullYear()}`;
  return `${inStr} → ${outStr} · ${nights} night${nights === 1 ? "" : "s"}`;
}
import { db, schema } from "@/db/client";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { JourneyProgress } from "@/components/JourneyProgress";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  searchParams: Promise<{ hotels?: string; checkin?: string; checkout?: string; trip?: string }>;
}

const MAX_COMPARE = 5;

// Page 2 (Compare & Choose) - new 2026-09-12, see claude/discovery-
// property-graph-architecture.md ("FROZEN 2026-09-12"), Sections 3, 11/12.
// Sits between Page 1 (Discover, src/app/page.tsx's HotelSelectionGrid) and
// what the frozen spec now calls Page 3 (Live Rate Verification & IQ - the
// existing Check IQ page, previously labeled "Page 2" in comments predating
// this freeze; see check-iq/page.tsx's own updated header for the
// disambiguation).
//
// Receives up to five canonical property ids selected on Page 1, resolves
// them, and shows them side-by-side (desktop) / as a horizontally-
// scrollable row of cards (smaller screens) - the frozen Section 3 layout
// decision: "comparing five means showing five, not a carousel that hides
// four." Only the four reliably-known fields (name, location, star
// classification, source) are rendered; fields with no data in the hotels
// table are omitted entirely rather than displayed as "Not available."
//
// Contains zero StayingAPI contact and zero price of any kind, current or
// historical - the frozen Section 3 "Page 2 must NOT fabricate" list
// (price, cheapest rate, best deal, historical price, rate trend,
// breakfast, cancellation, payment, availability, competitive advantage).
// The only action available is choosing one property to carry forward into
// Check IQ, exactly the existing /check-iq?hotel=...&checkin=...&checkout=
// ...&trip=... URL shape - the frozen Page 2 -> Page 3 handoff is
// unchanged from how every other entry point into Check IQ already works.
//
// Track F (2026-09-13): added JourneyProgress at step 2.
// UX correction (2026-09-13): removed "Property category" and "Facilities"
// rows — showing identical "Not available" across all columns added no
// information and made the product look broken. When the Property Graph
// (Section 7, Level 2) populates these fields they can be re-added.
export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const checkIn = params.checkin;
  const checkOut = params.checkout;
  const tripId = params.trip ?? "";

  if (!checkIn || !checkOut) {
    return (
      <div className="shell">
        <NavBar ctaLabel="New search" ctaHref="/" />
        <p className="empty-state">
          Missing search details. <Link href="/">Start a new search</Link>.
        </p>
        <Footer />
      </div>
    );
  }

  // Defensive de-dupe + cap even though HotelSelectionGrid already enforces
  // both client-side - a hand-edited URL is the only way to exceed either,
  // and this page should stay honest about "up to 5" regardless of how it
  // was reached.
  const requestedIds = Array.from(
    new Set((params.hotels ?? "").split(",").map((id) => id.trim()).filter(Boolean))
  ).slice(0, MAX_COMPARE);

  const rows =
    requestedIds.length > 0
      ? await db.query.hotels.findMany({ where: inArray(schema.hotels.id, requestedIds) })
      : [];

  // Preserve the order the traveller actually selected in, not whatever
  // order the database happens to return - findMany with `inArray` makes
  // no ordering guarantee.
  const selectedHotels = requestedIds
    .map((id) => rows.find((h) => h.id === id))
    .filter((h): h is typeof rows[number] => h != null);

  const tripQuery = tripId ? `&trip=${tripId}` : "";

  // Frozen zero-results edge case (Section 11/12): never an empty page -
  // this is the "nothing to compare" version of it (an empty/garbled
  // `hotels` param, or every selected id since deleted from the catalog),
  // not the Page 1 "no discovery results" case that copy was written for,
  // so the wording here is adapted to what actually happened rather than
  // reused verbatim.
  if (selectedHotels.length === 0) {
    return (
      <div className="shell">
        <NavBar ctaLabel="New search" ctaHref="/" />
        <p className="empty-state">
          We couldn&apos;t find the properties you selected. <Link href="/">Start a new search</Link> and
          choose up to {MAX_COMPARE} hotels to compare.
        </p>
        <Footer />
      </div>
    );
  }

  return (
    <div className="compare-shell">
      <NavBar ctaLabel="New search" ctaHref="/" />
      <JourneyProgress step={2} />

      <div className="hero compare-hero">
        <div className="hero-eyebrow">Compare & choose</div>
        <h1>
          {/* Frozen fewer-than-5 edge case (Section 11/12): "perfectly valid
              - five is a maximum, not a requirement." No apology copy for
              showing fewer than five. */}
          Comparing {selectedHotels.length} hotel{selectedHotels.length === 1 ? "" : "s"}
        </h1>
        <p>
          Factual property information only — no prices or rate claims here. Choose one to run RateManifest
          IQ&apos;s live verification.
        </p>
        <p className="compare-context-dates">{formatStayDates(checkIn, checkOut)}</p>
      </div>

      <div className="compare-scroll">
        <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${selectedHotels.length}, minmax(200px, 1fr))` }}>
          {selectedHotels.map((hotel) => (
            <div key={hotel.id} className="compare-column">
              <div className="compare-column-image" aria-hidden="true">
                <span>{hotel.name.charAt(0)}</span>
              </div>
              {hotel.isMockData && <span className="hotel-card-demo">Demo</span>}

              <div className="compare-field">
                <div className="compare-field-label">Property</div>
                <div className="compare-field-value compare-field-name">{hotel.name}</div>
              </div>

              <div className="compare-field">
                <div className="compare-field-label">Location</div>
                <div className="compare-field-value">
                  {hotel.area}, {hotel.city}
                </div>
              </div>

              <div className="compare-field">
                <div className="compare-field-label">Star classification</div>
                <div className="compare-field-value">{hotel.starRating}-star</div>
              </div>

              <div className="compare-field compare-field-source">
                <div className="compare-field-label">Source</div>
                <div className="compare-field-value">RateManifest curated catalog</div>
              </div>

              <Link
                href={`/check-iq?hotel=${hotel.id}&checkin=${checkIn}&checkout=${checkOut}${tripQuery}&authorized=1`}
                className="btn btn-block compare-cta"
              >
                Analyse with RateManifest IQ →
              </Link>
            </div>
          ))}
        </div>
      </div>

      <p className="footnote">
        RateManifest hasn&apos;t verified live rates for any property shown here yet — that happens only
        after you choose one to analyse.
      </p>

      <Footer />
    </div>
  );
}
