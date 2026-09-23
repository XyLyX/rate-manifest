import Link from "next/link";
import { db, schema } from "@/db/client";
import { getTrip } from "@/lib/trip";
import { activeDiscoverySource } from "@/lib/discovery";
import { HotelSelectionGrid } from "@/components/HotelSelectionGrid";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { TravelIntelligence } from "@/components/TravelIntelligence";
import { DiscoverForm } from "@/components/DiscoverForm";
import { AtmosphereProvider } from "@/components/AtmosphereProvider";
import { getDestinationPillarsLive } from "@/lib/travel/destinationResearch";
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
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

// Page 1 of the customer journey - Discover.
//
// Phase A Visual Rebuild (2026-09-16):
//   Globe Hero → Search → Trust Strip → Cost Reality → Smart Choices →
//   Getting There & Around → Local Pulse → What makes Rate Manifest different? → Closing Hero
//
// Opening hero: permanent CSS Earth/globe-from-space (not atmosphere-dependent).
// Four travel intelligence sections: full-width photographic editorial rows driven
// by the session atmosphere system (5 sets, sessionStorage-stable).
// Closing hero: atmosphere hero.jpg.
// Atmosphere system preserved: alpine / tropical / coastal / golden / urban.
// Rambo = internal fallback config (data-atmosphere="rambo") — not exposed publicly.
//
// Discover → Compare → Check IQ → Complete Your Trip journey is unchanged.
// See claude/discovery-property-graph-architecture.md "FROZEN 2026-09-12."
interface HomePageProps {
  searchParams: Promise<{ trip?: string; mode?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const trip = params.trip ? await getTrip(params.trip) : null;
  const mode = params.mode ?? "hotels";

  // PROPERTY DISCOVERY (not inventory): the destinations Rate Manifest has
  // catalogued properties for, and - once a trip exists - that destination's
  // factual property identities (name, area, city, stars, image). The
  // catalogue says nothing about rooms, rates or availability, and this page
  // never touches StayingAPI, supplier adapters or any price source.
  const catalogueCities = await db.select({ city: schema.hotels.city }).from(schema.hotels);
  const cities = Array.from(new Set(catalogueCities.map((r) => r.city))).sort((a, b) => a.localeCompare(b));
  const normalise = (s: string) => s.trim().toLowerCase();
  const tripCity = trip ? cities.find((c) => normalise(c) === normalise(trip.destination)) : undefined;
  // Public affiliate-readiness gate. Keep OFF until Navin explicitly approves reopening hotel discovery.
  // The catalogue, shortlist, Compare and Check IQ remain intact behind this presentation gate.
  const PUBLIC_HOTEL_DISCOVERY_ENABLED = false;
  const shortlistHotels = PUBLIC_HOTEL_DISCOVERY_ENABLED && trip && tripCity
    ? await activeDiscoverySource.search({ destination: tripCity })
    : [];

  const checkIn = trip ? trip.checkIn : defaultCheckIn();
  const checkOut = trip ? trip.checkOut : defaultCheckOut();

  // Travel Intelligence: Gemini-powered destination context (72h cached).
  // Unconditional — fires for every page load; falls back to seed data or
  // honest "not yet researched" state on Gemini failure. No throw.
  const intelResult = await getDestinationPillarsLive(trip?.destination ?? null);

  return (
    <div className="home-page">
      {/* AtmosphereProvider sets data-atmosphere on <html> after mount.
          Client-only; no SSR; no hydration mismatch. */}
      <AtmosphereProvider />

      {/* ── 1. GLOBE HERO ─────────────────────────────────────────────────── */}
      {/* Permanent CSS Earth/space opening — NOT atmosphere-dependent.
          The globe is a pure-CSS radial-gradient sphere. No external image.
          Rambo reference: dark navy/space, illuminated globe, amber accents. */}
      <div className="globe-band">
        {/* Opening hero photograph — master-hero.png, permanent, not in atmosphere rotation */}
        <div className="globe-master-img" aria-hidden="true" />
        {/* Starfield and horizon overlays (photo enhancement layers) */}
        <div className="globe-stars" aria-hidden="true" />
        <div className="globe-horizon" aria-hidden="true" />

        {/* Sticky nav — dark variant sits on the space background */}
        <NavBar variant="home" />

        {/* Hero copy — left-aligned, positioned over the globe */}
        <div className="globe-hero-copy">
          <div className="globe-eyebrow">A Smarter Way to Travel</div>
          <h1 className="globe-h1">
            <span className="globe-h1-line">Travel</span>
            <span className="globe-h1-line">Decision</span>
            <span className="globe-h1-line globe-h1-line--gold">Intelligence</span>
          </h1>
          <p className="globe-sub">Real insights. Smarter choices. Better journeys.</p>
        </div>

        {/* ── 2. SEARCH ────────────────────────────────────────────────────── */}
        {/* Moved INSIDE globe-band so .globe-master-img (position:absolute inset:0)
            covers both the search card and trust strip with the Earth photograph. */}
        <div className="home-search-card">
        <div className="mode-selector">
          <Link
            href="/"
            className={`mode-selector-tab${mode === "hotels" ? " active" : ""}`}
          >
            Hotels
          </Link>
          <Link
            href="/?mode=flights"
            className={`mode-selector-tab${mode === "flights" ? " active" : ""}`}
          >
            Flights
          </Link>
          <Link
            href="/?mode=combined"
            className={`mode-selector-tab${mode === "combined" ? " active" : ""}`}
          >
            Hotels + Flights
          </Link>
          <Link
            href="/?mode=rail"
            className={`mode-selector-tab${mode === "rail" ? " active" : ""}`}
          >
            Rail
          </Link>
        </div>

        {mode === "flights" ? (
          <div className="mode-coming-soon">
            <p className="mode-coming-soon-title">Flight options for your journey</p>
            <p className="mode-coming-soon-body">
              We&apos;re finalising the flight options for this journey and will update you as soon as they&apos;re ready.
            </p>
          </div>
        ) : mode === "rail" ? (
          <div className="mode-coming-soon">
            <p className="mode-coming-soon-title">Rail options for your journey</p>
            <p className="mode-coming-soon-body">
              We&apos;re finalising the rail options for this journey and will update you as soon as they&apos;re ready.
            </p>
          </div>
        ) : mode === "combined" ? (
          <div className="mode-coming-soon">
            <p className="mode-coming-soon-title">Flight + hotel options</p>
            <p className="mode-coming-soon-body">
              We&apos;re finalising the flight and hotel options for this journey and will update you as soon as they&apos;re ready.
            </p>
          </div>
        ) : (
          <>
            <div className="home-search-card-heading">
              <div className="home-search-card-eyebrow">Where do you want to go?</div>
              <p className="home-search-card-sub">
                Tell us where and when — we&apos;ll build destination intelligence while hotel availability is being curated.
              </p>
            </div>
            <DiscoverForm
              cities={cities}
              defaultDestination={trip?.destination ?? ""}
              // Catalogue coverage, not the affiliate-readiness presentation
              // gate above - PUBLIC_HOTEL_DISCOVERY_ENABLED controls whether
              // the shortlist grid is shown, not whether a destination is in
              // the catalogue. Gating this on it too made DiscoverForm's
              // "we're curating this destination" state show for every
              // search, including ones with full catalogue coverage.
              destinationSupported={Boolean(tripCity)}
              defaultCheckIn={checkIn}
              defaultCheckOut={checkOut}
            />
          </>
        )}
        </div>

        {/* ── 3. TRUST STRIP ────────────────────────────────────────────────── */}
        <div className="home-trust-strip">
        <div className="trust-item">
          <IconShieldCheck className="trust-icon" />
          <div className="trust-item-title">Nothing Invented</div>
          <div className="trust-item-sub">Real data. No guesswork.</div>
        </div>
        <div className="trust-item">
          <IconLink className="trust-icon" />
          <div className="trust-item-title">Named Sources</div>
          <div className="trust-item-sub">See where our information comes from.</div>
        </div>
        <div className="trust-item">
          <IconBolt className="trust-icon" />
          <div className="trust-item-title">Decision Intelligence</div>
          <div className="trust-item-sub">Shortlist. Compare. Decide.</div>
        </div>
        </div>

      </div>{/* ── end globe-band ── */}

      {/* ── PROPERTY SHORTLIST ─────────────────────────────────────────────
          Shown once a trip exists for a catalogued destination. Factual
          property identities only: no prices, availability, rates, sellers or
          verdicts - the catalogue is not an inventory or supplier feed. Cards
          toggle selection (up to 5) and carry the chosen ids, with the trip's
          dates/party, into Compare. */}
      {PUBLIC_HOTEL_DISCOVERY_ENABLED && trip && tripCity && shortlistHotels.length > 0 && (
        <div className="home-hiw-wrap" id="shortlist">
          <section className="home-top-hotels">
            <div className="home-section-heading">
              <div>
                <h2>Properties to consider in {tripCity}</h2>
                <p>
                  From Rate Manifest&apos;s property catalogue — factual property details only. Select up to 5 to
                  compare side by side. Rates and availability aren&apos;t shown here.
                </p>
              </div>
            </div>
            <HotelSelectionGrid hotels={shortlistHotels} checkIn={checkIn} checkOut={checkOut} tripId={trip.id} />
          </section>
        </div>
      )}

      {/* ── 4. FOUR FULL-WIDTH EDITORIAL ROWS ────────────────────────────── */}
      {/* Atmosphere images: 5 sets × 4 pillars = 20 assets.
          CSS [data-atmosphere] rules supply background-image for each row.
          Full-width stacked editorial bands — portrait-flow layout.
          No white gaps between rows — rows flow directly into one another. */}
      <div className="intel-rows" id="travel-intelligence">
        {intelResult.cards.map((c) => {
          const ctas: Record<string, string> = {
            "cost-reality":   "Explore cost insights",
            "smart-choices":  "Explore smarter choices",
            "getting-around": "Explore transport insights",
            "local-pulse":    "Explore local insights",
          };
          return (
            <div
              key={c.pillar}
              className={`intel-row intel-row--left pillar-${c.pillar}`}
            >
              {/* Atmosphere background image — set by CSS [data-atmosphere] rules */}
              <div className="intel-row-img" aria-hidden="true" />
              {/* Left-to-right gradient for text legibility */}
              <div className="intel-row-veil intel-row-veil--left" aria-hidden="true" />
              {/* Text panel */}
              <div className="intel-row-text">
                <div className="intel-row-label">{c.label}</div>
                <h2 className="intel-row-title">{c.title}</h2>
                <p className="intel-row-body">{c.body}</p>
                {/* Was a plain <span> with no href/onClick - styled like a
                    link but not actually clickable. Each pillar links to its
                    own dedicated guide at /explore/{pillar} (see
                    src/app/explore/[pillar]/page.tsx) - general, evergreen
                    guidance for this pillar, distinct from these cards'
                    live, destination-specific Gemini text. */}
                <a href={`/explore/${c.pillar}`} className="intel-row-cta">
                  {ctas[c.pillar] ?? "Explore"}
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 5. WHAT MAKES RATE MANIFEST DIFFERENT? ────────────────────────── */}
      {/* Visual pause after four photographic rows.
          Large 01/02/03 numbering, generous whitespace, concise copy. */}
      <div className="home-hiw-wrap">
        <section id="how-it-works" className="how-it-works">
          <h2>What makes Rate Manifest different?</h2>
          <div className="how-it-works-grid">
            <div className="how-card">
              <div className="how-card-num" aria-hidden="true">01</div>
              <div className="how-card-label">Shortlist</div>
              <p>
                Start with a real shortlist of properties in your destination.
                Select up to five to carry forward.
              </p>
            </div>
            <div className="how-card">
              <div className="how-card-num" aria-hidden="true">02</div>
              <div className="how-card-label">Compare</div>
              <p>
                Compare your shortlist side by side on factual property
                details, then choose one.
              </p>
            </div>
            <div className="how-card">
              <div className="how-card-num" aria-hidden="true">03</div>
              <div className="how-card-label">Choose</div>
              <p>
                Pick the hotel you want to continue with. Rate verification is
                currently unavailable.
              </p>
            </div>
          </div>
        </section>

        <p className="footnote">
          Rate Manifest does not currently show hotel rates or availability.
        </p>
      </div>

      <TravelIntelligence />

      {/* ── 6. CLOSING HERO ───────────────────────────────────────────────── */}
      {/* Uses the session atmosphere's hero.jpg — the same asset that was
          the opening cinematic hero before the Globe Hero replaced it.
          CSS [data-atmosphere] rules supply background-image.
          "Rambo" internal fallback: data-atmosphere="rambo" maps to golden/hero. */}
      <div className="closing-hero">
        <div className="closing-hero-img" aria-hidden="true" />
        <div className="closing-hero-veil" aria-hidden="true" />
        <div className="closing-hero-content">
          <p className="closing-eyebrow">A Wider Tomorrow</p>
          <p className="closing-tagline">
            Better decisions.<br />
            A brighter tomorrow.
          </p>
          <p className="closing-sub">Travel with clarity. Return with more.</p>
          <a href="/" className="closing-hero-cta">Start planning</a>
        </div>
      </div>

      <div className="home-footer-wrap">
        <Footer />
      </div>
    </div>
  );
}
