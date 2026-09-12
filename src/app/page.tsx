import { asc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getTrip } from "@/lib/trip";
import { activeDiscoverySource } from "@/lib/discovery";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { DiscoverForm } from "@/components/DiscoverForm";
import { HotelSelectionGrid } from "@/components/HotelSelectionGrid";
import { HeroArt } from "@/components/HeroArt";
import { IconBolt, IconShieldCheck, IconStar, IconScales, IconLink } from "@/components/TrustIcons";

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

// Page 1 of the customer journey - Discover, see
// claude/travel-decision-platform-assessment.md, "RateManifest — Final
// Customer Journey": destination + dates + guests/rooms + trip intent up
// top (DiscoverForm), a real shortlist of hotels below it. Replaces the
// 2026-09-05 "Sprint 3" reposition (Klook consolidated into one section
// further down the same single page) - that was a mis-scoped reading of
// "reposition, not remove" from the old roadmap doc; the actual requirement
// was this real multi-page journey, not a homepage reshuffle. See
// claude/travel-decision-platform-assessment.md's "four-page spec" section
// for the correction record.
//
// RENUMBERED 2026-09-12 (claude/discovery-property-graph-architecture.md,
// "FROZEN 2026-09-12"): each card used to link straight to Check IQ
// (formerly "Page 2" of the four-page journey). That direct jump is gone -
// the shortlist below is now a selection grid (HotelSelectionGrid), up to
// 5 hotels, feeding the new /compare page. Check IQ is downstream of that
// new page and is now "Page 3" under the frozen numbering; see that
// document for the full Discover -> Compare -> Verify journey and why the
// numbering changed. The hotel list itself is now sourced through
// src/lib/discovery's DiscoverySource abstraction (today: the curated
// catalog) rather than a direct `hotels` query, so a future real discovery
// vendor (Track B) is a one-line swap, not a rewrite of this page.
//
// Homepage visual language (hero art, trust strip, no fabricated
// review/trust data, no competitor logos) is carried over unchanged from
// the 2026-09-03 redesign - see DECISIONS.md, "Homepage redesign: matching
// the pasted mockup," for why those three departures from the original
// mockup exist. Nothing about that visual layer changes here; only the
// search card and the hotel cards' own CTA do.
interface HomePageProps {
  searchParams: Promise<{ trip?: string }>;
}

// 2026-09-05, second correction (Navin, pasting the Page 1 spec back
// verbatim, 4th time, after the first correction still left a default
// shortlist showing on a cold page load): "Results: the page returns a
// shortlisted set of hotels relevant to the customer's SEARCH." A
// shortlist shown before any search was ever submitted isn't a result of
// a search - it's exactly the "how did you reach here and showing 4
// properties" complaint. So this no longer has a default-city fallback or
// a plain ?city= browse mode at all (both used to show a shortlist with
// no search behind it, "for a visitor who lands here without searching" -
// that convenience is what's being removed). The ENTIRE Top Hotels
// section, city tabs included, is now gated on a real `trip` existing -
// i.e. DiscoverForm was actually submitted (createTrip(), src/app/actions/
// trip.ts). Before that, Page 1 is nothing but the search form itself.
export default async function HomePage({ searchParams }: HomePageProps) {
  const hotels = await db.query.hotels.findMany({ orderBy: asc(schema.hotels.name) });
  const cities = Array.from(new Set(hotels.map((h) => h.city))).sort((a, b) => a.localeCompare(b));
  const defaultCity = cities.includes("Dubai") ? "Dubai" : (cities[0] ?? "Dubai");

  const params = await searchParams;
  const trip = params.trip ? await getTrip(params.trip) : null;

  const selectedCity = trip ? trip.destination : defaultCity;
  const checkIn = trip ? trip.checkIn : defaultCheckIn();
  const checkOut = trip ? trip.checkOut : defaultCheckOut();

  // Zero contact with StayingAPI or its cache either way - the active
  // DiscoverySource (today: curatedCatalogSource, a plain catalog read, no
  // supplier adapters - see check-iq/page.tsx's ensureLiveCheckTriggered(),
  // the only place a live, credit-spending check ever happens) - but still
  // computed at all only when a trip exists, so there's nothing to render
  // before a real search happened. No `limit` passed - the frozen Section 2
  // decision is broad exploration on Page 1, capped only by the 5-hotel
  // *selection* limit HotelSelectionGrid enforces, not by how many cards
  // are shown (the pre-2026-09-12 slice(0, 4) cap is gone with it).
  const topHotels = trip ? await activeDiscoverySource.search({ destination: selectedCity, checkIn, checkOut }) : [];

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
        {/* Nothing here at all until a real search has happened - see the
            HomePage doc comment above. No "View all hotels" link (that was
            a side door into a full-city browse with no search behind it -
            removed entirely, /browse itself now just redirects to "/", see
            its own file), and no city-switch tabs (switching city without
            resubmitting the form is exactly the same "results without a
            search" problem - the Destination dropdown in the form above is
            the one way to change it now). */}
        {trip && (
          <section className="home-top-hotels">
            <div className="home-section-heading">
              <div>
                <h2>Top Hotels</h2>
                <p>Real properties in {selectedCity}. Pick one and run Check IQ to see its rates.</p>
              </div>
            </div>

            {topHotels.length === 0 ? (
              <p className="empty-state">No properties in this catalog yet.</p>
            ) : (
              // Deliberately no price, "% below average," free-cancellation badge,
              // or checked/not-checked note anywhere in this grid - all of that is
              // derived from the StayingAPI cache, and Page 1 doesn't touch that
              // cache at all (the frozen "never render price on Page 1" rule).
              // Check IQ (now Page 3) is still where a visitor first sees any rate
              // data - reached only after Page 2 (Compare & Choose) below.
              <HotelSelectionGrid hotels={topHotels} checkIn={checkIn} checkOut={checkOut} tripId={trip.id} />
            )}
          </section>
        )}

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
