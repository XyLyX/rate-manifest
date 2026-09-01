import Link from "next/link";
import { runSearch } from "@/lib/search";
import { logEvent } from "@/lib/events";
import { getSessionId } from "@/lib/session";
import { ensureLiveCheckTriggered } from "@/lib/suppliers/stayingApiRefresh";
import ResultsList from "@/components/ResultsList";
import { LiveCheckStatus } from "@/components/LiveCheckStatus";
import { KlookTripSection } from "@/components/KlookTripSection";
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

      {liveCheck.kind === "checking" ? (
        <LiveCheckStatus hotelId={result.hotel.id} checkIn={checkIn} checkOut={checkOut} />
      ) : liveCheck.kind === "error" ? (
        <p className="empty-state">
          We could not check real-time prices for these dates just now - please try again in a moment.
        </p>
      ) : available.length === 0 ? (
        <p className="empty-state">No availability found across the sources we checked for these dates.</p>
      ) : (
        <ResultsList
          searchId={result.searchId}
          hotelId={result.hotel.id}
          checkIn={checkIn}
          checkOut={checkOut}
          offers={available}
          averageTotal={result.averageTotal}
          cheapestTotal={result.cheapestTotal}
        />
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

      {/* Layer 2 (Monetization) - see DECISIONS.md, "Two-layer architecture."
          Only for real hotels, and only once this hotel's results have
          actually rendered (not during the live-check spinner, not on a
          hard error) - a visitor still viewing "Checking real-time
          prices..." isn't ready for a second, unrelated call to action. */}
      {!result.hotel.isMockData && liveCheck.kind !== "checking" && liveCheck.kind !== "error" && (
        <KlookTripSection />
      )}

      <Footer />
    </div>
  );
}
