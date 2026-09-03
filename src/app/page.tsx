import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { browseCity } from "@/lib/browse";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { SearchForm } from "@/components/SearchForm";
import { HeroArt } from "@/components/HeroArt";
import { IconBolt, IconShieldCheck, IconStar, IconScales, IconLink } from "@/components/TrustIcons";
import { KLOOK_HOTELS_LINK } from "@/lib/klook";

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

// Homepage redesign 2026-09-03, matching a full-layout mockup the user
// pasted directly ("this is how i want the homepage layout. same to
// same. exact design.") - see DECISIONS.md, "Homepage redesign: matching
// the pasted mockup," for the full list of what was carried over exactly
// vs. deliberately adapted, and why. Three deliberate departures from the
// mockup, all on integrity grounds rather than taste:
//
// 1. No hero photograph of a specific real place. The mockup used what
//    reads as a real photo of the Dubai skyline; no licensed photography
//    was available, and an AI-generated image *claiming* to depict a real
//    landmark carries its own misrepresentation risk on a live commercial
//    site. HeroArt is an abstract, brand-colored skyline instead - reads
//    as "Gulf coastline at golden hour" without claiming to be a photo of
//    anywhere specific.
// 2. No fabricated trust/review data. The mockup's hotel cards show star
//    ratings with review counts (e.g. "4.8 (12,456 reviews)") and blanket
//    "Verified"/breakfast/cancellation tags. This app has no review data
//    at all, and StayingAPI itself doesn't return real cancellation terms
//    (see stayingApiRefresh.ts) - so only this app's own real starRating
//    integer and a genuinely computed "below average" badge (this hotel's
//    cheapest cached offer vs. the average of its own other cached
//    offers, never a fabricated "market rate") are shown. See
//    src/lib/browse.ts, percentBelowAverage/hasFreeCancellationOffer.
// 3. No competitor logos, and no "RATE MANIFEST VERDICT"/"Smart Insights"
//    panel. The footer's own disclosure text already says this site is
//    "not affiliated with or endorsed by Booking.com, Expedia, Agoda,
//    Hotels.com, or Trip.com" - a "Trusted Partners" logo row naming those
//    same companies would contradict that in the same footer, and Tiqets
//    isn't integrated here at all. The Verdict/Smart Insights block (a
//    92/100 score, a 14-day price trend, a room-upgrade price, a location
//    score) is exactly the Decision Intelligence feature set scoped
//    separately in claude/decision-intelligence-roadmap.md - none of it
//    has real data behind it yet (price history is sparse, there's no
//    geo dataset, room-type depth isn't confirmed), so it isn't shown
//    with invented numbers here. Built once that roadmap's Phase 1/2 data
//    actually exists.
export default async function HomePage() {
  const checkIn = defaultCheckIn();
  const checkOut = defaultCheckOut();

  const hotels = await db.query.hotels.findMany({ orderBy: asc(schema.hotels.name) });

  // Real data only, zero extra StayingAPI credits - browseCity() only
  // ever reads whatever's already cached for this exact date pair (see
  // its own comment). Dubai first since it's this catalog's largest
  // emirate; capped at 4 to match the mockup's grid without pretending a
  // "curated top 4" ranking beyond star rating (browseCity's own sort).
  const dubai = await browseCity("Dubai", checkIn, checkOut);
  const topHotels = dubai.hotels.slice(0, 4);

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

        <div className="home-search-card">
          <SearchForm
            hotels={hotels.map((h) => ({
              id: h.id,
              name: h.name,
              area: h.area,
              city: h.city,
              starRating: h.starRating,
            }))}
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
            <Link href="/browse?city=Dubai" className="explore-card explore-card-hotels">
              <div className="explore-card-eyebrow">Hotels</div>
              <h3>Top Hotels in Dubai</h3>
              <p>Compare rates. Check availability. Book with confidence.</p>
              <span className="explore-card-cta">View Hotels →</span>
            </Link>
            <a
              href={KLOOK_HOTELS_LINK}
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
              <h2>Top Hotels in Dubai</h2>
              <p>Real properties. Real checked rates where we have them.</p>
            </div>
            <Link href="/browse?city=Dubai" className="section-view-all">
              View all hotels →
            </Link>
          </div>

          {topHotels.length === 0 ? (
            <p className="empty-state">No properties in this catalog yet.</p>
          ) : (
            <div className="hotel-grid home-hotel-grid">
              {topHotels.map((hotel) => (
                <Link
                  key={hotel.id}
                  href={`/search?hotel=${hotel.id}&checkin=${checkIn}&checkout=${checkOut}`}
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
                  <span className="btn btn-block home-hotel-card-cta">View rates →</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="home-klook-band">
          <div>
            <div className="explore-card-eyebrow">More than just hotels</div>
            <h3>Discover tours, activities, and experiences in Dubai</h3>
          </div>
          <a href={KLOOK_HOTELS_LINK} target="_blank" rel="noopener noreferrer sponsored" className="btn btn-ghost">
            Explore Things To Do →
          </a>
        </section>

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
