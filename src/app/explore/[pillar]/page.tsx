import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { AtmosphereProvider } from "@/components/AtmosphereProvider";
import styles from "@/app/travel-intelligence/editorial.module.css";

// The four homepage editorial rows' individually-addressable "Explore ___"
// destinations (src/app/page.tsx). Each is general, evergreen, non-
// destination-specific travel-planning guidance - a framework for thinking
// about the pillar, never a report on any particular place. Nothing here is
// a price, a destination fact, a supplier-coverage claim or "live"
// intelligence: the homepage's own per-search Gemini pillar cards are the
// only place that claims to be that, and every guide below says so plainly
// and links back to a new search rather than implying this page is it.
//
// The hero band deliberately reuses .intel-row/.intel-row-img/.pillar-{id}
// verbatim - the exact same markup/CSS the homepage's editorial rows use,
// so the same atmosphere-driven photograph (session-stable via
// AtmosphereProvider, same 5 sets × 4 pillars already shipped) carries
// straight through with zero new images and zero new hero CSS.

interface PillarGuide {
  pillarClass: string;
  eyebrow: string;
  title: string;
  tagline: string;
  intro: string;
  explanation: string[];
  decisions: string[];
}

const GUIDES: Record<string, PillarGuide> = {
  "cost-reality": {
    pillarClass: "pillar-cost-reality",
    eyebrow: "Travel Intelligence",
    title: "Cost Reality",
    tagline: "Know the real cost of being there.",
    intro:
      "The price on a booking page is rarely the full picture. Cost Reality is about seeing a trip's true total before you commit, not after you arrive.",
    explanation: [
      "A nightly rate is only one line in a much longer bill. Local transport, meals, entry fees, resort or service charges, and how the exchange rate actually behaves once you're spending in a foreign currency all add up - often by more than travellers expect.",
      "Seasonality moves almost every number in that bill at once: accommodation, flights and even day-to-day prices can shift substantially between peak and shoulder seasons for the same destination.",
      "The honest way to plan is to separate what you can predict - accommodation, known entry fees - from what you can only estimate - food, transport, incidentals - and budget a margin for the second group.",
    ],
    decisions: [
      "Choosing between an all-inclusive stay and a bed-and-breakfast with local dining, once meals are actually priced in.",
      "Weighing a lower nightly rate further from the centre against the daily transport cost of getting in and out.",
      "Deciding whether shoulder-season timing is worth a shift in weather or crowd levels for a meaningfully lower total cost.",
    ],
  },
  "smart-choices": {
    pillarClass: "pillar-smart-choices",
    eyebrow: "Travel Intelligence",
    title: "Smart Choices",
    tagline: "Find what truly fits you.",
    intro:
      "The \"best\" hotel isn't a single answer - it's the one that fits how you actually travel. Smart Choices is about matching a stay to your trip, not to a generic ranking.",
    explanation: [
      "Two travellers searching the same destination on the same dates can have completely different right answers, depending on what the trip is actually for - a couple's anniversary, a family with young children, and a work trip with early meetings all pull toward different properties.",
      "Location, quiet and amenities usually trade off against each other. A central address buys walkability at the cost of noise; a resort buys amenities at the cost of independence from its own restaurants and pricing.",
      "Property type matters as much as brand - a boutique hotel, a large resort and a serviced apartment solve different problems, even at a similar price point.",
    ],
    decisions: [
      "A family weighing a resort with a kids' club against an apartment closer to the sights they actually want to see.",
      "A business traveller prioritising proximity to a venue over amenities they won't have time to use.",
      "A couple deciding whether a quieter, slightly further-out property is worth trading for a walkable central one.",
    ],
  },
  "getting-around": {
    pillarClass: "pillar-getting-around",
    eyebrow: "Travel Intelligence",
    title: "Getting There & Around",
    tagline: "Move smarter, explore further.",
    intro:
      "How you arrive and how you move once you're there shapes the whole trip - often more than the destination itself.",
    explanation: [
      "Airport transfers are frequently the least-planned part of a trip and the most likely to derail the first few hours - knowing the realistic options, and their cost, before you land changes how you choose accommodation in the first place.",
      "Public transit, rideshare, taxis and rental cars each carry a different mix of cost, flexibility and local knowledge required to use well - the right mix depends on how many places you actually plan to see.",
      "Where you stay and how you'll move are the same decision, not two separate ones: a property near a transit hub can be worth more than one that's marginally closer to a single landmark.",
    ],
    decisions: [
      "Choosing a hotel near a major transit line over a scenic but poorly connected neighbourhood.",
      "Budgeting the airport transfer into the total cost of a stay before comparing nightly rates.",
      "Deciding whether a rental car earns its cost for the specific places you want to reach.",
    ],
  },
  "local-pulse": {
    pillarClass: "pillar-local-pulse",
    eyebrow: "Travel Intelligence",
    title: "Local Pulse",
    tagline: "Go beyond the guidebook.",
    intro:
      "A destination's day-to-day rhythm - not just its landmarks - is what actually shapes how a trip feels.",
    explanation: [
      "Every destination has its own daily rhythm: when things open and close, how locals actually spend a weekend, and which neighbourhoods feel different from each other, well beyond what a landmark checklist captures.",
      "Local customs and everyday etiquette are easy to miss and can meaningfully change how welcome, and how comfortable, a visit feels.",
      "Timing matters as much as location: a destination during a local holiday, a quiet season or a major event can feel like an entirely different place.",
    ],
    decisions: [
      "Choosing a neighbourhood known for nightlife versus one known for quiet mornings, based on what the trip is actually for.",
      "Timing a visit around - or deliberately away from - a local festival or event.",
      "Recognising when a guidebook's highlight list and a destination's actual daily life point in different directions.",
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(GUIDES).map((pillar) => ({ pillar }));
}

interface PillarPageProps {
  params: Promise<{ pillar: string }>;
}

export async function generateMetadata({ params }: PillarPageProps): Promise<Metadata> {
  const { pillar } = await params;
  const g = GUIDES[pillar];
  if (!g) return { title: "Guide not found" };
  return {
    title: `${g.title} | Rate Manifest`,
    description: g.intro,
    alternates: { canonical: `/explore/${pillar}` },
    openGraph: { title: g.title, description: g.intro, type: "article", url: `https://ratemanifest.com/explore/${pillar}` },
  };
}

export default async function PillarGuidePage({ params }: PillarPageProps) {
  const { pillar } = await params;
  const g = GUIDES[pillar];
  if (!g) notFound();

  return (
    <>
      <AtmosphereProvider />
      <NavBar active="none" />

      {/* Same hero band the homepage's editorial rows use - same markup,
          same CSS classes, same atmosphere-driven photograph. .intel-row is
          a flex row with a single content child (.intel-row-text) plus
          absolutely-positioned image/veil layers, so NavBar - a normal-flow
          top bar - stays outside it rather than becoming a second flex item. */}
      <div className={`intel-row intel-row--left ${g.pillarClass}`}>
        <div className="intel-row-img" aria-hidden="true" />
        <div className="intel-row-veil intel-row-veil--left" aria-hidden="true" />
        <div className="intel-row-text">
          <div className="intel-row-label">{g.eyebrow}</div>
          <p className="intel-row-title">{g.title}</p>
          <p className="intel-row-body">{g.tagline}</p>
        </div>
      </div>

      <main className={styles.article}>
        <Link href="/" className={styles.back}>
          ← Back to Discover
        </Link>
        <p className={styles.eyebrow}>{g.eyebrow}</p>
        <h1>{g.title}</h1>
        <p className={styles.lead}>{g.intro}</p>

        {g.explanation.map((paragraph, i) => (
          <section key={i}>
            <p>{paragraph}</p>
          </section>
        ))}

        <section>
          <h2>Decisions this helps you make</h2>
          <ul>
            {g.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>

        <div className={styles.sources}>
          <h2>General guidance, not live intelligence</h2>
          <p>
            This page is general travel-planning guidance - a way of thinking about {g.title.toLowerCase()}, not a
            report on any specific destination. Rate Manifest&apos;s actual destination intelligence is generated
            live, for the exact place and dates you search, and appears on your search results. It never includes
            prices or availability, which Rate Manifest does not currently show.
          </p>
        </div>

        <div className={styles.bottom}>
          <h2>Start planning</h2>
          <p>Search a destination to see Rate Manifest&apos;s own live intelligence for that specific place and your dates.</p>
          <Link href="/">Start your search →</Link>
        </div>
      </main>

      <Footer />
    </>
  );
}
