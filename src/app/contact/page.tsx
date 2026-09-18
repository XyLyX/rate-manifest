import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Contact — Rate Manifest",
  description: "Get in touch with the Rate Manifest team.",
  alternates: {
    canonical: "https://ratemanifest.com/contact",
  },
};

// /contact — public positioning task (2026-09-15). Three email inboxes so
// reviewers and potential partners can reach the team directly. Uses .legal-
// content for consistent typography with /privacy and /terms.
export default function ContactPage() {
  return (
    <div className="shell">
      <NavBar ctaLabel="Search" ctaHref="/" active="none" />

      <div className="legal-content">
        <h1>Contact</h1>
        <p>
          Rate Manifest is a travel decision intelligence platform. We&apos;re a
          small team — the right inbox reaches us faster than a contact form.
        </p>

        <h2>Customer support</h2>
        <p>
          For questions about using Rate Manifest, searches, rate checks or
          your trip:{" "}
          <a href="mailto:hello@ratemanifest.com">hello@ratemanifest.com</a>
        </p>

        <h2>Business &amp; partnerships</h2>
        <p>
          For hotels, airlines, travel companies, affiliate networks and
          commercial partnerships:{" "}
          <a href="mailto:business@ratemanifest.com">business@ratemanifest.com</a>
        </p>

        <h2>Technical support</h2>
        <p>
          For website problems, broken links, errors or technical issues:{" "}
          <a href="mailto:support@ratemanifest.com">support@ratemanifest.com</a>
        </p>
      </div>

      <Footer />
    </div>
  );
}
