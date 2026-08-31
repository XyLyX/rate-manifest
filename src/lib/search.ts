import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { SUPPLIER_ADAPTERS, type SupplierOffer } from "@/lib/suppliers";
import { scoreOffers, type ScoredOffer } from "@/lib/scoring/bestDealScore";
import { checkAndTriggerAlerts } from "@/lib/priceTracking";

export interface DisplayOffer extends ScoredOffer {
  outboundUrl: string;
  nightlyPrice: number;
  taxesFeesPerNight: number;
  cancellationDeadlineIso: string | null;
}

export interface SearchResult {
  searchId: string;
  hotel: {
    id: string;
    name: string;
    area: string;
    city: string;
    starRating: number;
    isMockData: boolean;
  };
  nights: number;
  sourcesChecked: number;
  offers: DisplayOffer[];
  cheapestTotal: number | null;
  averageTotal: number | null;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

/**
 * Calls every registered supplier adapter, persists what came back (Rate +
 * Cancellation rows, and a PriceHistory upsert per hotel/supplier/date),
 * scores the results with the Best Deal Score, and returns everything the
 * results page needs to render. This is the one place that touches every
 * adapter — the UI never calls an adapter directly.
 */
export async function runSearch(hotelId: string, checkIn: string, checkOut: string): Promise<SearchResult | null> {
  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, hotelId) });
  if (!hotel) return null;

  const nights = nightsBetween(checkIn, checkOut);
  const searchId = `search_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const results = await Promise.allSettled(
    SUPPLIER_ADAPTERS.map((adapter) => adapter.getOffers({ hotelId, checkIn, checkOut }))
  );

  const offersBySupplier: { adapterSlug: string; offers: SupplierOffer[] }[] = [];
  results.forEach((r, i) => {
    const adapter = SUPPLIER_ADAPTERS[i];
    if (!adapter) return;
    if (r.status === "fulfilled") {
      offersBySupplier.push({ adapterSlug: adapter.slug, offers: r.value });
    } else {
      // One supplier failing must never take the whole results page down —
      // it just means one fewer source checked this time.
      console.error(`Supplier adapter "${adapter.slug}" failed:`, r.reason);
    }
  });

  // "Sources checked" counts distinct named sellers (e.g. Booking.com,
  // Expedia), not adapters — one adapter (Travelpayouts, or the mock
  // adapter here) can broker offers from several real sellers in a single
  // call, and the results page's summary line is about how many sellers
  // were compared, not how many integrations ran.
  const sourcesChecked = new Set(offersBySupplier.flatMap((s) => s.offers.map((o) => o.supplierSlug))).size;

  const scorable: {
    offer: SupplierOffer;
    supplierId: string;
    supplierName: string;
    reliabilityScore: number | null;
    bookingOutcomeCount: number;
  }[] = [];

  const observedDate = new Date();
  observedDate.setUTCHours(0, 0, 0, 0);

  for (const { adapterSlug, offers } of offersBySupplier) {
    if (offers.length === 0) continue;

    const room = await db.query.rooms.findFirst({ where: eq(schema.rooms.hotelId, hotelId) });
    if (!room) continue;

    for (const offer of offers) {
      // Supplier identity comes from the offer itself (the real named
      // seller, e.g. "booking"), never from the adapter that fetched it —
      // an adapter like Travelpayouts brokers several real OTAs, and the
      // trust/reliability layer needs to track the actual seller, not the
      // integration mechanism.
      let supplier = await db.query.suppliers.findFirst({
        where: eq(schema.suppliers.slug, offer.supplierSlug),
      });
      if (!supplier) {
        const id = newId();
        await db.insert(schema.suppliers).values({
          id,
          slug: offer.supplierSlug,
          name: offer.supplierName,
          integrationType: adapterSlug === "mock" ? "mock" : "api_partner",
        });
        supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id) });
      }
      if (!supplier) continue;

      const rateId = newId();
      await db.insert(schema.rates).values({
        id: rateId,
        searchId,
        hotelId,
        roomId: room.id,
        supplierId: supplier.id,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        nights,
        currency: offer.currency,
        nightlyPrice: offer.nightlyPrice,
        taxesFeesPerNight: offer.taxesFeesPerNight,
        totalPrice: offer.totalPrice,
        soldOut: offer.soldOut,
      });

      await db.insert(schema.cancellations).values({
        id: newId(),
        rateId,
        isFreeCancellation: offer.cancellation.isFreeCancellation,
        deadline: offer.cancellation.deadlineIso ? new Date(offer.cancellation.deadlineIso) : null,
        penaltyPercentage: offer.cancellation.penaltyPercentage,
      });

      if (!offer.soldOut) {
        const existing = await db.query.priceHistory.findFirst({
          where: and(
            eq(schema.priceHistory.hotelId, hotelId),
            eq(schema.priceHistory.supplierId, supplier.id),
            eq(schema.priceHistory.checkIn, new Date(checkIn)),
            eq(schema.priceHistory.observedDate, observedDate)
          ),
        });
        if (existing) {
          await db
            .update(schema.priceHistory)
            .set({ nightlyPrice: offer.nightlyPrice, totalPrice: offer.totalPrice, soldOut: false })
            .where(eq(schema.priceHistory.id, existing.id));
        } else {
          await db.insert(schema.priceHistory).values({
            id: newId(),
            hotelId,
            supplierId: supplier.id,
            checkIn: new Date(checkIn),
            observedDate,
            nightlyPrice: offer.nightlyPrice,
            totalPrice: offer.totalPrice,
            soldOut: false,
          });
        }
      }

      scorable.push({
        offer: { ...offer, outboundUrl: `${offer.outboundUrl}&rate=${rateId}` },
        supplierId: supplier.id,
        supplierName: supplier.name,
        reliabilityScore: supplier.reliabilityScore,
        bookingOutcomeCount: supplier.bookingOutcomeCount,
      });
    }
  }

  const scored = scoreOffers(
    scorable.map((s) => ({
      supplierSlug: s.offer.supplierSlug,
      supplierName: s.supplierName,
      totalPrice: s.offer.totalPrice,
      isFreeCancellation: s.offer.cancellation.isFreeCancellation,
      reliabilityScore: s.reliabilityScore,
      bookingOutcomeCount: s.bookingOutcomeCount,
      soldOut: s.offer.soldOut,
    }))
  );

  // Re-attach the full offer payload (outboundUrl, cancellation detail)
  // that ScoredOffer's slimmer shape doesn't carry, keyed by supplierSlug —
  // fine here because the mock adapter returns at most one offer per
  // supplier per search.
  const bySlug = new Map(scorable.map((s) => [s.offer.supplierSlug, s.offer]));
  const enriched: DisplayOffer[] = scored.map((s) => {
    const offer = bySlug.get(s.supplierSlug);
    return {
      ...s,
      outboundUrl: offer?.outboundUrl ?? "#",
      nightlyPrice: offer?.nightlyPrice ?? 0,
      taxesFeesPerNight: offer?.taxesFeesPerNight ?? 0,
      cancellationDeadlineIso: offer?.cancellation.deadlineIso ?? null,
    };
  });

  const availableTotals = enriched.filter((o) => !o.soldOut).map((o) => o.totalPrice);
  const cheapestTotal = availableTotals.length ? Math.min(...availableTotals) : null;
  const averageTotal = availableTotals.length
    ? availableTotals.reduce((a, b) => a + b, 0) / availableTotals.length
    : null;

  // Anyone who opted into "track this price" for this exact hotel/dates
  // gets checked against the new cheapest total right here — see
  // src/lib/priceTracking.ts for why this is opportunistic rather than a
  // background job.
  if (cheapestTotal != null) {
    await checkAndTriggerAlerts(hotelId, checkIn, checkOut, cheapestTotal);
  }

  return {
    searchId,
    hotel: {
      id: hotel.id,
      name: hotel.name,
      area: hotel.area,
      city: hotel.city,
      starRating: hotel.starRating,
      isMockData: hotel.isMockData,
    },
    nights,
    sourcesChecked,
    offers: enriched,
    cheapestTotal,
    averageTotal,
  };
}
