import { eq } from "drizzle-orm";
import { db, schema } from "./client";
import { newId } from "@/lib/id";

// Same demo property set as the original Rate Manifest prototype, kept for
// continuity — these are fictional placeholders, not real hotels. Once a
// real supplier feed (Travelpayouts, etc.) is live, real hotel content
// replaces this seed entirely; isMockData=true is what marks these rows as
// safe to delete/ignore at that point.
const HOTELS = [
  { slug: "marina-skyline", name: "Marina Skyline Residences", area: "Dubai Marina", starRating: 5, basePrice: 1450 },
  { slug: "old-town-courtyard", name: "Old Town Courtyard Hotel", area: "Downtown / Old Town", starRating: 4, basePrice: 780 },
  { slug: "palm-crescent", name: "Palm Crescent Beach Resort", area: "Palm Jumeirah", starRating: 5, basePrice: 2100 },
  { slug: "business-bay-central", name: "Business Bay Central Hotel", area: "Business Bay", starRating: 3, basePrice: 420 },
  { slug: "al-fahidi-heritage", name: "Al Fahidi Heritage Inn", area: "Bur Dubai", starRating: 3, basePrice: 340 },
  { slug: "jbr-beachfront", name: "JBR Beachfront Suites", area: "Jumeirah Beach Residence", starRating: 4, basePrice: 950 },
];

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
