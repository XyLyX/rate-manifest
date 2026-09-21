import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

// Public, crawlable, static explanation of how Rate Manifest actually makes
// a travel decision. Part of the reviewer/customer journey: Homepage ->
// Exceptional Stays -> Property IQ -> Methodology -> Check IQ (see
// claude/rate-manifest-technical-blueprint.md, Section 12, Navin's own
// developer brief - this page is section 3 of that brief, built verbatim
// to spec). Zero data dependencies and no live API calls, by design - see
// the brief's Section 9 (StayingAPI Cost Protection): explaining the
// product must never itself cost a supplier credit.
//
// Anti-fabrication rule (brief Section 8) applies here too: this page only
// describes attributes and behaviour the system actually has - no claims
// about coverage, accuracy, or capabilities beyond what's implemented.

export const metadata: Metadata = {
  title: "Methodology — Rate Manifest",
  description:
    "How Rate Manifest intends to discover, normalize, verify and analyse hotel rates to reach a decision - and what it won't do when the evidence isn't there. Rate verification is currently unavailable.",
  alternates: {
    canonical: "https://ratemanifest.com/methodology",
  },
};

export default function MethodologyPage() {
  return (
    <div className="shell">
      <NavBar active="methodology" />

      <div className="hero">
        <div className="hero-eyebrow">Methodology</div>
        <h1>How Rate Manifest works.</h1>
        <p>
          Rate Manifest is designed to do more than display hotel rates. It is intended to bring
          offers together, normalize the differences between them, verify what can be verified,
          and turn the evidence into a decision.
        </p>
        <p>
          Rate verification is currently unavailable. This page describes the intended method.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">1. Discover</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Rate Manifest discovers properties (and, in the intended method, offers) through the
          sources it currently has access to. This is not universal hotel inventory — it's whatever those sources can actually
          return, and that set grows as more sources are added.
        </p>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">2. Normalize</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Offers from different sources aren&apos;t directly comparable. Room type, occupancy, meal
          inclusion, cancellation conditions, payment conditions, rate structure, and the source
          itself can all differ between two listings for what looks like &quot;the same room.&quot;
          In the intended method, Rate Manifest normalizes offers against the attributes it actually
          captures, rather than
          assuming any two prices are describing the same thing.
        </p>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">3. Verify</h2>
        <p style={{ color: "var(--text-dim)" }}>
          In the intended method, selected rates can be checked against live source data. Live
          verification would be a separate, explicit action — Rate Manifest would not call a live
          source just because a page is being viewed, only when you ask it to, through Check IQ.
          This is currently unavailable.
        </p>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">4. Analyse</h2>
        <p style={{ color: "var(--text-dim)" }}>
          In the intended method, for each set of offers, Rate Manifest looks at what&apos;s actually
          being compared, what
          evidence exists for it, what evidence is missing, and how confident it can be given that
          evidence. That analysis is what determines why a rate receives the assessment it does —
          not a fixed rule like &quot;lowest price wins.&quot;
        </p>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">5. Decide</h2>
        <p style={{ color: "var(--text-dim)" }}>
          In the intended method, the output isn&apos;t &quot;this is the cheapest rate.&quot; It&apos;s
          which option makes the most sense, based on the evidence Rate Manifest actually has for it.
        </p>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">6. Rate Memory</h2>
        <p style={{ color: "var(--text-dim)" }}>
          In the intended method, every live check contributes an observation to Rate Memory. Over time, that builds a real
          history for a property rather than a single snapshot. Rate Manifest does not claim
          historical trends, a &quot;normal&quot; price, or an unusually cheap or expensive rate
          until enough observations actually exist to support that — the historical clock starts
          from real checks, not from assumption.
        </p>
      </div>

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">Data limitations</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Rate Manifest does not invent missing information. If a source doesn&apos;t provide
          something — a meal inclusion, a cancellation term, a payment condition, a historical
          price — the system says so directly: &quot;Not available from the source checked.&quot;
          It does not infer breakfast, meal plans, cancellation terms, payment conditions,
          historical pricing, availability, or value claims from incomplete data.
        </p>
      </div>

      <Footer />
    </div>
  );
}
