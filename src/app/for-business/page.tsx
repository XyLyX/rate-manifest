import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

// A landing page for a product that doesn't exist yet, by design (see
// DECISIONS.md, "Brand system v2") — this plants the B2B seed without
// pretending there's a live API or a sales team behind it. The CTA points
// at business@ratemanifest.com on the strength of the domain being real
// now, but that inbox isn't actually set up yet (needs email forwarding
// or a real mailbox at your registrar/host) — until it is, this button
// looks right but won't reach anyone.
export default function ForBusinessPage() {
  return (
    <div className="shell">
      <NavBar />

      <div className="hero">
        <div className="hero-eyebrow">Rate Manifest for Business</div>
        <h1>Hotel rate intelligence for travel professionals.</h1>
        <p>
          Compare, normalize, and evaluate hotel rates from multiple supply sources through one
          intelligent platform — built for the people who book on behalf of others, not just for
          themselves.
        </p>
      </div>

      <div className="how-it-works-grid business-grid">
        <div className="how-card">
          <div className="how-card-label">Travel agencies</div>
          <p>A faster way to check a client&apos;s options across sources before you quote them.</p>
        </div>
        <div className="how-card">
          <div className="how-card-label">Concierge</div>
          <p>Fast, defensible rate comparisons for guests who expect you to already know the best deal.</p>
        </div>
        <div className="how-card">
          <div className="how-card-label">DMCs</div>
          <p>One place to sanity-check rates across the properties you place groups into.</p>
        </div>
        <div className="how-card">
          <div className="how-card-label">Corporate travel</div>
          <p>Policy-compliant, price-justified bookings without five browser tabs open.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: "2rem" }}>
        <h2 className="card-title">Not live yet</h2>
        <p style={{ color: "var(--text-dim)", marginBottom: "1.25rem" }}>
          This is a teaser page, not a product — there&apos;s no B2B API or dashboard behind it today. If
          you&apos;re interested in what this becomes, get in touch and we&apos;ll follow up once there&apos;s
          something real to show you.
        </p>
        <a className="btn" href="mailto:business@ratemanifest.com">
          Request access →
        </a>
      </div>

      <Footer />
    </div>
  );
}
