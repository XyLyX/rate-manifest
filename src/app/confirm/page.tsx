import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getTrip, getLatestTripSelection, getTripExperiences } from "@/lib/trip";
import { getDealSignal } from "@/lib/scoring/dealSignal";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

interface ConfirmPageProps {
  searchParams: Promise<{ trip?: string }>;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

// Page 4 of the four-page customer journey - Confirm & Book, the final
// summary screen. See claude/travel-decision-platform-assessment.md,
// "RateManifest — Final Customer Journey": Hotel / Stay / Selected Rate /
// RateManifest Verdict / Experiences / Estimated Trip Total, then a single
// "CONFIRM & BOOK →" primary action that goes to the selected rate's own
// deep link - "RateManifest does not process payment or become the
// merchant of record for the hotel booking... this is fundamentally an
// outbound affiliate/deep-link transaction," exactly as BeforeYouBookPanel
// already states on Page 2. Nothing new is invented here: every field
// below is read back from what Pages 1-3 already wrote (trips,
// trip_selections, trip_experiences, and the verdicts row Page 2's
// Decision Audit Trail produced) - this page is a summary, not a new
// computation.
export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const tripId = (await searchParams).trip;

  if (!tripId) {
    return (
      <div className="shell">
        <p className="empty-state">
          No trip in progress. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  const trip = await getTrip(tripId);
  const selection = trip ? await getLatestTripSelection(tripId) : null;

  if (!trip || !selection) {
    return (
      <div className="shell">
        <p className="empty-state">
          {trip
            ? "You haven't selected a rate on this trip yet."
            : "We couldn't find that trip."}{" "}
          <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, selection.hotelId) });
  const experiences = await getTripExperiences(tripId);
  const nights = nightsBetween(trip.checkIn, trip.checkOut);

  // The Decision Audit Trail row Page 2 wrote when this rate was on
  // screen (src/lib/verdict.ts) - re-read here, never re-computed, so
  // Page 4's "why we recommended this" matches exactly what the customer
  // actually saw when they selected it. Absent only if recordVerdict()
  // itself failed at the time (it never throws) or this trip predates the
  // verdictId column being wired through - both handled by simply
  // omitting the panel rather than guessing.
  const verdict = selection.verdictId
    ? await db.query.verdicts.findFirst({ where: eq(schema.verdicts.id, selection.verdictId) })
    : null;
  const signal = verdict ? getDealSignal(verdict.score) : null;

  const experiencesTotal = experiences.reduce((sum, e) => sum + (e.price ?? 0), 0);
  const estimatedTotal = selection.totalPrice + experiencesTotal;

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />

      <div className="confirm-summary">
        <div className="your-hotel-eyebrow">Confirm &amp; book</div>

        <div className="confirm-summary-block">
          <div className="confirm-summary-label">Hotel</div>
          <div className="confirm-summary-value confirm-summary-value-lg">{hotel?.name ?? "—"}</div>
          {hotel && (
            <div className="your-hotel-meta">
              {hotel.area}, {hotel.city} · {hotel.starRating}-star
            </div>
          )}
        </div>

        <div className="confirm-summary-block">
          <div className="confirm-summary-label">Stay</div>
          <div className="confirm-summary-value">
            {trip.checkIn} → {trip.checkOut} · {nights} night{nights === 1 ? "" : "s"}
          </div>
          <div className="your-hotel-meta">
            {trip.adults} adult{trip.adults === 1 ? "" : "s"}
            {trip.children > 0 ? `, ${trip.children} child${trip.children === 1 ? "" : "ren"}` : ""} ·{" "}
            {trip.rooms} room{trip.rooms === 1 ? "" : "s"}
          </div>
        </div>

        <div className="confirm-summary-block">
          <div className="confirm-summary-label">Selected rate</div>
          <div className="confirm-summary-value">
            {selection.supplierName} · AED {Math.round(selection.totalPrice).toLocaleString("en-AE")}
          </div>
        </div>

        {verdict && signal && (
          <div className="confirm-summary-block confirm-verdict-block">
            <div className="confirm-summary-label">RateManifest Verdict</div>
            <div className={`confirm-verdict-action confirm-verdict-${signal.tier}`}>{signal.action}</div>
            <p className="confirm-verdict-note">
              {signal.verdict} Based on {verdict.sourcesChecked} source{verdict.sourcesChecked === 1 ? "" : "s"}{" "}
              checked at the time you selected this rate.
            </p>
          </div>
        )}

        <div className="confirm-summary-block">
          <div className="confirm-summary-label">Experiences</div>
          {experiences.length === 0 ? (
            <p className="your-hotel-meta">None added — this trip is hotel-only.</p>
          ) : (
            <ul className="confirm-experiences-list">
              {experiences.map((e) => (
                <li key={e.id}>
                  <span>{e.title}</span>
                  {e.price != null && (
                    <span className="confirm-experience-price">
                      {e.currency} {Math.round(e.price).toLocaleString("en-AE")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="confirm-summary-block confirm-total-block">
          <div className="confirm-summary-label">Estimated trip total</div>
          <div className="confirm-summary-value confirm-summary-value-lg">
            AED {Math.round(estimatedTotal).toLocaleString("en-AE")}
          </div>
          <p className="your-hotel-meta">
            The hotel rate above is what {selection.supplierName} verified; experience prices are what Viator
            showed when added. This is an estimate, not a single combined charge — you complete each booking
            separately on the source it comes from.
          </p>
        </div>

        <a className="btn confirm-cta" href={selection.deepLink} target="_blank" rel="noopener noreferrer">
          Confirm &amp; book →
        </a>
        <p className="confirm-disclosure">
          RateManifest doesn&apos;t process payment or hold your reservation — this takes you to{" "}
          {selection.supplierName} to complete the booking on their site.
        </p>

        {experiences.length > 0 && (
          <div className="confirm-experience-links">
            <div className="confirm-summary-label">Book your experiences</div>
            {experiences.map((e) => (
              <a key={e.id} className="btn btn-ghost confirm-experience-link" href={e.bookingUrl} target="_blank" rel="noopener noreferrer">
                {e.title} →
              </a>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
