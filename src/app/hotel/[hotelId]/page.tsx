import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { getVerdictConfidence } from "@/lib/scoring/confidence";
import type { VerdictEvidenceOffer } from "@/lib/verdict";
import type { ScoreReason } from "@/lib/scoring/bestDealScore";

// Public Rate Manifest IQ page for one property - claude/rate-manifest-
// technical-blueprint.md, Section 12 (Navin's own developer brief), Section
// 5, subsections A-L. Reads only stored data (the `verdicts` table, written
// on every real Check IQ page view - see src/lib/verdict.ts) and never
// calls StayingAPI itself (Section 9, "StayingAPI Cost Protection" -
// mandatory: Visitor -> /hotel/[hotelId] -> Stored data -> Render IQ). Live
// verification only happens after the visitor explicitly submits the
// "Verify this rate" form below, which is a plain GET into the existing
// /check-iq flow - no client JS needed for that either.
//
// Anti-fabrication rule (Section 8): a missing field renders "Not available
// from the source checked," never a manufactured value. This is why
// breakfast/rate plan/payment/taxes below are hardcoded "not available" -
// VerdictEvidenceOffer genuinely does not carry them yet (see rateSnapshot.
// ts's own comment: SupplierOffer has no field for any of them). Only
// Cancellation is conditionally rendered, gated on cancellationKnown - and
// a verdict row written before that field existed (2026-09-11) has
// `cancellationKnown === undefined`, which the `=== true` checks below
// correctly treat as unknown, never as false.

const UNAVAILABLE = "Not available from the source checked.";

interface PageParams {
  params: Promise<{ hotelId: string }>;
}

async function loadHotelIq(hotelId: string) {
  const hotel = await db.query.hotels.findFirst({
    where: eq(schema.hotels.id, hotelId),
  });
  if (!hotel) return null;

  const verdict = await db.query.verdicts.findFirst({
    where: eq(schema.verdicts.hotelId, hotelId),
    orderBy: desc(schema.verdicts.generatedAt),
  });

  return { hotel, verdict: verdict ?? null };
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { hotelId } = await params;
  const result = await loadHotelIq(hotelId);
  if (!result) return { title: "Property not found — Rate Manifest" };

  const { hotel } = result;
  return {
    title: `Rate Manifest IQ — ${hotel.name}`,
    description: `Rate Manifest's stored intelligence for ${hotel.name}, ${hotel.area}, ${hotel.city} — evidence, confidence, and what's still unknown.`,
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function HotelIqPage({ params }: PageParams) {
  const { hotelId } = await params;
  const result = await loadHotelIq(hotelId);
  if (!result) notFound();

  const { hotel, verdict } = result;

  // No stored verdict yet - the maturity-state-0 case (blueprint's own
  // "Critical distinction": a featured hotel with no data must say so, not
  // render a manufactured score). Property header + Verify CTA only.
  if (!verdict) {
    return (
      <div className="shell">
        <NavBar />
        <div className="hero">
          <div className="hero-eyebrow">Rate Manifest IQ</div>
          <h1>{hotel.name}</h1>
          <p>
            {hotel.area}, {hotel.city} · {hotel.starRating}-star
          </p>
        </div>
        <div className="card">
          <h2 className="card-title">Rate Manifest has not analysed this property yet.</h2>
          <p style={{ color: "var(--text-dim)" }}>
            No stored observations exist for this property yet. Verify a rate below and Rate
            Manifest will start building intelligence on it from that check onward.
          </p>
        </div>
        <VerifyThisRate hotelId={hotel.id} />
        <Footer />
      </div>
    );
  }

  const evidence: VerdictEvidenceOffer[] = JSON.parse(verdict.evidenceJson);
  const reasons: ScoreReason[] = JSON.parse(verdict.reasonsJson);
  const top = evidence[0] ?? null;

  const supplier = verdict.topSupplierSlug
    ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.slug, verdict.topSupplierSlug) })
    : null;

  // Only Cancellation can be "confirmed" from stored evidence today -
  // breakfast/rate plan/payment/taxes are never persisted (see module
  // comment). `=== true` so a pre-2026-09-11 row (field absent) reads as
  // unknown, same rule VerifyBeforeBooking already applies live.
  const cancellationKnown = top?.cancellationKnown === true;
  const uncertainFieldCount = 4 + (cancellationKnown ? 0 : 1);

  const confidence = getVerdictConfidence({
    uncertainFieldCount,
    hasReliabilityData: supplier?.reliabilityScore != null,
    sourcesComparedCount: evidence.length,
  });

  const lastAnalysed = verdict.generatedAt.toLocaleDateString("en-AE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="shell">
      <NavBar />

      {/* A. Property header */}
      <div className="hero">
        <div className="hero-eyebrow">Rate Manifest IQ</div>
        <h1>{hotel.name}</h1>
        <p>
          {hotel.area}, {hotel.city} · {hotel.starRating}-star
        </p>
      </div>

      {/* B. Rate Manifest IQ - main verdict */}
      <div className="card">
        <h2 className="card-title">Rate Manifest Verdict: {verdict.decision}</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Tier: {verdict.tier} · Score: {Math.round(verdict.score)}/100
        </p>
        {reasons.length > 0 && (
          <ul style={{ marginTop: "0.75rem", color: "var(--text-dim)" }}>
            {reasons.map((r, i) => (
              <li key={i}>{r.text}</li>
            ))}
          </ul>
        )}
      </div>

      {/* C. Latest observed rate */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">Latest observed rate</h2>
        {top ? (
          <p style={{ color: "var(--text-dim)" }}>
            {top.soldOut
              ? "Sold out at last observation."
              : `${verdict.currency} ${Math.round(top.totalPrice).toLocaleString("en-AE")} total, via ${top.supplierName}.`}{" "}
            Observed {lastAnalysed}. This is an observed rate from a past check, not necessarily a
            currently available rate — verify it below for a live figure.
          </p>
        ) : (
          <p style={{ color: "var(--text-dim)" }}>{UNAVAILABLE}</p>
        )}
      </div>

      {/* D. Competitive context - only when there's actually more than one source */}
      {evidence.length > 1 && (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h2 className="card-title">Competitive context</h2>
          <p style={{ color: "var(--text-dim)" }}>
            Compared against {evidence.length - 1} other source{evidence.length - 1 === 1 ? "" : "s"} at
            the time of this check. {top?.supplierName} had the best-scoring offer among them.
          </p>
        </div>
      )}

      {/* E. Inclusions */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">What&apos;s included</h2>
        <p style={{ color: "var(--text-dim)" }}>Breakfast / meals: {UNAVAILABLE}</p>
        <p style={{ color: "var(--text-dim)" }}>Rate plan: {UNAVAILABLE}</p>
      </div>

      {/* F. Cancellation & payment */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">Cancellation &amp; payment</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Cancellation:{" "}
          {cancellationKnown
            ? top?.isFreeCancellation
              ? "Free cancellation, confirmed by this source."
              : "Non-refundable, confirmed by this source."
            : UNAVAILABLE}
        </p>
        <p style={{ color: "var(--text-dim)" }}>Payment conditions: {UNAVAILABLE}</p>
      </div>

      {/* G / H. Who this suits / who should skip it - derived from actual
          evidence fields above, not hotel marketing copy. */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">Who this stay may suit</h2>
        <p style={{ color: "var(--text-dim)" }}>
          {verdict.tier === "strong" || verdict.tier === "good"
            ? `Travelers comfortable acting on a ${verdict.tier}-tier evidence base from ${evidence.length} source${evidence.length === 1 ? "" : "s"}.`
            : `Travelers who want to compare this property's last observed rate before deciding — the evidence base here is still thin (${verdict.tier} tier).`}
        </p>
      </div>
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">Who should skip it</h2>
        <p style={{ color: "var(--text-dim)" }}>
          {cancellationKnown
            ? "Travelers who need cancellation terms this source didn't confirm — none apply here, cancellation is confirmed."
            : "Travelers who need confirmed cancellation terms before booking — this source hasn't confirmed them."}
        </p>
      </div>

      {/* I. Confidence */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">Confidence: {confidence.label}</h2>
        <ul style={{ color: "var(--text-dim)" }}>
          {confidence.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      {/* J. Limitations */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="card-title">Limitations</h2>
        <p style={{ color: "var(--text-dim)" }}>
          Some commercial conditions (meals, rate plan, payment terms) were not available from the
          source checked. This page reflects one past observation, not live availability.
        </p>
      </div>

      {/* K. Source + timestamp */}
      <p className="footnote">
        Source: {top?.supplierName ?? "unknown"} · Last analysed: {lastAnalysed} · {evidence.length} source
        {evidence.length === 1 ? "" : "s"} checked
      </p>

      {/* L. Live verification CTA */}
      <VerifyThisRate hotelId={hotel.id} />

      <Footer />
    </div>
  );
}

// Plain GET form, zero client JS - hands off to the existing /check-iq
// flow, which is the only place a live StayingAPI call happens (Section 9).
// check-iq/page.tsx requires hotel+checkin+checkout all three or renders
// "Missing search details," so this form is what makes the CTA actually
// work rather than dead-ending a visitor with no dates yet.
function VerifyThisRate({ hotelId }: { hotelId: string }) {
  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <h2 className="card-title">Verify this rate</h2>
      <p style={{ color: "var(--text-dim)", marginBottom: "1rem" }}>
        Want to check a specific stay? Verify the current rate and availability live.
      </p>
      <form action="/check-iq" method="get">
        <input type="hidden" name="hotel" value={hotelId} />
        <div className="discover-form-row">
          <div className="field">
            <label htmlFor="verify-checkin">Check-in</label>
            <input id="verify-checkin" name="checkin" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="verify-checkout">Check-out</label>
            <input id="verify-checkout" name="checkout" type="date" required />
          </div>
        </div>
        <button type="submit" className="btn" style={{ marginTop: "1rem" }}>
          Verify this rate →
        </button>
      </form>
    </div>
  );
}
