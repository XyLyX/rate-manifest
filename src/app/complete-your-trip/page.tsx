import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getTrip, getTripExperiences } from "@/lib/trip";
import { propertyChoiceForTrip } from "@/lib/hotel/journey";
import { searchThingsToDo } from "@/lib/viator/searchThingsToDo";
import { personalizeThingsToDo } from "@/lib/viator/personalize";
import { ThingsToDoSection } from "@/components/ThingsToDoSection";
import { KlookTripSection } from "@/components/KlookTripSection";
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

interface CompleteYourTripPageProps {
  searchParams: Promise<{ trip?: string }>;
}

// Page 3 of the four-page customer journey - Complete Your Trip. Reached
// from Page 2's "Select this deal" action (selectDeal(), see
// src/app/actions/trip.ts), which is why a trip and a real hotel/rate
// selection are both expected to already exist by the time anyone lands
// here - see claude/travel-decision-platform-assessment.md, "RateManifest
// — Final Customer Journey": "Things to do (Viator + Klook)... The
// intelligence engine offers options to plan the trip further... SKIP
// EXPERIENCES → at the bottom."
//
// This is also where ThingsToDoSection's and KlookTripSection's real home
// is now - both used to render at the bottom of the old /search page;
// removed from there (see check-iq/page.tsx's own comment) because
// showing "complete your trip" content before a hotel/rate was even
// chosen worked against the guided step-by-step design. Here, it's the
// right moment: the decision that matters most (Page 2) is already made.
//
// Track F (2026-09-13): added JourneyProgress at step 4. No other changes.
export default async function CompleteYourTripPage({ searchParams }: CompleteYourTripPageProps) {
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
  if (!trip) {
    return (
      <div className="shell">
        <p className="empty-state">
          We couldn&apos;t find that trip. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  // The traveller's explicit HOTEL choice (property decision). No rate,
  // seller or price is required - rate verification is currently unavailable.
  const choice = await propertyChoiceForTrip(tripId);
  const chosenHotel = choice ? await db.query.hotels.findFirst({ where: eq(schema.hotels.id, choice.propertyId) }) : null;
  const experiences = await getTripExperiences(tripId);
  const addedProductIds = new Set(experiences.map((e) => e.supplierProductId));

  // Real destination-level Viator search, same call /search used to make
  // - see searchThingsToDo's own comment on why this is a live per-search
  // call, not a cache read. personalizeThingsToDo() only reorders what
  // comes back; it never adds or invents a product - see that module's
  // own comment.
  const rawProducts = await searchThingsToDo({
    destinationName: trip.destination,
    startDate: trip.checkIn,
    endDate: trip.checkOut,
    // No hotel rate exists any more to take a currency from, so
    // experiences are requested in the application's default display currency.
    currency: "AED",
  });
  const products = personalizeThingsToDo(rawProducts, trip.purpose);

  const confirmHref = `/confirm?trip=${tripId}`;

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />
      <JourneyProgress step={4} />

      {/* "No repeated info" - what was already decided on Page 2, carried
          forward as a read-only recap rather than silently dropped. */}
      {chosenHotel && (
        <div className="trip-context-strip trip-selection-recap">
          <span className="trip-context-item">
            <strong>Your hotel:</strong> {chosenHotel.name}
          </span>
          <span className="trip-context-item">
            {trip.destination} · {trip.checkIn} → {trip.checkOut}
          </span>
        </div>
      )}

      <div className="home-section-heading">
        <div>
          <h2>Complete your trip</h2>
          <p>
            {trip.purpose !== "UNSPECIFIED"
              ? "Picked with your trip in mind — these are real, live results, just reordered to put the closer matches first."
              : "Real activities and experiences for your dates — add any you want, or skip straight to confirming your booking."}
          </p>
        </div>
      </div>

      <ThingsToDoSection products={products} tripId={tripId} addedProductIds={addedProductIds} />

      <KlookTripSection />

      <div className="complete-trip-actions">
        {experiences.length > 0 ? (
          <>
            <Link className="btn" href={confirmHref}>
              Continue to confirm &amp; book →
            </Link>
            <p className="footnote">
              {experiences.length} experience{experiences.length === 1 ? "" : "s"} added to this trip so far.
            </p>
          </>
        ) : (
          <Link className="btn btn-ghost" href={confirmHref}>
            Skip experiences →
          </Link>
        )}
      </div>

      <Footer />
    </div>
  );
}
