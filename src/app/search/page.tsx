import Link from "next/link";
import { runSearch } from "@/lib/search";
import { logEvent } from "@/lib/events";
import { getSessionId } from "@/lib/session";
import ResultsList from "@/components/ResultsList";
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
        <div className="summary-stat">
          {result.sourcesChecked} source{result.sourcesChecked === 1 ? "" : "s"} checked
          {result.cheapestTotal != null && ` — best from AED ${Math.round(result.cheapestTotal).toLocaleString("en-AE")}`}
        </div>
      </div>

      {available.length === 0 ? (
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

      {soldOut.length > 0 && (
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

      <Footer />
    </div>
  );
}
