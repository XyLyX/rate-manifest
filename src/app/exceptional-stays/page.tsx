import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

// Curated entry point into the Rate Manifest IQ product - claude/rate-
// manifest-technical-blueprint.md, Section 12, Section 4. NOT a hotel
// catalogue: reads only `hotels` rows explicitly flagged `featuredInIq`
// (curated via src/app/api/admin/init-db/route.ts's SCHEMA_SQL, same
// mechanism as every other schema/data change in this project) and shows
// only what's actually known about each - no fake rankings, no invented
// descriptions, no image (the schema has no image field - showing a stock
// photo here would be exactly the "generic AI-generated hotel copy" this
// page is built to avoid). Public, crawlable, static-ish - each card reads
// stored `verdicts` data only, no StayingAPI call on render (same cost-
// protection rule as /hotel/[hotelId]).
export const metadata: Metadata = {
  title: "Exceptional Stays — Rate Manifest",
  description:
    "A curated collection of properties Rate Manifest has built, or is building, genuine intelligence on.",
  robots: {
    index: false,
    follow: true,
  },
};

export default async function ExceptionalStaysPage() {
  const hotels = await db.query.hotels.findMany({
    where: eq(schema.hotels.featuredInIq, true),
    orderBy: (h, { asc }) => [asc(h.name)],
  });

  const cards = await Promise.all(
    hotels.map(async (hotel) => {
      // StayingAPI QUARANTINE: stored verdict rows came from the StayingAPI-
      // backed comparison and are no longer read or rendered. Each card shows
      // the property's identity and the honest "not analysed" state; the rows
      // stay untouched in the database.
      const verdict = null as typeof schema.verdicts.$inferSelect | null;
      return { hotel, verdict };
    })
  );

  return (
    <div className="shell">
      <NavBar active="exceptional-stays" />

      <div className="hero">
        <div className="hero-eyebrow">Exceptional Stays</div>
        <h1>A curated collection, not a catalogue.</h1>
        <p>
          Properties Rate Manifest has built, or is building, genuine intelligence on — starting
          with Dubai&apos;s luxury segment.
        </p>
      </div>

      <div className="how-it-works-grid">
        {cards.map(({ hotel, verdict }) => (
          <Link
            key={hotel.id}
            href={`/hotel/${hotel.id}`}
            className="how-card"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div className="how-card-label">{hotel.name}</div>
            <p style={{ color: "var(--text-dim)" }}>
              {hotel.area}, {hotel.city} · {hotel.starRating}-star
            </p>
            <p style={{ color: "var(--text-dim)" }}>
              {verdict
                ? `Rate Manifest IQ: ${verdict.decision} · analysed ${verdict.generatedAt.toLocaleDateString("en-AE", { year: "numeric", month: "short", day: "numeric" })}`
                : "Rate Manifest has not analysed this property yet."}
            </p>
          </Link>
        ))}
      </div>

      {cards.length === 0 && (
        <div className="card">
          <p style={{ color: "var(--text-dim)" }}>
            No properties are currently featured. Not available from the source checked.
          </p>
        </div>
      )}

      <Footer />
    </div>
  );
}
