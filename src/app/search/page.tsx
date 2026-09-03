import Link from "next/link";
import { runSearch } from "@/lib/search";
import { logEvent } from "@/lib/events";
import { getSessionId } from "@/lib/session";
import { ensureLiveCheckTriggered } from "@/lib/suppliers/stayingApiRefresh";
import { getPriceInsight } from "@/lib/priceInsight";
import ResultsList from "@/components/ResultsList";
import { LiveCheckStatus } from "@/components/LiveCheckStatus";
import { VerifiedRatePanel, type VerifiedRateState } from "@/components/VerifiedRatePanel";
import { PriceInsightPanel } from "@/components/PriceInsightPanel";
import { RateManifestVerdict } from "@/components/RateManifestVerdict";
import { KlookTripSection } from "@/components/KlookTripSection";
import { ThingsToDoSection } from "@/components/ThingsToDoSection";
import { searchThingsToDo } from "@/lib/viator/searchThingsToDo";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

interface SearchPageProps {
  searchParams: Promise<{ hotel?: string; checkin?: string; checkout?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const hotelId = params.hotel;
  const checkIn = params.checkin;
  const checkOut = params.checkout;

  if (!hotelId || !checkIn || !checkOut) {
    return (
      <div className="shell">
        <p className="empty-state">
          Missing search details. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  const sessionId = await getSessionId();
  await logEvent({ type: "search", sessionId, hotelId, metadata: { checkIn, checkOut } });

  // Live on-demand check - see DECISIONS.md, "Live on-demand check on
  // /search." For a real hotel with no cache row at all for this exact
  // date pair, this claims the pair and fires one real StayingAPI call
  // (see ensureLiveCheckTriggered for why that's safe under concurrent
  // requests). Deliberately called BEFORE runSearch(): if StayingAPI
  // already had this pair cached on its own side, this resolves "ready"
  // immediately and runSearch() below finds the fresh row in the same page
  // load - no extra round trip. Mock hotels and dates already checked
  // (however long ago) are untouched - "not-applicable" and "ready" both
  // fall straight through to the existing flow below.
  const liveCheck = await ensureLiveCheckTriggered(hotelId, checkIn, checkOut);

  const result = await runSearch(hotelId, checkIn, checkOut);

  if (!result) {
    return (
      <div className="shell">
        <p className="empty-state">
          That property wasn&apos;t found. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  await logEvent({
    type: "results_viewed",
    sessionId,
    hotelId,
    metadata: { searchId: result.searchId, sourcesChecked: result.sourcesChecked },
  });

  const available = result.offers.filter((o) => !o.soldOut);
  const soldOut = result.offers.filter((o) => o.soldOut);

  // Phase 1 (Layer A) - see DECISIONS.md, "Phase 1 (Layer A): Verified
  // Rate panel, Is this a good price?, RateManifest Verdict (2026-09-03)."
  // showComparison mirrors the exact condition ResultsList itself is
  // rendered under below - the verdict and price-history panels only make
  // sense when there's an actual comparison to summarize.
  const showComparison = liveCheck.kind !== "checking" && liveCheck.kind !== "error" && available.length > 0;

  // Cache-only read, same as every other panel here - never triggers a
  // new lookup. Only run when there's something to compare against;
  // skipped entirely during "checking"/"error" so those states don't pay
  // for a query whose answer nothing on screen would use yet.
  const priceInsight = showComparison ? await getPriceInsight(result.hotel.id, checkIn, result.cheapestTotal) : null;

  const verifiedState: VerifiedRateState =
    liveCheck.kind === "ready" ? (available.length > 0 ? "verified" : "no-availability") : "not-checked";

  // Things To Do (Viator) - see DECISIONS.md, "Decision: build a native
  // Viator Things To Do integration." Same gating as KlookTripSection
  // below (real hotels only, not mid live-check) so a visitor still
  // watching the "Checking real-time prices..." spinner doesn't also
  // trigger a Viator call for a page they haven't finished loading yet.
  // Runs live per search rather than through a cache table - Viator's own
  // docs say /products/search must not be used to ingest/cache the
  // catalog, and Basic Access doesn't have the bulk endpoint that would
  // be for, so a direct per-search call is the documented usage pattern
  // here, not a shortcut. Never throws - searchThingsToDo() degrades to
  // [] on any failure, same as every other supplier in this app.
  const thingsToDoProducts =
    !result.hotel.isMockData && liveCheck.kind !== "checking"
      ? await searchThingsToDo({
          destinationName: result.hotel.city,
          startDate: checkIn,
          endDate: checkOut,
          currency: "AED",
        })
      : [];

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />

      {result.hotel.isMockData && (
        <div className="demo-banner">
          Demo mode — {result.hotel.name}&apos;s prices below are simulated for this prototype, not live
          rates from these sources.
        </div>
      )}

      <div className="results-header">
        <h1>{result.hotel.name}</h1>
        <div className="results-meta">
          {result.hotel.area} · {result.hotel.starRating}-star · {result.nights} night
          {result.nights > 1 ? "s" : ""} · {checkIn} → {checkOut}
        </div>
        {liveCheck.kind !== "checking" && (
          <div className="summary-stat">
            {result.sourcesChecked} source{result.sourcesChecked === 1 ? "" : "s"} checked
            {result.cheapestTotal != null && ` — best from AED ${Math.round(result.cheapestTotal).toLocaleString("en-AE")}`}
          </div>
        )}
      </div>

      {/* Verified Rate panel - real hotels only. See VerifiedRatePanel.tsx
          for why mock hotels skip this entirely (the .demo-banner above
          already says the prices are simulated). */}
      {!result.hotel.isMockData && liveCheck.kind !== "checking" && (
        <VerifiedRatePanel
          state={verifiedState}
          sourcesChecked={result.sourcesChecked}
          checkedAt={result.offers[0]?.checkedAt ?? null}
        />
      )}

      {liveCheck.kind === "checking" ? (
        <LiveCheckStatus hotelId={result.hotel.id} checkIn={checkIn} checkOut={checkOut} />
      ) : showComparison ? (
        <>
          {/* Non-null: showComparison already guarantees available.length > 0. */}
          <RateManifestVerdict offer={available[0]!} sourcesChecked={result.sourcesChecked} />
          {priceInsight && <PriceInsightPanel insight={priceInsight} />}
          <ResultsList
            searchId={result.searchId}
            hotelId={result.hotel.id}
            checkIn={checkIn}
            checkOut={checkOut}
            offers={available}
            averageTotal={result.averageTotal}
            cheapestTotal={result.cheapestTotal}
          />
        </>
      ) : liveCheck.kind === "error" ? (
        // Real hotels only ever land here (ensureLiveCheckTriggered
        // returns "not-applicable" for mock hotels, never "error") - the
        // VerifiedRatePanel above already carries this message ("Not
        // checked yet"), so nothing further renders.
        null
      ) : (
        // available.length === 0 with a completed check. Real hotels: the
        // VerifiedRatePanel above already carries this message ("Checked,
        // nothing available"). Mock hotels render no VerifiedRatePanel, so
        // they still need this plain-text fallback for the rare case every
        // simulated provider's own sold-out roll landed true.
        result.hotel.isMockData && (
          <p className="empty-state">No availability found across the sources we checked for these dates.</p>
        )
      )}

      {liveCheck.kind !== "checking" && liveCheck.kind !== "error" && soldOut.length > 0 && (
        <p className="footnote">
          {soldOut.length} source{soldOut.length === 1 ? "" : "s"} checked had no availability for these
          dates.
        </p>
      )}

      <p className="footnote">
        Rate Manifest shows its own computed summary first; the named source and link for any offer only
        appear once you reveal it. This keeps every source&apos;s display terms satisfied without hiding
        that a comparison happened.
      </p>

      {/* Layer 2 (Monetization) - see DECISIONS.md, "Two-layer architecture,"
          and "Klook shown on live-check error too." Only suppressed during
          the live-check spinner itself (a visitor mid "Checking real-time
          prices..." isn't ready for a second call to action) - shown on
          BOTH "ready" and "error", because Klook never depended on
          StayingAPI succeeding. Gating it behind a successful check would
          make it disappear along with everything else whenever StayingAPI
          credits run out, which defeats the point of it being a separate
          monetization path in the first place. */}
      {!result.hotel.isMockData && liveCheck.kind !== "checking" && <ThingsToDoSection products={thingsToDoProducts} />}

      {!result.hotel.isMockData && liveCheck.kind !== "checking" && <KlookTripSection />}

      <Footer />
    </div>
  );
}
