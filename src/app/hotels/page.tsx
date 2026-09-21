import type { Metadata } from "next";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Hotel Intelligence | Rate Manifest",
  description:
    "Shortlist and compare hotels with travel decision intelligence designed to help you make a better-informed stay decision.",
  alternates: {
    canonical: "https://ratemanifest.com/hotels",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Hotel Intelligence | Rate Manifest",
    description:
      "Shortlist and compare hotels with travel decision intelligence designed to help you make a better-informed stay decision.",
    url: "https://ratemanifest.com/hotels",
    type: "website",
    siteName: "Rate Manifest",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hotel Intelligence | Rate Manifest",
    description:
      "Shortlist and compare hotels with travel decision intelligence designed to help you make a better-informed stay decision.",
  },
};

// Hotels — one of Rate Manifest's three foundational product towers.
//
// The working hotel discovery journey currently begins on the Rate Manifest
// homepage. This canonical Hotels surface explains the product and sends the
// traveller into that existing journey rather than duplicating its search
// implementation or implying unsupported live inventory here.
export default function HotelsPage() {
  return (
    <div className="shell">
      <NavBar ctaLabel="Search hotels" ctaHref="/?mode=hotels" active="hotels" />

      <main className="coming-soon-page">
        <h1 className="coming-soon-title">Hotel Intelligence</h1>

        <p className="coming-soon-body">
          Find the right stay with clearer travel decision intelligence —
          helping you shortlist and compare before you decide.
        </p>

        <div className="how-it-works-grid">
          <div className="how-card">
            <div className="how-card-num" aria-hidden="true">
              01
            </div>
            <div className="how-card-label">Shortlist</div>
            <p>
              Start with your destination and trip needs, then build a shortlist
              of properties to carry forward.
            </p>
          </div>

          <div className="how-card">
            <div className="how-card-num" aria-hidden="true">
              02
            </div>
            <div className="how-card-label">Compare</div>
            <p>
              Compare your options with clearer context instead of choosing
              on price alone.
            </p>
          </div>

          <div className="how-card">
            <div className="how-card-num" aria-hidden="true">
              03
            </div>
            <div className="how-card-label">Choose</div>
            <p>
              Choose the hotel you want to continue with.
            </p>
          </div>
        </div>

        <Link className="btn" href="/?mode=hotels">
          Start your hotel search
        </Link>
      </main>

      <Footer />
    </div>
  );
}