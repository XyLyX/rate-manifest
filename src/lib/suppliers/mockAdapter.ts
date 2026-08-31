import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { SearchParams, SupplierAdapter, SupplierOffer } from "./types";

// Deterministic seeded-pricing logic, ported from the original Rate
// Manifest prototype (rate-manifest.html). Same hash function, same
// per-provider bias, same variance band — so a given (hotel, checkIn)
// always produces the same demo prices, rather than random noise on every
// reload. This is clearly labeled as mock data everywhere it surfaces in
// the UI; it exists so the rest of the app (scoring, click-to-reveal,
// event logging, DB persistence) is exercised by realistic-looking data
// before a single real supplier credential exists.

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function seededRand(seedStr: string): number {
  return xmur3(seedStr)();
}

function tourismDirham(stars: number): number {
  if (stars >= 5) return 20;
  if (stars === 4) return 15;
  return 10;
}

interface MockProvider {
  slug: string;
  name: string;
  bias: number;
}

const MOCK_PROVIDERS: MockProvider[] = [
  { slug: "booking", name: "Booking.com", bias: -0.03 },
  { slug: "expedia", name: "Expedia", bias: -0.02 },
  { slug: "agoda", name: "Agoda", bias: -0.05 },
  { slug: "hotelscom", name: "Hotels.com", bias: 0.0 },
  { slug: "tripcom", name: "Trip.com", bias: -0.04 },
  { slug: "direct", name: "Direct — hotel website", bias: 0.02 },
];

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 1;
}

export const mockAdapter: SupplierAdapter = {
  slug: "mock",
  displayName: "Mock (demo pricing)",

  async getOffers(params: SearchParams): Promise<SupplierOffer[]> {
    const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, params.hotelId) });
    if (!hotel || hotel.mockBasePrice == null) return [];

    const room = await db.query.rooms.findFirst({ where: eq(schema.rooms.hotelId, hotel.id) });
    if (!room) return [];

    const nights = nightsBetween(params.checkIn, params.checkOut);
    const base = hotel.mockBasePrice;

    return MOCK_PROVIDERS.map((p): SupplierOffer => {
      const seed = `${hotel.id}|${p.slug}|${params.checkIn}`;
      const rAvail = seededRand(`${seed}|avail`);
      const soldOut = rAvail < 0.08;

      const rPrice = seededRand(`${seed}|price`);
      const variance = p.bias + (rPrice - 0.5) * 0.2;
      const nightlyPrice = Math.round((base * (1 + variance)) / 10) * 10;
      const taxesFeesPerNight = tourismDirham(hotel.starRating) + Math.round(nightlyPrice * 0.05);
      const totalPrice = (nightlyPrice + taxesFeesPerNight) * nights;

      const rCancel = seededRand(`${seed}|cancel`);
      const isFreeCancellation = rCancel > 0.35;
      const checkInDate = new Date(params.checkIn);
      const deadline = new Date(checkInDate);
      deadline.setDate(deadline.getDate() - 3);

      return {
        supplierSlug: p.slug,
        supplierName: p.name,
        roomNormalizedType: room.normalizedType,
        soldOut,
        currency: "AED",
        nightlyPrice,
        taxesFeesPerNight,
        totalPrice,
        cancellation: {
          isFreeCancellation,
          deadlineIso: isFreeCancellation ? deadline.toISOString() : null,
          penaltyPercentage: isFreeCancellation ? null : 100,
        },
        // Demo mode: nothing to actually book yet, so this points at an
        // internal stub rather than a real OTA URL.
        outboundUrl: `/api/click?stub=1&hotel=${encodeURIComponent(hotel.id)}&supplier=${p.slug}`,
      };
    });
  },
};
