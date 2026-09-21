import type { Metadata } from "next";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms — Rate Manifest",
  description: "Terms of use for Rate Manifest, the travel decision-intelligence platform.",
  alternates: {
    canonical: "https://ratemanifest.com/terms",
  },
};

// W4 (2026-09-14): new /terms route.
// Does NOT contain: company registration number, physical address, legal entity
// name, jurisdiction-specific legal claims, or a specific legal contact email.
// Rate Manifest is an informational service; these terms reflect that accurately.
export default function TermsPage() {
  return (
    <div className="legal-page">
      <NavBar />
      <main className="legal-content">
        <h1>Terms of Use</h1>
        <p className="legal-updated">Last updated: September 2026</p>

        <section>
          <h2>What Rate Manifest is</h2>
          <p>
            Rate Manifest is a travel decision-intelligence service. It provides informational
            tools to help you shortlist and compare hotels and make better-informed travel
            decisions before you decide where to book. Rate Manifest is not a booking platform.
          </p>
        </section>

        <section>
          <h2>Rates may change</h2>
          <p>
            Rate Manifest does not currently show hotel rates. Any rate information shown, now or
            in future, is informational and is sourced from third parties. Rates change frequently. A rate shown on Rate Manifest may no longer
            be available by the time you visit a supplier&apos;s site. Rate Manifest does not
            guarantee that any rate will be available, or that the rate shown reflects the final
            price including all applicable taxes and fees.
          </p>
        </section>

        <section>
          <h2>No guarantees</h2>
          <p>
            Rate Manifest makes no warranty, express or implied, as to the accuracy,
            completeness, or fitness for purpose of any information on the site. The service is
            provided &quot;as is.&quot; Your use of rate information to make a booking decision
            is entirely at your own discretion.
          </p>
        </section>

        <section>
          <h2>No bookings or payments</h2>
          <p>
            Rate Manifest does not process bookings, take payments, hold room inventory, or
            manage reservations or cancellations. All bookings happen directly on the relevant
            supplier&apos;s own site. Rate Manifest is not a party to any booking you make.
          </p>
        </section>

        <section>
          <h2>Supplier terms apply</h2>
          <p>
            When you follow a link from Rate Manifest to a hotel or supplier site, the terms and
            conditions of that site govern your booking. Rate Manifest is not affiliated with or
            endorsed by Booking.com, Expedia, Agoda, Hotels.com, or Trip.com. Any booking you
            make is subject to that supplier&apos;s own policies on payment, cancellation, and
            guest terms.
          </p>
        </section>

        <section>
          <h2>Acceptable use</h2>
          <p>
            You may use Rate Manifest for personal, non-commercial travel research. You may not
            use automated tools to scrape, copy, or extract data from Rate Manifest, attempt to
            reverse-engineer its rate intelligence methodology, or use the service in any way
            that interferes with its normal operation.
          </p>
        </section>

        <section>
          <h2>Intellectual property</h2>
          <p>
            The Rate Manifest name, editorial content, and rate intelligence methodology are our
            property. You may not reproduce or republish them without permission.
          </p>
        </section>

        <section>
          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted, Rate Manifest is not liable for any loss or damage
            arising from your use of the site or from decisions you make based on information
            shown here, including decisions about hotel bookings or rates.
          </p>
        </section>

        <section>
          <h2>Changes to these terms</h2>
          <p>
            We may update these terms from time to time. The date at the top of this page
            reflects when they were last changed. Continued use of Rate Manifest after an update
            constitutes acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2>Questions</h2>
          <p>
            If you have questions about these terms, please <Link href="/">contact us</Link>.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
