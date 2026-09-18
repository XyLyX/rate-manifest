import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getTrip, getLatestTripSelection, getTripExperiences } from "@/lib/trip";
import { getDealSignal } from "@/lib/scoring/dealSignal";
import { resolveCommercialRoute } from "@/lib/commercial";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { JourneyProgress } from "@/components/JourneyProgress";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

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
//
// Track F (2026-09-13): replaced the hard-coded `selection.deepLink` CTA
// with a call to resolveCommercialRoute(tripId) from Track D's commercial
// router (src/lib/commercial/index.ts). The router is the SOLE authority
// on the booking URL and route type — this page never constructs a booking
// URL or accesses selection.deepLink directly. Four route outcomes:
//   affiliate_outbound / direct_outbound → CTA with route.bookingUrl
//   inquiry_only                         → rate verified, no direct route
//   unavailable (or router returns null) → explanation, return-to-check CTA
// Also added JourneyProgress at step 5.
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

  // Track D commercial router — the SOLE authority on booking URL and
  // route type. Returns null only when no selection exists for the trip
  // (already guarded above), so null here means the router itself hit an
  // unrecoverable error (treated identically to routeType === "unavailable").
  // resolveCommercialRoute reads the same trip_selections row via
  // getLatestTripSelection internally — consistent with what we read above.
  const route = await resolveCommercialRoute(tripId);

  // Summed as one total on the assumption both are in the same currency -
  // true today (the hotel rate is always AED-filtered, and Page 3 always
  // requests Viator experiences in "AED" too, see complete-your-trip/
  // page.tsx), but nothing here actually checks that assumption still
  // holds if either source's currency choice ever changes independently.
  const experiencesTotal = experiences.reduce((sum, e) => sum + (e.price ?? 0), 0);
  const estimatedTotal = selection.totalPrice + experiencesTotal;

  // Human-readable explanation for each unavailable reason, shown in the
  // unavailable route block so the customer understands why they can't book
  // directly from here rather than seeing a generic error.
  function unavailableMessage(
    reason?: "supplier_rates_only" | "no_booking_url" | "property_not_mappable" | "affiliate_unavailable" | "supplier_inactive"
  ): string {
    switch (reason) {
      case "supplier_rates_only":
        return "This supplier's rates are verified by RateManifest but booking must be completed directly on their site — visit the supplier's website to complete your booking.";
      case "no_booking_url":
        return "A direct booking link for this rate isn't available. Visit the supplier's website to book.";
      case "property_not_mappable":
        return "This property couldn't be matched to a direct booking destination. Search for it on the supplier's site to complete your booking.";
      case "affiliate_unavailable":
        return "The affiliate booking route for this supplier isn't active right now. Visit the supplier's site directly.";
      case "supplier_inactive":
        return "This supplier is no longer active on RateManifest. You may still book directly through their own website.";
      default:
        return "A verified booking route for this rate isn't available right now. You can search for the same property directly on the supplier's site.";
    }
  }

  const isBookable =
    route !== null &&
    (route.routeType === "affiliate_outbound" || route.routeType === "direct_outbound") &&
    route.bookingUrl !== null;

  const isInquiryOnly = route !== null && route.routeType === "inquiry_only";
  const isUnavailable = route === null || route.routeType === "unavailable";

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />
      <JourneyProgress step={5} />

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
            {selection.supplierName} · {selection.currency} {Math.round(selection.totalPrice).toLocaleString("en-AE")}
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
            {selection.currency} {Math.round(estimatedTotal).toLocaleString("en-AE")}
          </div>
          <p className="your-hotel-meta">
            The hotel rate above is what {selection.supplierName} verified; experience prices are what Viator
            showed when added. This is an estimate, not a single combined charge — you complete each booking
            separately on the source it comes from.
          </p>
        </div>

        {/* ── Commercial route — Track D integration ────────────────────────
            resolveCommercialRoute() is the sole authority on the booking
            URL. Three outcome branches: bookable, inquiry-only, unavailable.
            selection.deepLink is never used directly here. */}

        {isBookable && route && route.bookingUrl && (
          <>
            <a
              className="btn confirm-cta"
              href={route.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {route.displayLabel} →
            </a>
            <p className="confirm-disclosure">
              RateManifest doesn&apos;t process payment or hold your reservation — this takes you to{" "}
              {route.supplierName} to complete the booking on their site.
              {route.routeType === "direct_outbound" && " No affiliate link is involved."}
            </p>
          </>
        )}

        {isInquiryOnly && route && (
          <div className="confirm-route-block confirm-route-inquiry">
            <div className="confirm-route-label">Booking</div>
            <p className="confirm-route-note">
              RateManifest verified the rate at {route.supplierName}, but a direct booking route
              isn&apos;t available for this provider yet.
            </p>
            <p className="confirm-route-reason">
              Visit {route.supplierName}&apos;s website directly to complete your booking using the rate
              details shown above.
            </p>
          </div>
        )}

        {isUnavailable && (
          <div className="confirm-route-block confirm-route-unavailable">
            <div className="confirm-route-label">Booking</div>
            <p className="confirm-route-note">
              {unavailableMessage(route?.unavailableReason)}
            </p>
            <Link
              href={`/check-iq?hotel=${selection.hotelId}&checkin=${trip.checkIn}&checkout=${trip.checkOut}&trip=${tripId}`}
              className="btn btn-ghost"
            >
              ← Return to rate check
            </Link>
          </div>
        )}

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
