import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { buildCheckinLink, isWhatsAppConfigured } from "@/lib/whatsapp";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
export const dynamic = "force-dynamic";

interface StubBookingPageProps {
  searchParams: Promise<{ hotel?: string; supplier?: string; outcome?: string }>;
}

export default async function StubBookingPage({ searchParams }: StubBookingPageProps) {
  const params = await searchParams;
  const hotel = params.hotel
    ? await db.query.hotels.findFirst({ where: eq(schema.hotels.id, params.hotel) })
    : null;
  const supplier = params.supplier
    ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.slug, params.supplier) })
    : null;
  const outcome = params.outcome
    ? await db.query.bookingOutcomes.findFirst({ where: eq(schema.bookingOutcomes.id, params.outcome) })
    : null;
  const rate = outcome ? await db.query.rates.findFirst({ where: eq(schema.rates.id, outcome.rateId) }) : null;

  const checkinLink =
    outcome && rate && hotel && supplier
      ? buildCheckinLink({
          outcomeId: outcome.id,
          hotelName: hotel.name,
          supplierName: supplier.name,
          checkIn: rate.checkIn.toISOString().slice(0, 10),
          checkOut: rate.checkOut.toISOString().slice(0, 10),
        })
      : null;

  return (
    <div className="shell">
      <NavBar />

      <div className="card">
        <h1 className="card-title">This is where the booking happens</h1>
        <p>
          In demo mode, this click would open <strong>{supplier?.name ?? "the selected source"}</strong>
          &apos;s own booking page for <strong>{hotel?.name ?? "this property"}</strong> — Rate Manifest
          doesn&apos;t process payment, hold inventory, or handle cancellations itself. That stays with the
          underlying supplier, exactly as disclosed on the results page.
        </p>
        <p>
          After a real booking, this is where we&apos;d ask you to confirm your stay actually happened at
          the price and terms shown — that confirmation (or a reported issue) is what builds this
          supplier&apos;s reliability signal for future searches.
        </p>

        {checkinLink ? (
          <a href={checkinLink} target="_blank" rel="noopener noreferrer" className="btn btn-whatsapp">
            Confirm this stay on WhatsApp →
          </a>
        ) : (
          isWhatsAppConfigured() === false && (
            <p className="footnote" style={{ marginTop: "0.5rem" }}>
              (WhatsApp check-in isn&apos;t configured yet — set NEXT_PUBLIC_WHATSAPP_NUMBER in .env.)
            </p>
          )
        )}

        <div style={{ marginTop: "1rem" }}>
          <Link href="/" className="btn btn-ghost">
            Back to search
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
