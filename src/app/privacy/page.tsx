import type { Metadata } from "next";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy — Rate Manifest",
  description: "How Rate Manifest collects and uses the information you share with us.",
  alternates: {
    canonical: "https://ratemanifest.com/privacy",
  },
};

// W4 (2026-09-14): new /privacy route.
// Does NOT contain: company registration number, physical address, legal entity
// name, DPO, jurisdiction-specific legal claims, or a specific privacy email.
// The contact mechanism is a general "contact us" link. All data described here
// corresponds to what the destination_interest table actually stores.
export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <NavBar />
      <main className="legal-content">
        <h1>Privacy</h1>
        <p className="legal-updated">Last updated: September 2026</p>

        <section>
          <h2>What Rate Manifest is</h2>
          <p>
            Rate Manifest is a travel decision-intelligence tool. It helps you shortlist and
            compare hotels and make better-informed travel decisions. It is an
            informational service — it does not process bookings, payments, or cancellations.
          </p>
        </section>

        <section>
          <h2>Data we collect</h2>
          <p>
            Rate Manifest collects a small amount of personal data in one specific situation: when
            you register interest in a destination that isn&apos;t yet supported. In that case we
            collect your name, email address, the destination you searched for, the time of your
            submission, and a field indicating where the submission came from (the destination
            search form). We do not collect this information unless you actively submit the
            interest form.
          </p>
          <p>
            We may also collect standard server logs (IP address, browser type, pages visited)
            for operational purposes. This data is not linked to your name or email.
          </p>
        </section>

        <section>
          <h2>Why we collect it</h2>
          <p>
            We collect your name and email address for one purpose: to notify you when Rate
            Manifest launches in the destination you asked about. We use your destination to
            determine which notification is relevant to you. We do not use this data for any
            other purpose.
          </p>
        </section>

        <section>
          <h2>How we use it</h2>
          <p>
            We will send you a notification when Rate Manifest becomes available in your requested
            destination. We will not contact you for any other reason, and we will not add you to
            a general mailing list. We do not sell, rent, or share your personal data with third
            parties for their marketing purposes.
          </p>
        </section>

        <section>
          <h2>Retention and deletion</h2>
          <p>
            We retain your interest registration until you ask us to remove it, or until we have
            sent you the notification you signed up for and the purpose is fulfilled. If you would
            like your data deleted at any time, contact us and we will remove it.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            We take reasonable technical and organisational measures to protect the data we hold.
            No method of transmission or storage is completely secure, and we cannot guarantee
            absolute security.
          </p>
        </section>

        <section>
          <h2>Cookies</h2>
          <p>
            Rate Manifest uses minimal cookies necessary for the site to function — for example,
            session state. We do not use tracking cookies from third-party advertising networks.
          </p>
        </section>

        <section>
          <h2>Third parties</h2>
          <p>
            We use service providers for hosting and database infrastructure. These providers
            process data on our behalf under contractual obligations and do not use it for their
            own purposes.
          </p>
          <p>
            When you follow a link to a hotel on a supplier&apos;s site (such as Booking.com,
            Expedia, Agoda, Hotels.com, or Trip.com), that site&apos;s own privacy policy applies
            to any data you provide there. Rate Manifest is not affiliated with or endorsed by
            those platforms.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            If you have questions about this policy, or if you would like to request deletion of
            your data, please <Link href="/">contact us</Link>.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
