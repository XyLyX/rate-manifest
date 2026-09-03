import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { MIN_OBSERVATION_DAYS_FOR_PRICE_INSIGHT } from "@/lib/constants";

// "Is this a good price?" (Layer A, #3 on the master feature list) - the
// first thing this app has ever read back out of price_history, the
// durable ledger runSearch() has been writing to since it existed (see
// schema.ts's own comment on priceHistory: "the actual asset the
// three-layer architecture calls the moat"). Deliberately narrow: one
// hotel, one exact check-in date, because a price for a different night
// tells a visitor nothing about whether THIS night is a good price.
//
// The one rule that is not optional, same as bestDealScore.ts's
// reliability component and DECISIONS.md's standing rule against
// fabricated signals: with too few observations, this must say so rather
// than compute a range from one or two data points and present it as a
// pattern. See MIN_OBSERVATION_DAYS_FOR_PRICE_INSIGHT.
export interface PriceInsight {
  hasEnoughData: boolean;
  observationDays: number;
  lowestSeen: number | null;
  highestSeen: number | null;
  averageSeen: number | null;
  currentTotal: number | null;
  // Positive = currentTotal sits below the average we've observed (a good
  // sign); negative = above it. Null whenever there isn't a current total
  // to compare (nothing available right now) or not enough history yet.
  percentVsAverage: number | null;
}

function emptyInsight(observationDays: number, currentTotal: number | null): PriceInsight {
  return {
    hasEnoughData: false,
    observationDays,
    lowestSeen: null,
    highestSeen: null,
    averageSeen: null,
    currentTotal,
    percentVsAverage: null,
  };
}

/**
 * Reads price_history for one hotel/check-in pair - never writes, never
 * calls a supplier. runSearch() is the only writer (see src/lib/search.ts);
 * this only aggregates what's already there. Every non-sold-out row across
 * every supplier checked on a given calendar day is collapsed to that
 * day's cheapest total, so a hotel checked against five sellers on the
 * same day contributes one observation, not five - the question is "what
 * did this night cost on days X, Y, Z," not "how many rows exist."
 */
export async function getPriceInsight(
  hotelId: string,
  checkIn: string,
  currentTotal: number | null
): Promise<PriceInsight> {
  const rows = await db.query.priceHistory.findMany({
    where: and(
      eq(schema.priceHistory.hotelId, hotelId),
      eq(schema.priceHistory.checkIn, new Date(checkIn)),
      eq(schema.priceHistory.soldOut, false)
    ),
  });

  const cheapestByDay = new Map<string, number>();
  for (const row of rows) {
    const dayKey = row.observedDate.toISOString().slice(0, 10);
    const existing = cheapestByDay.get(dayKey);
    if (existing == null || row.totalPrice < existing) cheapestByDay.set(dayKey, row.totalPrice);
  }

  const observationDays = cheapestByDay.size;
  if (observationDays < MIN_OBSERVATION_DAYS_FOR_PRICE_INSIGHT) {
    return emptyInsight(observationDays, currentTotal);
  }

  const values = [...cheapestByDay.values()];
  const lowestSeen = Math.min(...values);
  const highestSeen = Math.max(...values);
  const averageSeen = values.reduce((a, b) => a + b, 0) / values.length;
  const percentVsAverage =
    currentTotal != null && averageSeen > 0 ? Math.round(((averageSeen - currentTotal) / averageSeen) * 100) : null;

  return {
    hasEnoughData: true,
    observationDays,
    lowestSeen,
    highestSeen,
    averageSeen,
    currentTotal,
    percentVsAverage,
  };
}
