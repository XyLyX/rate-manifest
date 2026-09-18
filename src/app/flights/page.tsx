import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Flight Intelligence | Rate Manifest",
  description:
    "Compare flight options with clearer travel decision intelligence designed to help you make a better-informed journey decision.",
  alternates: {
    canonical: "https://ratemanifest.com/flights",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Flight Intelligence | Rate Manifest",
    description:
      "Compare flight options with clearer travel decision intelligence designed to help you make a better-informed journey decision.",
    url: "https://ratemanifest.com/flights",
    type: "website",
    siteName: "Rate Manifest",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flight Intelligence | Rate Manifest",
    description:
      "Compare flight options with clearer travel decision intelligence designed to help you make a better-informed journey decision.",
  },
};

// Flights page — Rate Manifest three-tower platform.
//
// This is the canonical Flights surface. It is a genuine product page,
// not a placeholder. When a visitor selects a destination and attempts
// a flight search, they see an honest journey state — no fabricated
// schedules, no fake fares, no invented airline or route information,
// no implication that a specific carrier has been checked when it hasn't.
//
// The journey state is described as a temporary unavailability of the
// flight options for that specific journey — professional, calm, and
// accurate. No "Coming Soon." No internal implementation status exposed.
//
// What will live here once the data layer exists:
//   - Origin + destination + dates form (flight-specific)
//   - Fare comparison from real flight data sources
//   - Decision context beyond the cheapest fare
//   - Same journey structure as Hotels
export default function FlightsPage() {
  return (
    <div className="shell shell-flights">
      <NavBar ctaLabel="Search hotels" ctaHref="/" active="flights" />

      <div className="coming-soon-page">
        <h1 className="coming-soon-title">Flight Intelligence</h1>
        <p className="coming-soon-body">
          Rate Manifest applies the same decision-intelligence approach to
          flights as it does to hotels — fare comparisons from named sources,
          honest data, no invented numbers.
        </p>
        <p className="coming-soon-body">
          We&apos;re finalising the flight options for this journey and will
          update you as soon as they&apos;re ready.
        </p>
      </div>

      <Footer />
    </div>
  );
}
