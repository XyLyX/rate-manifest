import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrip } from "@/lib/trip";
import { chooseJoaliProperty } from "@/app/actions/joali";
import { JOALI_VERIFIED_PROPERTIES } from "@/lib/hotel/joaliDestination";
import { isJoaliStagingEnabled } from "@/lib/hotel/joaliStagingGate";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

interface JoaliPageProps {
  searchParams: Promise<{ trip?: string }>;
}

// GitHub Issue #3 - isolated, staging-only JOALI entry point. Deliberately
// NOT linked from navigation, Discover, or any catalogue surface: JOALI
// properties are never seeded into the hotels catalogue and
// LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED stays false. This page reuses an
// already-created trip's own validated dates/party (no separate date form,
// nothing re-entered) and, on choosing a property, hands off to the exact
// same Complete Your Trip / Confirm steps the catalogue journey uses -
// see src/app/actions/joali.ts.
//
// No resort imagery is used here (none is licensed) - each card is a plain
// text summary only.
export default async function JoaliPage({ searchParams }: JoaliPageProps) {
  // Enforced independently here (not relying on the page being unlinked or
  // noindex, and not relying on chooseJoaliProperty's own check below) -
  // see joaliStagingGate.ts.
  if (!isJoaliStagingEnabled()) notFound();

  const tripId = (await searchParams).trip;

  if (!tripId) {
    return (
      <div className="shell">
        <NavBar />
        <p className="empty-state">
          This page needs an existing trip. <Link href="/">Start a search</Link> first, then return here with
          your trip id.
        </p>
        <Footer />
      </div>
    );
  }

  const trip = await getTrip(tripId);
  if (!trip) {
    return (
      <div className="shell">
        <NavBar />
        <p className="empty-state">
          We couldn&apos;t find that trip. <Link href="/">Start a new search</Link>.
        </p>
        <Footer />
      </div>
    );
  }

  return (
    <div className="shell">
      <NavBar />
      <div className="hero">
        <div className="hero-eyebrow">JOALI (staging)</div>
        <h1>Book directly with JOALI</h1>
        <p>
          {trip.checkIn} → {trip.checkOut} · {trip.adults} adult{trip.adults === 1 ? "" : "s"}
          {trip.children > 0 ? `, ${trip.children} child${trip.children === 1 ? "" : "ren"}` : ""} · {trip.rooms} room
          {trip.rooms === 1 ? "" : "s"}
        </p>
      </div>

      {Object.entries(JOALI_VERIFIED_PROPERTIES).map(([propertyId, property]) => (
        <div className="card" style={{ marginTop: "1.5rem" }} key={propertyId}>
          <h2 className="card-title">{property.name}</h2>
          <p style={{ color: "var(--text-dim)" }}>
            Rate Manifest has no rate, availability or review data for {property.name} - this links directly to
            JOALI&apos;s own reservation site for your trip&apos;s dates and party.
          </p>
          <form action={chooseJoaliProperty}>
            <input type="hidden" name="tripId" value={tripId} />
            <input type="hidden" name="propertyId" value={propertyId} />
            <button type="submit" className="btn">
              Continue to {property.name} →
            </button>
          </form>
          <p className="confirm-disclosure" style={{ marginTop: "0.75rem" }}>
            Rate Manifest doesn&apos;t process payment or hold your reservation. Continuing takes you to JOALI&apos;s
            reservation site via Rate Manifest&apos;s affiliate partner Awin; Rate Manifest may earn a commission.
          </p>
        </div>
      ))}

      <Footer />
    </div>
  );
}
