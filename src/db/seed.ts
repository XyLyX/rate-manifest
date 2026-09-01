import { eq } from "drizzle-orm";
import { db, schema } from "./client";
import { newId } from "@/lib/id";

// The original demo property set (six fictional placeholders) was seeded
// here until 2026-09-01. Dropped by explicit user decision once every
// emirate had a real, StayingAPI-backed hotel set - see DECISIONS.md,
// "Demo hotels dropped from the catalog." This file now only seeds
// suppliers; the real hotel catalog lives in
// src/app/api/admin/init-db/route.ts's SCHEMA_SQL (the mechanism
// production and local-Postgres verification both actually use).
const HOTELS: { slug: string; name: string; area: string; starRating: number; basePrice: number }[] = [];

async function upsertSupplier(data: {
  slug: string;
  name: string;
  integrationType: string;
  tosNotes: string;
}) {
  const existing = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.slug, data.slug) });
  if (existing) return existing;
  const id = newId();
  await db.insert(schema.suppliers).values({
    id,
    slug: data.slug,
    name: data.name,
    integrationType: data.integrationType,
    requiresClickToReveal: true,
    allowsMultiSupplierDisplay: true,
    tosNotes: data.tosNotes,
  });
  return db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) });
}

// Suppliers are keyed by the real named seller (Booking.com, Expedia, ...)
// per the Supply Ledger — never by the adapter/integration that fetched
// the offer. search.ts also auto-creates these on first sight, so this
// seeding is just for a clean, pre-populated first run.
const SUPPLIERS = [
  { slug: "booking", name: "Booking.com", integrationType: "mock" },
  { slug: "expedia", name: "Expedia", integrationType: "mock" },
  { slug: "agoda", name: "Agoda", integrationType: "mock" },
  { slug: "hotelscom", name: "Hotels.com", integrationType: "mock" },
  { slug: "tripcom", name: "Trip.com", integrationType: "mock" },
  { slug: "direct", name: "Direct — hotel website", integrationType: "mock" },
];

async function main() {
  for (const s of SUPPLIERS) {
    await upsertSupplier({
      slug: s.slug,
      name: s.name,
      integrationType: s.integrationType,
      tosNotes:
        "Demo mode: prices are simulated, not fetched from this seller. See the Supply Ledger for this source's real ToS/access classification once a live adapter is wired up.",
    });
  }

  for (const h of HOTELS) {
    const existingHotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, h.slug) });
    if (!existingHotel) {
      await db.insert(schema.hotels).values({
        id: h.slug,
        name: h.name,
        area: h.area,
        city: "Dubai",
        starRating: h.starRating,
        isMockData: true,
        mockBasePrice: h.basePrice,
      });
    }

    const existingRoom = await db.query.rooms.findFirst({ where: eq(schema.rooms.hotelId, h.slug) });
    if (!existingRoom) {
      await db.insert(schema.rooms).values({
        id: newId(),
        hotelId: h.slug,
        normalizedType: "double_standard",
        occupancy: 2,
        bedConfig: "1 king bed",
      });
    }
  }

  console.log(`Seeded ${HOTELS.length} demo hotels and ${SUPPLIERS.length} suppliers.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
