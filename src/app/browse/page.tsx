import Link from "next/link";
import { db, schema } from "@/db/client";
import { browseCity } from "@/lib/browse";
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

  const result = await browseCity(city, checkIn, checkOut);

  if (result.hotels.length === 0) {
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
          {result.hotels.length} propert{result.hotels.length === 1 ? "y" : "ies"} · {result.nights} night
          {result.nights > 1 ? "s" : ""} · {checkIn} → {checkOut}
        </div>
      </div>

      <div className="hotel-grid">
        {result.hotels.map((hotel) => (
          <Link
            key={hotel.id}
            href={`/search?hotel=${hotel.id}&checkin=${checkIn}&checkout=${checkOut}`}
            className="hotel-card"
          >
            {hotel.isMockData && <span className="hotel-card-demo">Demo</span>}
            <div className="hotel-card-name">{hotel.name}</div>
            <div className="hotel-card-meta">
              {hotel.area} · {hotel.starRating}-star
            </div>
            <div className="hotel-card-price">
              {hotel.cheapestTotal != null ? (
                <>
                  <span className="hotel-card-price-amount">
                    AED {Math.round(hotel.cheapestTotal).toLocaleString("en-AE")}
                  </span>
                  <span className="hotel-card-price-note">
                    {hotel.sourcesChecked} source{hotel.sourcesChecked === 1 ? "" : "s"} checked
                  </span>
                </>
              ) : (
                <span className="hotel-card-price-note">Not checked for these dates yet</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <p className="footnote">
        A price here means Rate Manifest has already checked these exact dates for that property.
        &quot;Not checked for these dates yet&quot; means it genuinely hasn&apos;t - not that nothing was
        available. Demo properties always show a simulated price for any date; see each one&apos;s own page
        for the full comparison and Rate Signal.
      </p>

      <Footer />
    </div>
  );
}
