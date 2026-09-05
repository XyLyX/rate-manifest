import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

// Same reason as every other DB-touching page - see src/app/page.tsx.
export const dynamic = "force-dynamic";

function defaultCheckIn(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function defaultCheckOut(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

interface BrowsePageProps {
  searchParams: Promise<{ city?: string; checkin?: string; checkout?: string }>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const checkIn = params.checkin || defaultCheckIn();
  const checkOut = params.checkout || defaultCheckOut();
  const city = params.city;

  // No emirate chosen yet - show the emirate list instead of erroring.
  // Reached directly (e.g. a bookmarked /browse link) as well as from the
  // "Browse all hotels" link on the homepage's emirate-mode search form.
  if (!city) {
    const rows = await db.selectDistinct({ city: schema.hotels.city }).from(schema.hotels);
    const cities = rows.map((r) => r.city).sort((a, b) => a.localeCompare(b));

    return (
      <div className="shell">
        <NavBar ctaLabel="New search" ctaHref="/" />
        <div className="results-header">
          <h1>Browse by emirate</h1>
          <div className="results-meta">Pick an emirate to see every property Rate Manifest covers there.</div>
        </div>
        <div className="emirate-link-grid">
          {cities.map((c) => (
            <Link
              key={c}
              className="emirate-link-card"
              href={`/browse?city=${encodeURIComponent(c)}&checkin=${checkIn}&checkout=${checkOut}`}
            >
              {c}
            </Link>
          ))}
        </div>
        <Footer />
      </div>
    );
  }

  // 2026-09-05 correction (Navin, in chat, the same correction that
  // stripped price data off the homepage's Top Hotels cards - see
  // page.tsx's own comment): browsing by emirate is still pure hotel
  // discovery, not a second, back-door "full intelligence experience."
  // This used to call browseCity(), which - though always cache-only,
  // zero-credit - still surfaced each property's cached price and
  // sources-checked count here, one click away from Page 1 without ever
  // going through Check IQ. Now a plain catalog read (name/area/star
  // rating only, same sort browseCity() used - star rating, then name),
  // with zero contact with the StayingAPI cache. Rates are shown only
  // after Check IQ (Page 2), for the one property actually picked - real
  // prices come from the named sources themselves (IHG, Marriott, Accor,
  // etc.), never a pre-check estimate shown here.
  const hotels = await db.query.hotels.findMany({
    where: eq(schema.hotels.city, city),
    orderBy: [desc(schema.hotels.starRating), asc(schema.hotels.name)],
  });
  const nights = nightsBetween(checkIn, checkOut);

  if (hotels.length === 0) {
    return (
      <div className="shell">
        <NavBar ctaLabel="New search" ctaHref="/" />
        <p className="empty-state">
          No properties found for &quot;{city}&quot;. <Link href="/browse">Choose a different emirate</Link>.
        </p>
        <Footer />
      </div>
    );
  }

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />

      <div className="results-header">
        <h1>{city} hotels</h1>
        <div className="results-meta">
          {hotels.length} propert{hotels.length === 1 ? "y" : "ies"} · {nights} night
          {nights > 1 ? "s" : ""} · {checkIn} → {checkOut}
        </div>
      </div>

      <div className="hotel-grid">
        {hotels.map((hotel) => (
          <Link
            key={hotel.id}
            href={`/check-iq?hotel=${hotel.id}&checkin=${checkIn}&checkout=${checkOut}`}
            className="hotel-card"
          >
            {hotel.isMockData && <span className="hotel-card-demo">Demo</span>}
            <div className="hotel-card-name">{hotel.name}</div>
            <div className="hotel-card-meta">
              {hotel.area} · {hotel.starRating}-star
            </div>
            <span className="btn btn-block">Check IQ →</span>
          </Link>
        ))}
      </div>

      <p className="footnote">
        Rates aren&apos;t shown until you run Check IQ on a specific property - that&apos;s the one moment
        Rate Manifest actually checks the real sources (IHG, Marriott, Accor, and the rest) for those exact
        dates.
      </p>

      <Footer />
    </div>
  );
}
