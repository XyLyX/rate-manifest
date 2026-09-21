import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { logEvent } from "@/lib/events";
import { getSessionId } from "@/lib/session";
import { getTrip } from "@/lib/trip";
import { selectProperty } from "@/app/actions/trip";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { JourneyProgress } from "@/components/JourneyProgress";

interface CheckIqPageProps {
  searchParams: Promise<{ hotel?: string; checkin?: string; checkout?: string; trip?: string; authorized?: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

// Check IQ — the traveller's explicit, authorised decision point for ONE hotel.
//
// STAYINGAPI IS QUARANTINED. This page makes ZERO StayingAPI calls and reads
// no StayingAPI cache: it shows the selected hotel's identity, the trip's stay
// context and an honest "rate verification is currently unavailable" state,
// and lets the traveller choose the HOTEL (a property decision - no seller,
// no rate, no price). The previous rate-comparison implementation is
// preserved, dormant, under src/lib/suppliers/ and the quarantined
// components; see src/lib/hotel/stayingApiQuarantine.test.ts.
//
// The authorization gate is unchanged: a fresh entry without authorized=1
// (only Compare's CTA and Confirm's "Return to rate check" supply it) is
// redirected to Compare.
export default async function CheckIqPage({ searchParams }: CheckIqPageProps) {
  const params = await searchParams;
  const hotelId = params.hotel;
  const checkIn = params.checkin;
  const checkOut = params.checkout;
  const tripId = params.trip ?? "";
  const authorized = params.authorized;

  if (!hotelId || !checkIn || !checkOut) {
    return (
      <div className="shell">
        <p className="empty-state">
          Missing search details. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  if (authorized !== "1") {
    const compareUrl =
      `/compare?hotels=${hotelId}&checkin=${checkIn}&checkout=${checkOut}` +
      (tripId ? `&trip=${tripId}` : "");
    redirect(compareUrl);
  }

  const trip = tripId ? await getTrip(tripId) : null;
  const adults = trip?.adults ?? 2;
  const children = trip?.children ?? 0;
  const rooms = trip?.rooms ?? 1;

  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, hotelId) });
  if (!hotel) {
    return (
      <div className="shell">
        <p className="empty-state">
          That property wasn&apos;t found. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  const sessionId = await getSessionId();
  await logEvent({ type: "search", sessionId, hotelId, metadata: { checkIn, checkOut, tripId: tripId || null } });

  const nights = nightsBetween(checkIn, checkOut);
  const compareHref = `/compare?hotels=${hotelId}&checkin=${checkIn}&checkout=${checkOut}${tripId ? `&trip=${tripId}` : ""}`;

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />
      <JourneyProgress step={3} />

      <div className="your-hotel-panel">
        <div className="your-hotel-eyebrow">Your Hotel</div>
        <div className="your-hotel-name">{hotel.name}</div>
        <div className="your-hotel-meta">
          {hotel.area}, {hotel.city} · {hotel.starRating}-star
        </div>
        <div className="your-hotel-stats">
          <div>
            <span className="your-hotel-stat-label">Dates</span>
            <span className="your-hotel-stat-value">
              {checkIn} → {checkOut}
            </span>
          </div>
          <div>
            <span className="your-hotel-stat-label">Length of stay</span>
            <span className="your-hotel-stat-value">
              {nights} night{nights === 1 ? "" : "s"}
            </span>
          </div>
          <div>
            <span className="your-hotel-stat-label">Guests</span>
            <span className="your-hotel-stat-value">
              {adults} adult{adults === 1 ? "" : "s"}
              {children > 0 ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}
            </span>
          </div>
          <div>
            <span className="your-hotel-stat-label">Rooms</span>
            <span className="your-hotel-stat-value">
              {rooms} room{rooms === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      <div className="confirm-route-block confirm-route-inquiry">
        <div className="confirm-route-label">Rate verification</div>
        <p className="confirm-route-note">Rate verification is currently unavailable.</p>
        <p className="confirm-route-reason">
          RateManifest isn&apos;t showing rates, availability or price comparisons for this hotel right now, and won&apos;t
          estimate them. You can still choose this hotel and continue planning your trip.
        </p>
      </div>

      <div className="complete-trip-actions">
        <form action={selectProperty}>
          <input type="hidden" name="tripId" value={tripId} />
          <input type="hidden" name="hotelId" value={hotel.id} />
          <input type="hidden" name="hotelCity" value={hotel.city} />
          <input type="hidden" name="checkIn" value={checkIn} />
          <input type="hidden" name="checkOut" value={checkOut} />
          <button className="btn" type="submit">
            Choose this hotel →
          </button>
        </form>
        <Link className="btn btn-ghost" href={compareHref}>
          ← Back to compare
        </Link>
      </div>

      <Footer />
    </div>
  );
}
