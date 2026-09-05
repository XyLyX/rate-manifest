import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { browseCity } from "@/lib/browse";
import { getTrip } from "@/lib/trip";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { DiscoverForm } from "@/components/DiscoverForm";
import { HeroArt } from "@/components/HeroArt";
import { IconBolt, IconShieldCheck, IconStar, IconScales, IconLink } from "@/components/TrustIcons";
import { KLOOK_LINK } from "@/lib/klook";

// Forces this page to render per-request instead of at build time. Without
// this, Next tries to prerender it during `next build`, which means the
// database has to exist and be reachable *at build time* — on Netlify that
// build runs before the DB is guaranteed to be migrated/seeded, so a build
// with an empty database fails outright instead of deploying and serving a
// (temporarily broken) page. See DECISIONS.md, "Bug: the migration never
// actually ran."
export const dynamic = "force-dynamic";

function defaultCheckIn(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function defaultCheckOut(): string {
  // One night by default - the day after defaultCheckIn(). SearchForm
  // keeps this relationship live after page load too: changing check-in
  // there pushes check-out to the next day whenever the existing value
  // would otherwise land on or before the new check-in.
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

// Page 1 of the four-page customer journey - Discover, see
// claude/travel-decision-platform-assessment.md, "RateManifest — Final
// Customer Journey": destination + dates + guests/rooms + trip intent up
// top (DiscoverForm), a real shortlist of hotels below it, each with its
// own "Check IQ →" tab that carries the visitor (and, once the form below
// has been submitted, a trip id) on to Page 2. Replaces the 2026-09-05
// "Sprint 3" reposition (Klook consolidated into one section further down
// the same single page) - that was a mis-scoped reading of "reposition,
// not remove" from the old roadmap doc; the actual requirement was this
// real multi-page journey, not a homepage reshuffle. See
// claude/travel-decision-platform-assessment.md's "four-page spec" section
// for the correction record.
//
// Homepage visual language (hero art, trust strip, no fabricated
// review/trust data, no competitor logos) is carried over unchanged from
// the 2026-09-03 redesign - see DECISIONS.md, "Homepage redesign: matching
// the pasted mockup," for why those three departures from the original
// mockup exist. Nothing about that visual layer changes here; only the
// search card and the hotel cards' own CTA do.
interface HomePageProps {
  searchParams: Promise<{ city?: string; trip?: string }>;
}

// City-aware shortlist (2026-09-04, see DECISIONS.md, "Top Hotels made
// city-aware") is now driven by two possible sources of truth: an active
// trip (?trip=<id>, created by DiscoverForm's submit - the authoritative
// path once a visitor has actually searched) or, absent one, the older
// plain ?city= link and the Dubai/first-city default - preserved so a
// visitor who lands here without searching (a bookmark, a shared link,
// simply opening the homepage) still sees a real, useful shortlist rather
// than an empty "search first" page. Once a trip exists, its own
// destination/dates become authoritative and the plain city-tab quick
// switch steps aside - the point of submitting the form is that it's now
// driving what's shown, not competing with it.
export default async function HomePage({ searchParams }: HomePageProps) {
  const hotels = await db.query.hotels.findMany({ orderBy: asc(schema.hotels.name) });
  const cities = Array.from(new Set(hotels.map((h) => h.city))).sort((a, b) => a.localeCompare(b));
  const defaultCity = cities.includes("Dubai") ? "Dubai" : (cities[0] ?? "Dubai");

  const params = await searchParams;
  const trip = params.trip ? await getTrip(params.trip) : null;

  const requestedCity = params.city;
  const selectedCity = trip
    ? trip.destination
    : requestedCity && cities.includes(requestedCity)
      ? requestedCity
      : defaultCity;
  const checkIn = trip ? trip.checkIn : defaultCheckIn();
  const checkOut = trip ? trip.checkOut : defaultCheckOut();

  // Real data only, zero extra StayingAPI credits - browseCity() only
  // ever reads whatever's already cached for this exact date pair (see
  // its own comment). Capped at 4 to match the original mockup's grid
  // without pretending a "curated top 4" ranking beyond star rating
  // (browseCity's own sort).
  const cityResult = await browseCity(selectedCity, checkIn, checkOut);
  const topHotels = cityResult.hotels.slice(0, 4);
  const tripQuery = trip ? `&trip=${trip.id}` : "";

  return (
    <div className="home-page">
      <div className="home-hero-band">
        <NavBar variant="home" />

        <div className="home-hero-inner">
          <div className="home-hero-copy">
            <div className="hero-eyebrow">Smarter travel. Better decisions.</div>
            <h1>
              Every rate.
              <br />
              One clear decision.
            </h1>
            <p>
              Compare available hotel offers, normalize the differences, and see which deal actually makes
              sense — before you book.
            </p>
          </div>
          <div className="home-hero-art-wrap">
            <HeroArt />
            <div className="rate-verified-badge">
              <span className="rate-verified-badge-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <div className="rate-verified-badge-title">Rate Verified</div>
                <div className="rate-verified-badge-sub">Real-time prices. Actual availability.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Page 1 (Discover) search card - the real entry point to the
            four-page journey. Submitting DiscoverForm creates a trip
            (createTrip(), src/app/actions/trip.ts) and redirects back here
            with ?trip= set, which then drives the shortlist below. See the
            HomePage doc comment above for how this differs from the
            superseded 2026-09-05 "Sprint 3" single-page reshuffle. */}
        <div className="home-search-card">
          <div className="home-search-card-heading">
            <div className="home-search-card-eyebrow">Start here</div>
            <p className="home-search-card-sub">
              Tell us where and when — we&apos;ll shortlist real properties, then run RateManifest&apos;s full
              rate intelligence on whichever one you want to check.
            </p>
          </div>
          <DiscoverForm
            cities={cities}
            defaultCity={selectedCity}
            defaultCheckIn={checkIn}
            defaultCheckOut={checkOut}
          />
        </div>
      </div>

      <div className="home-trust-strip">
        <div className="trust-item">
          <IconBolt className="trust-icon" />
          <div className="trust-item-title">Real-Time Rates</div>
          <div className="trust-item-sub">Live prices from the sources we check</div>
        </div>
        <div className="trust-item">
          <IconShieldCheck className="trust-icon" />
          <div className="trust-item-title">Verified Availability</div>
          <div className="trust-item-sub">No stale prices shown as current</div>
        </div>
        <div className="trust-item">
          <IconStar className="trust-icon" />
          <div className="trust-item-title">Smart Insights</div>
          <div className="trust-item-sub">Know if it&apos;s a good deal, not just a low one</div>
        </div>
        <div className="trust-item">
          <IconScales className="trust-icon" />
          <div className="trust-item-title">Compare &amp; Save</div>
          <div className="trust-item-sub">Every source checked, side by side</div>
        </div>
        <div className="trust-item">
          <IconLink className="trust-icon" />
          <div className="trust-item-title">Named Sources</div>
          <div className="trust-item-sub">Every offer links back to where it came from</div>
        </div>
      </div>

      <div className="home-content">
        <section id="explore" className="home-explore">
          <div className="home-section-heading">
            <div>
              <h2>Explore Dubai</h2>
              <p>From verified hotel rates to real activities, plan the trip with real data behind it.</p>
            </div>
            <Link href="/browse?city=Dubai" className="section-view-all">
              View all →
            </Link>
          </div>
          <div className="explore-grid">
            <Link
              href={`/browse?city=${encodeURIComponent(selectedCity)}`}
              className="explore-card explore-card-hotels"
            >
              <div className="explore-card-eyebrow">Hotels</div>
              <h3>Top Hotels</h3>
              <p>Compare rates. Check availability. Book with confidence.</p>
              <span className="explore-card-cta">View Hotels →</span>
            </Link>
            <a
              href={KLOOK_LINK}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="explore-card explore-card-things"
            >
              <div className="explore-card-eyebrow">Things To Do</div>
              <h3>Iconic Experiences</h3>
              <p>
                Tours, attractions, and activities from Klook — a separate partner, booked and paid for on
                Klook.
              </p>
              <span className="explore-card-cta">Explore Activities →</span>
            </a>
          </div>
        </section>

        <section className="home-top-hotels">
          <div className="home-section-heading">
            <div>
              <h2>Top Hotels</h2>
              <p>Real properties. Real checked rates where we have them.</p>
            </div>
            <Link href={`/browse?city=${encodeURIComponent(selectedCity)}`} className="section-view-all">
              View all hotels →
            </Link>
          </div>

          {cities.length > 1 && (
            <div className="home-city-tabs" role="tablist" aria-label="City">
              {cities.map((city) => (
                <Link
                  key={city}
                  href={city === defaultCity ? "/" : `/?city=${encodeURIComponent(city)}`}
                  className={city === selectedCity ? "home-city-tab active" : "home-city-tab"}
                  role="tab"
                  aria-selected={city === selectedCity}
                >
                  {city}
                </Link>
              ))}
            </div>
          )}

          {topHotels.length === 0 ? (
            <p className="empty-state">No properties in this catalog yet.</p>
          ) : (
            <div className="hotel-grid home-hotel-grid">
              {topHotels.map((hotel) => (
                <Link
                  key={hotel.id}
                  href={`/check-iq?hotel=${hotel.id}&checkin=${checkIn}&checkout=${checkOut}${tripQuery}`}
                  className="hotel-card home-hotel-card"
                >
                  <div className="home-hotel-card-image" aria-hidden="true">
                    <span>{hotel.name.charAt(0)}</span>
                  </div>
                  {hotel.isMockData && <span className="hotel-card-demo">Demo</span>}
                  <div className="hotel-card-name">{hotel.name}</div>
                  <div className="hotel-card-meta">
                    {hotel.area} · {hotel.starRating}-star
                  </div>
                  {(hotel.percentBelowAverage != null || hotel.hasFreeCancellationOffer) && (
                    <div className="home-hotel-card-badges">
                      {hotel.percentBelowAverage != null && (
                        <span className="home-hotel-badge home-hotel-badge-good">
                          {hotel.percentBelowAverage}% below comparable rates
                        </span>
                      )}
                      {hotel.hasFreeCancellationOffer && (
                        <span className="home-hotel-badge">Free cancellation</span>
                      )}
                    </div>
                  )}
                  <div className="hotel-card-price">
                    {hotel.cheapestTotal != null ? (
                      <>
                        <span className="hotel-card-price-amount">
                          AED {Math.round(hotel.cheapestTotal).toLocaleString("en-AE")} / night
                        </span>
                        <span className="hotel-card-price-note">
                          {hotel.sourcesChecked} source{hotel.sourcesChecked === 1 ? "" : "s"} checked
                        </span>
                      </>
                    ) : (
                      <span className="hotel-card-price-note">Not checked for these dates yet</span>
                    )}
                  </div>
                  <span className="btn btn-block home-hotel-card-cta">Check IQ →</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* KlookTripSection ("Complete Your Dubai Trip") removed from the
            homepage 2026-09-05 as part of the four-page journey correction
            - see claude/travel-decision-platform-assessment.md. It briefly
            lived here under the since-superseded "Sprint 3" reshuffle.
            Klook/Viator's real home is now Page 3 (Complete Your Trip,
            src/app/complete-your-trip/page.tsx), reached only AFTER a
            visitor has chosen a hotel and a rate on Page 2 - showing a
            "complete your trip" pitch here, before any hotel is even
            picked, worked against the guided step-by-step journey rather
            than for it. */}

        <section id="how-it-works" className="how-it-works">
          <h2>What makes Rate Manifest different?</h2>
          <div className="how-it-works-grid">
            <div className="how-card">
              <div className="how-card-label">Compare</div>
              <p>Multiple rate sources, checked in one search.</p>
            </div>
            <div className="how-card">
              <div className="how-card-label">Normalize</div>
              <p>Same room. Same dates. Real terms — not a side-by-side of apples and oranges.</p>
            </div>
            <div className="how-card">
              <div className="how-card-label">Decide</div>
              <p>We tell you which deal is actually worth taking, and why.</p>
            </div>
          </div>
        </section>

        <p className="footnote">
          Rate Manifest checks every source it has access to and shows its own computed summary first —
          the named supplier and link only appear once you choose to reveal one.
        </p>

        <Footer />
      </div>
    </div>
  );
}
