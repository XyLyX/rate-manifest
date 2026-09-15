import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getTrip } from "@/lib/trip";
import { activeDiscoverySource } from "@/lib/discovery";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { DiscoverForm } from "@/components/DiscoverForm";
import { HotelSelectionGrid } from "@/components/HotelSelectionGrid";
import { HeroArt } from "@/components/HeroArt";
import { IconBolt, IconShieldCheck, IconLink } from "@/components/TrustIcons";

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
//
// W1A (2026-09-14): copy-only pass — hero headline, eyebrow, subhead,
// search-card heading, trust strip (5→3 items), how-it-works labels.
// No structural, CSS, schema, or routing changes. See DECISIONS.md,
// "W1A — Homepage Copy & Metadata."
//
// W1B (2026-09-14): added static Travel Intelligence editorial section
// (.home-intel) after the trust strip, before how-it-works. Three
// static editorial pieces — no database, no CMS, no API. CSS added to
// globals.css. No other architecture changes.
//
// 2026-09-15 positioning pass: hero subhead broadened to name flights
// coming; mode selector added to search card (Hotels/Flights/Hotels+Flights);
// Flights and combined show a coming-soon panel, not a fake search.
// `mode` param read from URL — default "hotels". topHotels section gated
// on hotels mode so switching to Flights hides hotel results correctly.
interface HomePageProps {
  searchParams: Promise<{ trip?: string; mode?: string }>;
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
  const hotels = await db.query.hotels.findMany({
    orderBy: asc(schema.hotels.name),
  });

  const cities = Array.from(new Set(hotels.map((h) => h.city))).sort((a, b) =>
    a.localeCompare(b)
  );

  const defaultCity = cities.includes("Dubai")
    ? "Dubai"
    : (cities[0] ?? "Dubai");

  const params = await searchParams;
  const trip = params.trip ? await getTrip(params.trip) : null;
  const mode = params.mode ?? "hotels";

  const selectedCity = trip ? trip.destination : defaultCity;
  const checkIn = trip ? trip.checkIn : defaultCheckIn();
  const checkOut = trip ? trip.checkOut : defaultCheckOut();

  // Zero contact with StayingAPI or its cache either way - the active
  // DiscoverySource (today: curatedCatalogSource, a plain catalog read, no
  // supplier adapters - see check-iq/page.tsx's ensureLiveCheckTriggered(),
  // the only place a live, credit-spending check ever happens) - but still
  // computed at all only when a trip exists AND the visitor is in Hotels mode,
  // so there's nothing to render before a real search happened or in the
  // Flights/combined coming-soon states. No `limit` passed - the frozen
  // Section 2 decision is broad exploration on Page 1, capped only by the
  // 5-hotel *selection* limit HotelSelectionGrid enforces, not by how many
  // cards are shown (the pre-2026-09-12 slice(0, 4) cap is gone with it).
  const topHotels = trip && mode === "hotels"
    ? await activeDiscoverySource.search({
        destination: selectedCity,
        checkIn,
        checkOut,
      })
    : [];

  return (
    <div className="home-page">
      <div className="home-hero-band">
         <NavBar variant="home" />

        <div className="home-hero-inner">
          <div className="home-hero-copy">
            <div className="hero-eyebrow">Travel Decision Intelligence</div>
            <h1>
              YOUR NEXT HOLIDAY SHOULDN&apos;T BE A GUESS.
            </h1>
            <p>
              Make better travel decisions across hotels, flights and the
              journey around them — with clearer market context, smarter
              comparisons and rate intelligence before you book.
            </p>
          </div>

          <div className="home-hero-art-wrap">
            <HeroArt />

            <div className="rate-verified-badge">
              <span
                className="rate-verified-badge-icon"
                aria-hidden="true"
              >
                ✓
              </span>

              <div>
                <div className="rate-verified-badge-title">
                  Shortlist, Then Verify
                </div>

                <div className="rate-verified-badge-sub">
                  Rates are checked live once you choose a hotel to analyse.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page 1 (Discover) search card - the real entry point to the
            four-page journey. Submitting DiscoverForm creates a trip
            (createTrip(), src/app/actions/trip.ts) and redirects back here
            with ?trip= set, which then drives the shortlist below. See the
            HomePage doc comment above for how this differs from the
            superseded 2026-09-05 "Sprint 3" single-page reshuffle.
            Mode selector (2026-09-15): Hotels is active; Flights and
            Hotels+Flights show coming-soon panels instead of the search form.
            No fake search, no fake prices — just honest "not yet." */}
        <div className="home-search-card">
          {/* Mode selector tabs */}
          <div className="mode-selector">
            <Link
              href="/"
              className={`mode-selector-tab${mode === "hotels" ? " active" : ""}`}
            >
              Hotels
            </Link>
            <Link
              href="/?mode=flights"
              className={`mode-selector-tab${mode === "flights" ? " active" : " soon"}`}
            >
              Flights{" "}
              {mode !== "flights" && (
                <span className="mode-selector-soon-badge">Soon</span>
              )}
            </Link>
            <Link
              href="/?mode=combined"
              className={`mode-selector-tab${mode === "combined" ? " active" : " soon"}`}
            >
              Hotels + Flights{" "}
              {mode !== "combined" && (
                <span className="mode-selector-soon-badge">Soon</span>
              )}
            </Link>
          </div>

          {mode === "flights" ? (
            <div className="mode-coming-soon">
              <p className="mode-coming-soon-title">Flight search coming soon</p>
              <p className="mode-coming-soon-body">
                We&apos;re building flight intelligence into Rate Manifest — real
                fare comparisons and decision context, not just a booking link.
                Hotels are live now. Flights follow next.
              </p>
            </div>
          ) : mode === "combined" ? (
            <div className="mode-coming-soon">
              <p className="mode-coming-soon-title">
                Hotels + Flights bundles coming soon
              </p>
              <p className="mode-coming-soon-body">
                Combined trip intelligence — hotel rates and flights in one
                decision view — is on the roadmap. Start with a hotel search
                while we build it out.
              </p>
            </div>
          ) : (
            <>
              <div className="home-search-card-heading">
                <div className="home-search-card-eyebrow">
                  Where do you want to go?
                </div>

                <p className="home-search-card-sub">
                  Tell us where and when — we&apos;ll shortlist real hotels and run
                  rate intelligence on whichever one you choose.
                </p>
              </div>

              <DiscoverForm
                cities={cities}
                defaultDestination={trip?.destination ?? ""}
                defaultCheckIn={checkIn}
                defaultCheckOut={checkOut}
              />
            </>
          )}
        </div>
      </div>

      <div className="home-trust-strip">
        <div className="trust-item">
          <IconShieldCheck className="trust-icon" />
          <div className="trust-item-title">Nothing Invented</div>
          <div className="trust-item-sub">
            Rates and details come from named sources.
          </div>
        </div>

        <div className="trust-item">
          <IconLink className="trust-icon" />
          <div className="trust-item-title">Named Sources</div>
          <div className="trust-item-sub">
            Know where the information comes from.
          </div>
        </div>

        <div className="trust-item">
          <IconBolt className="trust-icon" />
          <div className="trust-item-title">Rate Intelligence</div>
          <div className="trust-item-sub">
            Live rate checks when you need to verify.
          </div>
        </div>
      </div>

      <div className="home-content">
        {/* Nothing here at all until a real search has happened in hotels mode
            - see the HomePage doc comment above. No "View all hotels" link
            (that was a side door into a full-city browse with no search behind
            it - removed entirely, /browse itself now just redirects to "/"),
            and no city-switch tabs (switching city without resubmitting the
            form is exactly the same "results without a search" problem - the
            Destination dropdown in the form above is the one way to change
            it now). Hotel results are also suppressed in Flights/combined
            modes (mode-gated topHotels above). */}
        {trip && mode === "hotels" && (
          <section className="home-top-hotels">
            <div className="home-section-heading">
              <div>
                <h2>Top Hotels</h2>
                <p>
                  Real properties in {selectedCity}. Select up to 5 to compare
                  side by side.
                </p>
              </div>
            </div>

            {topHotels.length === 0 ? (
              <p className="empty-state">
                No properties in this catalog yet.
              </p>
            ) : (
              // Deliberately no price, "% below average," free-cancellation badge,
              // or checked/not-checked note anywhere in this grid - all of that is
              // derived from the StayingAPI cache, and Page 1 doesn't touch that
              // cache at all (the frozen "never render price on Page 1" rule).
              // Check IQ (now Page 3) is still where a visitor first sees any rate
              // data - reached only after Page 2 (Compare & Choose) below.
              <HotelSelectionGrid
                hotels={topHotels}
                checkIn={checkIn}
                checkOut={checkOut}
                tripId={trip.id}
              />
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

        {/* W1B: Travel Intelligence editorial section — static, no CMS/DB.
            Always visible (not gated on a trip existing). Three short editorial
            pieces that establish Rate Manifest as a genuine travel decision-
            intelligence product. CSS in globals.css (.home-intel, .intel-card). */}
        <section id="travel-intelligence" className="home-intel">
          <div className="home-intel-header">
            <h2>Travel Intelligence</h2>
            <p>Useful context for better travel decisions.</p>
          </div>

          <div className="home-intel-grid">
            <article className="intel-card">
              <div className="intel-card-label">Pricing</div>

              <h3 className="intel-card-title">
                Why Dubai hotel rates can move so quickly
              </h3>

              <p className="intel-card-body">
                Dubai hotel pricing responds to a tighter set of variables
                than most booking platforms surface. Major events compress
                inventory across entire districts simultaneously — properties
                that don&apos;t host those events still reprice. Seasonal
                patterns are real but not universal. Room inventory is finite,
                and as a property approaches capacity, remaining rooms
                typically reprice — the rate available today may not exist
                tomorrow.
              </p>
            </article>

            <article className="intel-card">
              <div className="intel-card-label">Decisions</div>

              <h3 className="intel-card-title">
                What a hotel rate comparison can miss
              </h3>

              <p className="intel-card-body">
                The lowest displayed number in a rate comparison is rarely the
                complete picture. Taxes, resort fees, and service charges
                appear in different places depending on the source — a higher
                headline rate from one channel can cost less in practice.
                Cancellation terms vary significantly, and some displayed
                rates are for room configurations that don&apos;t precisely
                match your search. Checking actual booking terms before
                deciding is more useful than optimising for the headline
                number.
              </p>
            </article>

            <article className="intel-card">
              <div className="intel-card-label">Location</div>

              <h3 className="intel-card-title">
                DIFC vs Downtown Dubai: which location makes more sense?
              </h3>

              <p className="intel-card-body">
                Both are premium, well-connected Dubai districts — but they
                suit different kinds of trips. DIFC is a purpose-built
                professional district: its Gate District dining and proximity
                to financial institutions make it the natural choice for
                business-focused stays. Downtown Dubai — anchored by the Burj
                Khalifa and Dubai Mall — is the city&apos;s primary leisure hub,
                with a wider spread of hotels and immediate access to retail
                and the waterfront. The choice is usually clear: DIFC for
                work-first stays, Downtown for leisure, mixed itineraries, or
                first-time visits.
              </p>
            </article>
          </div>
        </section>

        <section id="how-it-works" className="how-it-works">
          <h2>What makes Rate Manifest different?</h2>

          <div className="how-it-works-grid">
            <div className="how-card">
              <div className="how-card-label">Shortlist</div>
              <p>
                Start with a real shortlist of properties in your destination.
                Select up to five to carry forward.
              </p>
            </div>

            <div className="how-card">
              <div className="how-card-label">Compare</div>
              <p>
                Same room. Same dates. Real terms. Compare your shortlist side
                by side, then choose one.
              </p>
            </div>

            <div className="how-card">
              <div className="how-card-label">Verify</div>
              <p>
                Run rate intelligence on the hotel you choose and understand
                exactly what the numbers mean.
              </p>
            </div>
          </div>
        </section>

        <p className="footnote">
          Rate Manifest checks every source it has access to and shows its own
          computed summary first — the named supplier and link only appear
          once you choose to reveal one.
        </p>

        <Footer />
      </div>
    </div>
  );
}
