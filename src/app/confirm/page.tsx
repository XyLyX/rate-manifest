import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getTrip, getTripExperiences } from "@/lib/trip";
import { joaliCtaForChoice, propertyChoiceForTrip, propertyCta } from "@/lib/hotel/journey";
import { JOALI_VERIFIED_PROPERTIES } from "@/lib/hotel/joaliDestination";
import { isJoaliStagingEnabled } from "@/lib/hotel/joaliStagingGate";
import { rateCheckReturnHref } from "@/lib/hotel/links";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { JourneyProgress } from "@/components/JourneyProgress";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

interface ConfirmPageProps {
  searchParams: Promise<{ trip?: string }>;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return diff > 0 ? diff : 1;
}

// Confirm & Book — the final summary of what the traveller has chosen.
//
// STAYINGAPI IS QUARANTINED: there is no selected rate, seller or hotel price.
// This page summarises the traveller's HOTEL (property) choice, the trip's own
// stay/traveller context and any added experiences. It never shows a hotel
// price, a "selected rate", a verdict or a combined total, and it never uses a
// rate-source URL. Its booking action comes from the Hotel V1 commercial
// policy (src/lib/hotel/commercial.ts): a CTA exists only for an eligible,
// attributable route, and none exists for a property with no independently
// proven merchant/access-route evidence - which is honest, and expected today.
export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const tripId = (await searchParams).trip;

  if (!tripId) {
    return (
      <div className="shell">
        <p className="empty-state">
          No trip in progress. <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  const trip = await getTrip(tripId);
  const choice = trip ? await propertyChoiceForTrip(tripId) : null;

  if (!trip || !choice) {
    return (
      <div className="shell">
        <p className="empty-state">
          {trip ? "You haven't chosen a hotel on this trip yet." : "We couldn't find that trip."}{" "}
          <Link href="/">Start a new search</Link>.
        </p>
      </div>
    );
  }

  const hotel = await db.query.hotels.findFirst({ where: eq(schema.hotels.id, choice.propertyId) });
  const experiences = await getTripExperiences(tripId);
  const nights = nightsBetween(trip.checkIn, trip.checkOut);

  // JOALI (GitHub Issue #3) is never seeded into the hotels catalogue, so
  // `hotel` above is always undefined for it - its display name/area come
  // from the same verified property map the booking-route builder uses.
  const joaliProperty = JOALI_VERIFIED_PROPERTIES[choice.propertyId];
  const displayHotelName = hotel?.name ?? joaliProperty?.name ?? "—";

  // Hotel V1 commercial policy: for a bare property choice there is
  // normally no merchant/route evidence, so honestly no booking CTA (never
  // enabled, no URL). JOALI is the one exception with a real, owner-
  // confirmed Awin route - resolved the same way Check IQ previews any
  // other merchant's CTA (previewHotelCta), just without a priced decision.
  //
  // Enforced independently here too (see joaliStagingGate.ts): a trip whose
  // hotel component already has a JOALI propertyId from before the flag was
  // disabled must fall back to the honest, disabled propertyCta - never
  // expose a live affiliate CTA just because it was recorded earlier.
  const joaliEnabled = Boolean(joaliProperty) && isJoaliStagingEnabled();
  const cta = joaliEnabled ? ((await joaliCtaForChoice(choice.propertyId, choice.stay)) ?? propertyCta(displayHotelName)) : propertyCta(displayHotelName);

  // A combined monetary total is NOT computed: there is no verified hotel
  // price. Only an experiences subtotal is shown, and only when every priced
  // experience shares one currency (never summing mixed currencies).
  const priced = experiences.filter((e) => e.price != null);
  const currencies = new Set(priced.map((e) => e.currency));
  const experiencesSubtotal =
    priced.length > 0 && currencies.size === 1
      ? { currency: [...currencies][0] as string, total: priced.reduce((sum, e) => sum + (e.price ?? 0), 0) }
      : null;

  // Eligibility is mandatory: cta.enabled is true only for an eligible
  // bookable route with a valid URL, never merely because a URL exists.
  const isBookable = cta.enabled && cta.url !== null;
  const isInquiryOnly = !cta.enabled && cta.routeType === "inquiry_only";
  const isUnavailable = !cta.enabled && cta.routeType !== "inquiry_only";
  const returnHref = rateCheckReturnHref({ hotelId: choice.propertyId, checkIn: trip.checkIn, checkOut: trip.checkOut, tripId });

  return (
    <div className="shell">
      <NavBar ctaLabel="New search" ctaHref="/" />
      <JourneyProgress step={5} />

      <div className="confirm-summary">
        <div className="your-hotel-eyebrow">Confirm</div>

        <div className="confirm-summary-block">
          <div className="confirm-summary-label">Hotel</div>
          <div className="confirm-summary-value confirm-summary-value-lg">{displayHotelName}</div>
          {hotel && (
            <div className="your-hotel-meta">
              {hotel.area}, {hotel.city} · {hotel.starRating}-star
            </div>
          )}
        </div>

        <div className="confirm-summary-block">
          <div className="confirm-summary-label">Stay</div>
          <div className="confirm-summary-value">
            {trip.checkIn} → {trip.checkOut} · {nights} night{nights === 1 ? "" : "s"}
          </div>
          <div className="your-hotel-meta">
            {trip.adults} adult{trip.adults === 1 ? "" : "s"}
            {trip.children > 0 ? `, ${trip.children} child${trip.children === 1 ? "" : "ren"}` : ""} ·{" "}
            {trip.rooms} room{trip.rooms === 1 ? "" : "s"}
          </div>
        </div>

        <div className="confirm-summary-block">
          <div className="confirm-summary-label">Hotel rate</div>
          <div className="confirm-summary-value">Not verified</div>
          <p className="your-hotel-meta">Rate verification is currently unavailable, so no hotel price is shown.</p>
        </div>

        <div className="confirm-summary-block">
          <div className="confirm-summary-label">Experiences</div>
          {experiences.length === 0 ? (
            <p className="your-hotel-meta">None added — this trip is hotel-only.</p>
          ) : (
            <ul className="confirm-experiences-list">
              {experiences.map((e) => (
                <li key={e.id}>
                  <span>{e.title}</span>
                  {e.price != null && (
                    <span className="confirm-experience-price">
                      {e.currency} {Math.round(e.price).toLocaleString("en-AE")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {experiencesSubtotal && (
          <div className="confirm-summary-block confirm-total-block">
            <div className="confirm-summary-label">Experiences subtotal (estimate)</div>
            <div className="confirm-summary-value confirm-summary-value-lg">
              {experiencesSubtotal.currency} {Math.round(experiencesSubtotal.total).toLocaleString("en-AE")}
            </div>
            <p className="your-hotel-meta">
              Experience prices are what Viator showed when added. No combined trip total is shown because there is no
              verified hotel rate; you complete each booking separately on the source it comes from.
            </p>
          </div>
        )}

        {/* ── Commercial action — Hotel V1 policy ───────────────────────────
            ctaFromRoute() (src/lib/hotel/commercial.ts) is the sole authority
            on whether a booking CTA exists: eligible + valid destination. */}

        {isBookable && cta.url && (
          <>
            <a className="btn confirm-cta" href={cta.url} target="_blank" rel="noopener noreferrer">
              {cta.label} →
            </a>
            <p className="confirm-disclosure">{cta.note}</p>
          </>
        )}

        {isInquiryOnly && (
          <div className="confirm-route-block confirm-route-inquiry">
            <div className="confirm-route-label">Booking</div>
            <p className="confirm-route-note">{cta.note}</p>
            <Link href={returnHref} className="btn btn-ghost">
              ← Return to rate check
            </Link>
          </div>
        )}

        {isUnavailable && (
          <div className="confirm-route-block confirm-route-unavailable">
            <div className="confirm-route-label">Booking</div>
            <p className="confirm-route-note">{cta.note}</p>
            <Link href={returnHref} className="btn btn-ghost">
              ← Return to rate check
            </Link>
          </div>
        )}

        {experiences.length > 0 && (
          <div className="confirm-experience-links">
            <div className="confirm-summary-label">Book your experiences</div>
            {experiences.map((e) => (
              <a key={e.id} className="btn btn-ghost confirm-experience-link" href={e.bookingUrl} target="_blank" rel="noopener noreferrer">
                {e.title} →
              </a>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
