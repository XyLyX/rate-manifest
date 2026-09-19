import type { Metadata } from "next";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import "./partners.css";

export const metadata: Metadata = {
  title: "Partners | Rate Manifest",
  description:
    "Partner with Rate Manifest, a Travel Decision Intelligence platform connecting travellers with stays, flights, rail, cruises, experiences and travel services.",
  alternates: {
    canonical: "/partners",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// /partners — first public credibility page for affiliate networks and travel
// partners. Text-only by design: network names are rendered as restrained
// tiles (no logos), and only networks cleared for public V1 are listed.
// Forward-looking RM planner copy is a product statement only — no route or
// functionality is linked from here.

const categories = ["Hotels", "Flights", "Rail", "Cruises", "Experiences", "Packages"];

const flow = ["Discover", "Compare", "Decide", "Book"];

const ecosystem = [
  {
    label: "Stays",
    copy: "Hotels, resorts, exceptional properties and experience-led accommodation.",
  },
  {
    label: "Flights",
    copy: "Airlines and flight-booking partners that can help travellers complete the journey.",
  },
  {
    label: "Rail",
    copy: "Rail operators and booking platforms for journeys where rail is the appropriate connection.",
  },
  {
    label: "Cruises",
    copy: "Cruise lines and booking partners as Rate Manifest expands trip intelligence to journeys at sea.",
  },
  {
    label: "Experiences",
    copy: "Attractions, private and group tours, activities, transfers and destination experiences.",
  },
  {
    label: "Packages",
    copy: "Flight + hotel and experience-led packages where the offer genuinely works better as a complete product.",
  },
];

const principles = [
  {
    label: "Relevant, not intrusive",
    copy: "Partners appear where they make sense within the traveller's actual journey — not as an unrelated catalogue of affiliate links.",
  },
  {
    label: "Context matters",
    copy: "Where partner technology permits it, Rate Manifest aims to preserve useful trip context such as destination, dates and traveller details when handing the customer onward.",
  },
  {
    label: "Sources remain visible",
    copy: "Rate Manifest distinguishes partner information, its own decision intelligence and information available after the traveller reaches a merchant.",
  },
  {
    label: "Nothing invented",
    copy: "Rate Manifest does not manufacture prices, availability, inclusions or travel facts to make an option appear more attractive.",
  },
];

const networks = [
  "Cuelinks",
  "Awin",
  "Admitad",
  "DCMnetwork",
  "Partnerize",
  "Travelpayouts",
];

const reasons = [
  {
    label: "Decision-stage travellers",
    copy: "Partner options can appear when travellers are actively constructing or deciding their trip.",
  },
  {
    label: "Contextual journeys",
    copy: "Hotels, flights, rail, cruises and experiences can form parts of the same trip rather than isolated transactions.",
  },
  {
    label: "Decision intelligence",
    copy: "Rate Manifest is being built around comparison, verification, destination intelligence and informed choice rather than simple offer aggregation.",
  },
  {
    label: "Original travel experience",
    copy: "The platform combines travel intelligence with a personalised planning experience instead of simply republishing merchant listings.",
  },
  {
    label: "Global by design",
    copy: "Rate Manifest is being developed as a multi-destination travel platform.",
  },
];

export default function PartnersPage() {
  return (
    <div className="pn-page">
      <NavBar ctaLabel="Search" ctaHref="/" active="none" />

      <main className="pn-main">
        {/* Hero */}
        <section className="pn-hero">
          <div className="pn-eyebrow">Partners</div>
          <h1>Better journeys are built together.</h1>
          <p className="pn-lede">
            Rate Manifest is building a Travel Decision Intelligence platform that helps travellers
            move from inspiration to informed decisions — and ultimately to the partners that make
            those journeys possible.
          </p>
          <ul className="pn-strip" aria-label="Partner categories">
            {categories.map((c, i) => (
              <li key={c}>
                {i > 0 && <span className="pn-strip-dot" aria-hidden="true">·</span>}
                {c}
              </li>
            ))}
          </ul>
        </section>

        {/* Traveller first */}
        <section className="pn-section">
          <h2>Built around the traveller. Not the commission.</h2>
          <div className="pn-prose">
            <p>
              Rate Manifest brings travel options, intelligence and trip context together so
              travellers can make better-informed choices.
            </p>
            <p>
              Partners can participate across discovery, booking and the wider journey. Where
              multiple qualified options exist, commercial relationships do not determine which
              option is presented as the traveller&apos;s best fit.
            </p>
          </div>
          <ol className="pn-flow" aria-label="Traveller journey">
            {flow.map((step, i) => (
              <li key={step}>
                {i > 0 && <span className="pn-flow-arrow" aria-hidden="true">→</span>}
                <span className="pn-flow-step">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Ecosystem */}
        <section className="pn-section">
          <h2>One journey. A growing travel ecosystem.</h2>
          <div className="pn-grid pn-grid-3">
            {ecosystem.map((item) => (
              <div className="pn-card" key={item.label}>
                <div className="pn-card-label">{item.label}</div>
                <p>{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Principles */}
        <section className="pn-section">
          <h2>How Rate Manifest works with partners</h2>
          <div className="pn-grid pn-grid-2">
            {principles.map((item) => (
              <div className="pn-card" key={item.label}>
                <div className="pn-card-label">{item.label}</div>
                <p>{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Networks */}
        <section className="pn-section">
          <h2>Our Partner &amp; Affiliate Network</h2>
          <div className="pn-prose">
            <p>
              Rate Manifest works with established affiliate and performance-marketing platforms as
              part of its commercial infrastructure.
            </p>
          </div>
          <ul className="pn-networks" aria-label="Affiliate and performance-marketing platforms">
            {networks.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className="pn-disclaimer">
            These relationships provide access to eligible travel programmes and attributable
            commercial routes. Participation in a network does not imply that Rate Manifest has a
            direct commercial relationship with every advertiser available through that network.
          </p>
        </section>

        {/* Why partner */}
        <section className="pn-section">
          <h2>Why partner with Rate Manifest?</h2>
          <div className="pn-grid pn-grid-3">
            {reasons.map((item) => (
              <div className="pn-card" key={item.label}>
                <div className="pn-card-label">{item.label}</div>
                <p>{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Plan it yourself */}
        <section className="pn-section pn-plan">
          <h2>Plan it yourself. Or plan it with RM.</h2>
          <div className="pn-prose">
            <p>
              Travellers can search and make their own decisions — or allow RM to understand the
              experience they&apos;re looking for and help construct the journey around them.
            </p>
            <p className="pn-emphasis">Either way, the traveller remains in control.</p>
          </div>
        </section>

        {/* CTA */}
        <section className="pn-cta">
          <h2>Let&apos;s build better journeys.</h2>
          <p>
            We welcome conversations with hotels and hospitality groups, airlines, rail platforms,
            cruise partners, experience providers, tourism organisations, travel technology
            companies and affiliate programmes.
          </p>
          <Link className="pn-button" href="/contact">
            Partner with Rate Manifest
          </Link>
          <p className="pn-footnote">
            Rate Manifest may earn a commission when a traveller completes an eligible booking
            through certain partner links. Commercial relationships do not determine Rate
            Manifest&apos;s factual comparison or verification methodology.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
