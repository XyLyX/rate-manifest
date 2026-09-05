import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { runSearch } from "@/lib/search";
import { logEvent } from "@/lib/events";
import { getSessionId } from "@/lib/session";
import { getTrip } from "@/lib/trip";
import { ensureLiveCheckTriggered } from "@/lib/suppliers/stayingApiRefresh";
import { getPriceInsight } from "@/lib/priceInsight";
import { humanizeRoomType } from "@/lib/roomType";
import ResultsList from "@/components/ResultsList";
import { LiveCheckStatus } from "@/components/LiveCheckStatus";
import { YourHotelSummary } from "@/components/YourHotelSummary";
import { VerifiedRatePanel, type VerifiedRateState } from "@/components/VerifiedRatePanel";
import { PriceInsightPanel } from "@/components/PriceInsightPanel";
import { WhyThisDealPanel } from "@/components/WhyThisDealPanel";
import { RateManifestVerdict } from "@/components/RateManifestVerdict";
import { BeforeYouBookPanel } from "@/components/BeforeYouBookPanel";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

interface CheckIqPageProps {
  searchParams: Promise<{ hotel?: string; checkin?: string; checkout?: string; trip?: string }>;
}

// Page 2 of the four-page customer journey - Check IQ, "the heart of
// RateManifest" per claude/travel-decision-platform-assessment.md's "THE
// MOST IMPORTANT UX HIERARCHY": "Everything before it gets the customer
// there. Everything after it builds on the decision already made." Merges
// what used to be two separate pages/steps:
//
//   - /hotel's free "Analyse This Hotel" preview gate (a deliberate pause
//     before spending a StayingAPI credit - see DECISIONS.md, "The
//     Analyse This Hotel gate (2026-09-03)")
//   - /search's actual rate intelligence (the credit-spending comparison)
//
// into one page, per the final spec's own resolution of the open question
// this raised while planning Pages 1-2 (see the technical blueprint,
// Section 10, "open decisions"): "fold the credit-safety trigger into
// Check IQ itself" - clicking "Check IQ →" on Page 1's shortlist already
// IS the deliberate, once-per-hotel-per-dates moment a real comparison
// runs; a second confirmation click in between would just repeat the same
// decision the visitor already made by choosing to check this property.
// ensureLiveCheckTriggered()'s own claim-then-check concurrency guard
// still means a second visitor hitting this same hotel/date pair costs
// nothing extra.
//
// Deliberately does NOT render Things To Do (Viator) or Klook here - both
// used to live at the bottom of the old /search page, but under the
// four-page journey that content is Page 3's job (Complete Your Trip,
// reached only after a hotel/rate is actually selected below). Showing it
// here, before a decision is made, worked against the guided step-by-step
// design the final spec calls for.
export default async function CheckIqPage({ searchParams }: CheckIqPageProps) {
  const params = await searchParams;
  const hotelId = params.hotel;
  const checkIn = params.checkin;
  const checkOut = params.checkout;
  const tripId = params.trip ?? "";

  if (!hotelId || !checkIn || !checkOut) {
    return (
      <div className="shell">
        <p className="empty-state">
          Missing search details. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  const trip = tripId ? await getTrip(tripId) : null;

  const sessionId = await getSessionId();
  await logEvent({ type: "search", sessionId, hotelId, metadata: { checkIn, checkOut, tripId: tripId || null } });

  // The credit-safety trigger, folded in here per the final spec (see the
  // module comment above) - see DECISIONS.md, "Live on-demand check on
  // /search," for why this is safe to call on every page load
  // (claim-then-check via a unique index) and why it runs BEFORE
  // runSearch() (a StayingAPI cache row landed here resolves immediately,
  // no extra round trip). Mock hotels and already-checked dates fall
  // straight through untouched.
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

  const room = await db.query.rooms.findFirst({ where: eq(schema.rooms.hotelId, result.hotel.id) });
  const roomTypeLabel = room ? humanizeRoomType(room.normalizedType) : "Standard room";
  const occupancy = room?.occupancy ?? 2;

  const available = result.offers.filter((o) => !o.soldOut);
  const soldOut = result.offers.filter((o) => o.soldOut);

  const showComparison = liveCheck.kind !== "checking" && liveCheck.kind !== "error" && available.length > 0;

  const priceInsight = showComparison ? await getPriceInsight(result.hotel.id, checkIn, result.cheapestTotal) : null;
  const belowHistoricalAverage =
    priceInsight?.hasEnoughData === true && priceInsight.percentVsAverage != null && priceInsight.percentVsAverage > 0;

  const verifiedState: VerifiedRateState =
    liveCheck.kind === "ready" ? (available.length > 0 ? "verified" : "no-availability") : "not-checked";

  const tripQuery = tripId ? `&trip=${tripId}` : "";
  const currentUrl = `/check-iq?hotel=${result.hotel.id}&checkin=${checkIn}&checkout=${checkOut}${tripQuery}`;

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />

      {result.hotel.isMockData && (
        <div className="demo-banner">
          Demo mode — {result.hotel.name}&apos;s prices below are simulated for this prototype, not live
          rates from these sources.
        </div>
      )}

      {/* "No repeated info" (final spec, Important Implementation
          Principles) - a visitor who already told Page 1 the dates/
          guests/trip type for this trip shouldn't feel like Check IQ is
          asking again from scratch. Read-only recap, nothing editable
          here - changing any of it means a new Discover search. */}
      {trip && (
        <div className="trip-context-strip">
          <span className="trip-context-item">
            {trip.adults} adult{trip.adults === 1 ? "" : "s"}
            {trip.children > 0 ? `, ${trip.children} child${trip.children === 1 ? "" : "ren"}` : ""}
          </span>
          <span className="trip-context-item">
            {trip.rooms} room{trip.rooms === 1 ? "" : "s"}
          </span>
          {trip.purpose !== "UNSPECIFIED" && <span className="trip-context-item trip-context-purpose">{trip.purpose.replace("_", " ").toLowerCase()}</span>}
        </div>
      )}

      {/* Step 1: Your Hotel - free, shown regardless of live-check state. */}
      <YourHotelSummary
        hotelName={result.hotel.name}
        area={result.hotel.area}
        city={result.hotel.city}
        starRating={result.hotel.starRating}
        checkIn={checkIn}
        checkOut={checkOut}
        nights={result.nights}
        occupancy={occupancy}
        roomTypeLabel={roomTypeLabel}
      />

      {/* Step 2: Rate Verified - real hotels only. See VerifiedRatePanel.tsx
          for why mock hotels skip this entirely (the .demo-banner above
          already says the prices are simulated). */}
      {!result.hotel.isMockData && liveCheck.kind !== "checking" && (
        <VerifiedRatePanel
          state={verifiedState}
          sourcesChecked={result.sourcesChecked}
          checkedAt={result.offers[0]?.checkedAt ?? null}
          cheapestTotal={result.cheapestTotal}
          nights={result.nights}
        />
      )}

      {liveCheck.kind === "checking" ? (
        <LiveCheckStatus hotelId={result.hotel.id} checkIn={checkIn} checkOut={checkOut} />
      ) : showComparison ? (
        <>
          {/* Non-null: showComparison already guarantees available.length > 0. */}
          {priceInsight && <PriceInsightPanel insight={priceInsight} />}
          <WhyThisDealPanel offer={available[0]!} belowHistoricalAverage={belowHistoricalAverage} />

          <div className="where-to-book-heading">Where to book</div>
          <ResultsList
            searchId={result.searchId}
            hotelId={result.hotel.id}
            hotelCity={result.hotel.city}
            checkIn={checkIn}
            checkOut={checkOut}
            offers={available}
            averageTotal={result.averageTotal}
            cheapestTotal={result.cheapestTotal}
            tripId={tripId}
            verdictId={result.verdictId}
          />

          <RateManifestVerdict offer={available[0]!} hotelName={result.hotel.name} sourcesChecked={result.sourcesChecked} />
          <BeforeYouBookPanel
            hotelName={result.hotel.name}
            checkIn={checkIn}
            checkOut={checkOut}
            occupancy={occupancy}
            roomTypeLabel={roomTypeLabel}
            offer={available[0]!}
            checkedAt={result.offers[0]?.checkedAt ?? null}
            currentUrl={currentUrl}
          />
        </>
      ) : liveCheck.kind === "error" ? (
        null
      ) : (
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

      <Footer />
    </div>
  );
}
