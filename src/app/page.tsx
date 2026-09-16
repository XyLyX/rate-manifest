import Link from "next/link";
import { getTrip } from "@/lib/trip";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { DiscoverForm } from "@/components/DiscoverForm";
import { AtmosphereHero } from "@/components/HeroArt";
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
  // One night by default - the day after defaultCheckIn(). SearchForm
  // keeps this relationship live after page load too: changing check-in
  // there pushes check-out to the next day whenever the existing value
  // would otherwise land on or before the new check-in.
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

// Page 1 of the customer journey - Discover.
// Visual system: Phase A atmosphere sets (AtmosphereProvider + AtmosphereHero).
// One of five curated atmosphere sets is chosen per browser session
// (sessionStorage, no DB, no Gemini). The set drives the cinematic hero image
// and the four intelligence-pillar card images via CSS [data-atmosphere] rules.
// AtmosphereProvider sets data-atmosphere on <html> after mount (client-only,
// no hydration instability).
//
// Discover -> Compare -> Check IQ -> Complete Your Trip journey is unchanged.
// See claude/discovery-property-graph-architecture.md "FROZEN 2026-09-12."
//
// W1A (2026-09-14): copy-only pass — hero headline, eyebrow, subhead,
// search-card heading, trust strip (5→3 items), how-it-works labels.
//
// Phase A visual direction (2026-09-16): HeroArt dark-card removed; replaced
// with AtmosphereHero (cinematic full-width image). Hero copy moved into hero
// image overlay. Intel pillar cards become image-led editorial sections.
// Navy + amber + off-white color system. See DECISIONS.md "Phase A Visual."
interface HomePageProps {
  searchParams: Promise<{ trip?: string; mode?: string }>;
}

// 2026-09-05, second correction: Top Hotels section gated on a real `trip`
// existing — i.e. DiscoverForm was actually submitted. Before that, Page 1
// is nothing but the search form itself.
export default async function HomePage({ searchParams }: HomePageProps) {
  // Phase A public shell: the internal curated hotel catalogue is test data,
  // not a live public supplier. Keep destination entry open and do not expose
  // those rows as current hotel inventory until a real Hotel Source is active.
  const cities: string[] = [];

  const params = await searchParams;
  const trip = params.trip ? await getTrip(params.trip) : null;
  const mode = params.mode ?? "hotels";

  const selectedCity = trip?.destination ?? null;
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

      <div className="home-hero-band">
        <NavBar variant="home" />

        {/* Cinematic atmosphere hero — full-width image from CSS.
            Copy + badge overlay sit on top of the image. */}
        <div className="atm-hero-wrap">
          <AtmosphereHero destination={selectedCity} />

          <div className="atm-hero-content">
            <div className="hero-eyebrow">Travel Decision Intelligence</div>
            <h1>
              YOUR NEXT HOLIDAY SHOULDN&apos;T BE A GUESS.
            </h1>
            <p>
              Make better travel decisions across hotels, flights and the
              journey around them — with clearer market context, smarter
              comparisons and rate intelligence before you book.
            </p>

            <div className="rate-verified-badge atm-hero-badge">
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

        {/* Page 1 (Discover) search card — the real entry point to the
            four-page journey. Mode selector: Hotels is active; Flights and
            Hotels+Flights show coming-soon panels instead of the search form.
            No fake search, no fake prices. */}
        <div className="home-search-card">
          {/* Mode selector tabs */}
          <div className="mode-selector">
            <Link href="/" className={`mode-selector-tab${mode === "hotels" ? " active" : ""}`}>
              Hotels
            </Link>
            <Link href="/?mode=flights" className={`mode-selector-tab${mode === "flights" ? " active" : ""}`}>
              Flights
            </Link>
            <Link href="/?mode=combined" className={`mode-selector-tab${mode === "combined" ? " active" : ""}`}>
              Hotels + Flights
            </Link>
            <Link href="/?mode=rail" className={`mode-selector-tab${mode === "rail" ? " active" : ""}`}>
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
                <div className="home-search-card-eyebrow">
                  Where do you want to go?
                </div>

                <p className="home-search-card-sub">
                  Tell us where and when — we&apos;ll build destination intelligence while hotel availability is being curated.
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
        {/* Phase A: no public hotel cards are rendered from the internal curated
            catalogue. */}

        {/* Travel Intelligence: Gemini-powered destination context. Always
            visible — not gated on a trip. Falls back to seed data (Dubai /
            Abu Dhabi) or honest "not yet researched" state; never throws.
            Phase A visual: each pillar card is image-led. The class
            pillar-{c.pillar} activates the atmosphere background image for
            that slot via CSS [data-atmosphere] rules. */}
        <section id="travel-intelligence" className="home-intel">
          <div className="home-intel-header">
            <h2>Travel Intelligence</h2>
            <p>
              {intelResult.destination
                ? `Destination context for ${intelResult.destination}.`
                : "Four dimensions of informed travel decision-making."}
            </p>
          </div>

          <div className="home-intel-grid">
            {intelResult.cards.map((c) => (
              <article key={c.pillar} className={`intel-card pillar-${c.pillar}`}>
                {/* Atmosphere image band — CSS sets background-image via
                    [data-atmosphere] + pillar class. Fallback: navy. */}
                <div className="intel-card-img-band" aria-hidden="true" />
                <div className="intel-card-text">
                  <div className="intel-card-label">{c.label}</div>
                  <h3 className="intel-card-title">{c.title}</h3>
                  <p className="intel-card-body">{c.body}</p>
                </div>
              </article>
            ))}
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
