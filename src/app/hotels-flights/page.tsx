import type { Metadata } from "next";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Hotels + Flights Intelligence | Rate Manifest",
  description:
    "Bring hotel and flight decisions together with travel decision intelligence designed to help you plan a better-informed journey.",
  alternates: {
    canonical: "https://ratemanifest.com/hotels-flights",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Hotels + Flights Intelligence | Rate Manifest",
    description:
      "Bring hotel and flight decisions together with travel decision intelligence designed to help you plan a better-informed journey.",
    url: "https://ratemanifest.com/hotels-flights",
    type: "website",
    siteName: "Rate Manifest",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hotels + Flights Intelligence | Rate Manifest",
    description:
      "Bring hotel and flight decisions together with travel decision intelligence designed to help you plan a better-informed journey.",
  },
};

// Hotels + Flights is a combined Rate Manifest product surface.
//
// It brings together two foundational towers — Hotels and Flights — rather
// than introducing a fourth tower. Live combined options are not exposed
// until the underlying flight and hotel sources can support them honestly.
export default function HotelsFlightsPage() {
  return (
    <div className="shell">
      <NavBar
        ctaLabel="Plan your trip"
        ctaHref="/?mode=combined"
        active="hotels-flights"
      />

      <main className="coming-soon-page">
        <h1 className="coming-soon-title">Hotels + Flights</h1>

        <p className="coming-soon-body">
          Bring the two biggest travel decisions together — where you stay
          and how you get there — with clearer intelligence around the
          complete journey.
        </p>

        <div className="how-it-works-grid">
          <div className="how-card">
            <div className="how-card-num" aria-hidden="true">
              01
            </div>
            <div className="how-card-label">Plan</div>
            <p>
              Start with one journey context for your destination, dates and
              travel needs.
            </p>
          </div>

          <div className="how-card">
            <div className="how-card-num" aria-hidden="true">
              02
            </div>
            <div className="how-card-label">Compare</div>
            <p>
              Consider hotel and flight options together instead of making
              each decision in isolation.
            </p>
          </div>

          <div className="how-card">
            <div className="how-card-num" aria-hidden="true">
              03
            </div>
            <div className="how-card-label">Decide</div>
            <p>
              Use Rate Manifest intelligence to make a better-informed
              decision across the complete trip.
            </p>
          </div>
        </div>

        <p className="coming-soon-body">
          We&apos;re finalising combined flight and hotel options for this
          journey. Rate Manifest will only show them when they can be
          supported by real sources.
        </p>

        <Link className="btn" href="/?mode=combined">
          Explore Hotels + Flights
        </Link>
      </main>

      <Footer />
    </div>
  );
}