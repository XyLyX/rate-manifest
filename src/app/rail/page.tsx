import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Rail Intelligence | Rate Manifest",
  description:
    "Compare rail options with clearer travel decision intelligence designed to help you make a better-informed journey decision.",
  alternates: {
    canonical: "https://ratemanifest.com/rail",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Rail Intelligence | Rate Manifest",
    description:
      "Compare rail options with clearer travel decision intelligence designed to help you make a better-informed journey decision.",
    url: "https://ratemanifest.com/rail",
    type: "website",
    siteName: "Rate Manifest",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rail Intelligence | Rate Manifest",
    description:
      "Compare rail options with clearer travel decision intelligence designed to help you make a better-informed journey decision.",
  },
};

// Rail page — Rate Manifest three-tower platform.
//
// This is the canonical Rail surface. It is a genuine product page,
// not a placeholder. When a visitor selects a destination and attempts
// a rail search, they see an honest journey state — no fabricated
// schedules, no fake fares, no invented station or route information,
// no implication that a specific carrier or route has been checked when
// it hasn't.
//
// The journey state is described as a temporary unavailability of the
// rail options for that specific journey — professional, calm, and
// accurate. No "Coming Soon." No internal implementation status exposed.
//
// What will live here once the data layer exists:
//   - Origin + destination + date form (rail-specific)
//   - Fare comparison from real rail data sources
//   - Decision context beyond the cheapest fare
//   - Same journey structure as Hotels and Flights
export default function RailPage() {
  return (
    <div className="shell shell-rail">
      <NavBar ctaLabel="Search hotels" ctaHref="/" active="rail" />

      <div className="coming-soon-page">
        <h1 className="coming-soon-title">Rail Intelligence</h1>
        <p className="coming-soon-body">
          Rate Manifest applies the same decision-intelligence approach to
          rail as it does to hotels — fare comparisons from named sources,
          honest data, no invented numbers.
        </p>
        <p className="coming-soon-body">
          We&apos;re finalising the rail options for this journey and will
          update you as soon as they&apos;re ready.
        </p>
      </div>

      <Footer />
    </div>
  );
}
