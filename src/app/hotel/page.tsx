import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { browseHotel } from "@/lib/browse";
import { humanizeRoomType } from "@/lib/roomType";
import { YourHotelSummary } from "@/components/YourHotelSummary";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

// The "Analyse This Hotel" gate - see DECISIONS.md, "The Analyse This
// Hotel gate (2026-09-03)." Before this existed, the homepage's Top
// Hotels grid, the /browse grid, and SearchForm all linked straight into
// /search, which triggers ensureLiveCheckTriggered() on page load - so
// simply landing on a hotel's page and spending a StayingAPI credit were
// the same action, with no moment where a visitor is just browsing. This
// page is that moment: everything shown here is a zero-credit, cache-only
// read (browseHotel(), the same function the homepage's Top Hotels grid
// and /browse already use) - nothing here ever calls StayingAPI live.
// "Analyse This Hotel" is the one link on this page that goes to /search,
// which is unchanged and is the only place a credit gets spent.
interface HotelPageProps {
  searchParams: Promise<{ hotel?: string; checkin?: string; checkout?: string }>;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

export default async function HotelPage({ searchParams }: HotelPageProps) {
  const params = await searchParams;
  const hotelId = params.hotel;
  const checkIn = params.checkin;
  const checkOut = params.checkout;

  if (!hotelId || !checkIn || !checkOut) {
    return (
      <div className="shell">
        <p className="empty-state">
          Missing search details. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

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

  const room = await db.query.rooms.findFirst({ where: eq(schema.rooms.hotelId, hotel.id) });
  const preview = await browseHotel(hotel.id, checkIn, checkOut);
  const nights = nightsBetween(checkIn, checkOut);
  const analyseHref = `/search?hotel=${hotel.id}&checkin=${checkIn}&checkout=${checkOut}`;

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />

      {hotel.isMockData && (
        <div className="demo-banner">
          Demo mode — {hotel.name}&apos;s prices are simulated for this prototype, not live rates from these
          sources.
        </div>
      )}

      <YourHotelSummary
        hotelName={hotel.name}
        area={hotel.area}
        city={hotel.city}
        starRating={hotel.starRating}
        checkIn={checkIn}
        checkOut={checkOut}
        nights={nights}
        occupancy={room?.occupancy ?? 2}
        roomTypeLabel={room ? humanizeRoomType(room.normalizedType) : "Standard room"}
      />

      <div className="analyse-gate-panel">
        <div className="analyse-gate-body">
          <div className="analyse-gate-title">Ready to see the full picture?</div>
          <p className="analyse-gate-copy">
            {preview?.cheapestTotal != null ? (
              <>
                We already have a cached rate from {preview.sourcesChecked} source
                {preview.sourcesChecked === 1 ? "" : "s"}: from AED{" "}
                {Math.round(preview.cheapestTotal).toLocaleString("en-AE")}.{" "}
              </>
            ) : (
              "We haven't checked live prices for these exact dates yet. "
            )}
            Analysing this hotel runs a real-time comparison and RateManifest&apos;s full price assessment for
            these exact dates.
          </p>
          {preview && (preview.percentBelowAverage != null || preview.hasFreeCancellationOffer) && (
            <div className="home-hotel-card-badges">
              {preview.percentBelowAverage != null && (
                <span className="home-hotel-badge home-hotel-badge-good">
                  {preview.percentBelowAverage}% below comparable rates
                </span>
              )}
              {preview.hasFreeCancellationOffer && <span className="home-hotel-badge">Free cancellation</span>}
            </div>
          )}
        </div>
        <Link className="btn analyse-gate-cta" href={analyseHref}>
          Analyse This Hotel →
        </Link>
      </div>

      <p className="footnote">
        Browsing here is always free. RateManifest only checks a live rate once you ask it to analyse a
        specific hotel for specific dates.
      </p>

      <Footer />
    </div>
  );
}
