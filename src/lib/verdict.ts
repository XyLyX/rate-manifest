import { db, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { getDealSignal } from "@/lib/scoring/dealSignal";
import type { DisplayOffer } from "@/lib/search";

// The Decision Audit Trail's one writer. Persists exactly what
// scoreOffers()/getDealSignal() already computed and showed on the
// RateManifest Verdict panel (see src/components/RateManifestVerdict.tsx)
// as one immutable row in the new `verdicts` table (see src/db/schema.ts
// for the full rationale). Called once per runSearch(), right after the
// results are scored - see src/lib/search.ts.
//
// This is Sprint 1 of the Travel Decision Intelligence Platform direction
// (2026-09-05): "start capturing every observation immediately - the
// historical clock starts the moment this exists." Nothing reads this
// table yet. It is deliberately a pure write, same shape as every other
// audit/history table this app already keeps (price_history, events): the
// value is in having the record, not in anything consuming it today.
//
// Never throws. A failure to record a verdict must never break the search
// a real visitor is waiting on - same discipline runSearch() already
// applies to a failing supplier adapter (Promise.allSettled + a caught
// console.error, not a thrown error).
export interface VerdictEvidenceOffer {
  supplierSlug: string;
  supplierName: string;
  totalPrice: number;
  soldOut: boolean;
  isFreeCancellation: boolean;
  score: number;
}

export interface RecordVerdictInput {
  searchId: string;
  hotelId: string;
  // Already scored and sorted best-first by scoreOffers() - see
  // bestDealScore.ts. offers[0] (if any) is what the Verdict panel shows.
  offers: DisplayOffer[];
  sourcesChecked: number;
  cheapestTotal: number | null;
  averageTotal: number | null;
  currency: string;
}

// Return value added 2026-09-05 for the four-page journey's Page 2 (Check
// IQ): "Select this deal" (see src/app/actions/trip.ts's selectDeal())
// stores this id on the trip_selections row so Page 4's summary can show
// which Verdict a customer actually acted on, without a second query
// keyed on searchId - the id this function already generates internally
// was simply never handed back to the caller before. Still never throws;
// still returns null on any failure, same as the old void return meant
// "don't rely on this," just now explicit at the type level.
export async function recordVerdict(input: RecordVerdictInput): Promise<string | null> {
  try {
    const top = input.offers[0] ?? null;
    // Same fallback getDealSignal(0) uses elsewhere for "nothing available
    // to score" - see bestDealScore.ts's own soldOut/empty-availability path.
    const signal = getDealSignal(top?.score ?? 0);

    const evidence: VerdictEvidenceOffer[] = input.offers.map((o) => ({
      supplierSlug: o.supplierSlug,
      supplierName: o.supplierName,
      totalPrice: o.totalPrice,
      soldOut: o.soldOut,
      isFreeCancellation: o.isFreeCancellation,
      score: o.score,
    }));

    const id = newId();
    await db.insert(schema.verdicts).values({
      id,
      searchId: input.searchId,
      hotelId: input.hotelId,
      score: top?.score ?? 0,
      tier: signal.tier,
      decision: signal.verdict,
      topSupplierSlug: top?.supplierSlug ?? null,
      reasonsJson: JSON.stringify(top?.reasons ?? []),
      sourcesChecked: input.sourcesChecked,
      cheapestTotal: input.cheapestTotal,
      averageTotal: input.averageTotal,
      currency: input.currency,
      evidenceJson: JSON.stringify(evidence),
    });
    return id;
  } catch (err) {
    // Should be rare (a DB write failing when every other write in this
    // same request presumably succeeded) but must never take the results
    // page down - see the module comment above.
    console.error("recordVerdict: failed to persist verdict (non-fatal):", err);
    return null;
  }
}
