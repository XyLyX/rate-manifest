import type { DisplayOffer } from "@/lib/search";

// 2026-09-05, Navin's "Page 2 — Rate Intelligence: Handling Missing Rate
// Conditions" spec. Section 1 ("Separate API facts from intelligence") and
// section 2 ("Use an explicit confidence/status system") are both about the
// same underlying problem: StayingAPI's price-compare endpoint only ever
// returns {ota, totalPrice, currency, url} - no breakfast, no rate plan, no
// payment terms, no cancellation, no tax breakdown. Every other panel on
// this page (WhyThisDealPanel, RateManifestVerdict, BeforeYouBookPanel)
// already only states what a given offer's fields actually carry - this
// module is the one place that lays out *every* rate attribute a customer
// would reasonably want before booking, confirmed or not, so nothing is
// quietly missing from view. See DECISIONS.md's "unknown is never negative"
// rule, mirrored here as "unknown is never hidden" either.
//
// Breakfast, Rate plan, and Payment are hardcoded to "unknown" for every
// offer, mock or real - not because of a source-specific limitation, but
// because SupplierOffer (suppliers/types.ts) has no field for any of them
// yet. The day a real field exists, its status here should read off that
// field the same way Cancellation and Taxes & fees already do below -
// hardcoding them "confirmed" without a backing field would be exactly the
// fabricated-certainty problem this whole spec exists to prevent.
export type SnapshotStatus = "confirmed" | "unknown";

export interface SnapshotField {
  label: string;
  status: SnapshotStatus;
  value: string;
}

export interface RateSnapshotInput {
  roomTypeLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  offer: DisplayOffer;
}

export function buildRateSnapshot({
  roomTypeLabel,
  checkIn,
  checkOut,
  nights,
  adults,
  children,
  offer,
}: RateSnapshotInput): SnapshotField[] {
  const guests = `${adults} adult${adults === 1 ? "" : "s"}${
    children > 0 ? `, ${children} child${children === 1 ? "" : "ren"}` : ""
  }`;

  return [
    { label: "Room", status: "confirmed", value: roomTypeLabel },
    {
      label: "Stay dates",
      status: "confirmed",
      value: `${checkIn} → ${checkOut} (${nights} night${nights === 1 ? "" : "s"})`,
    },
    { label: "Guests", status: "confirmed", value: guests },
    {
      label: "Price",
      status: "confirmed",
      value: `AED ${Math.round(offer.totalPrice).toLocaleString("en-AE")} total`,
    },
    {
      label: "Cancellation",
      status: offer.cancellationKnown ? "confirmed" : "unknown",
      value: offer.cancellationKnown
        ? offer.isFreeCancellation
          ? "Free cancellation"
          : "Non-refundable"
        : "Not confirmed by this source",
    },
    {
      label: "Breakfast / meals",
      status: "unknown",
      value: "Not confirmed — check with the property or at checkout",
    },
    {
      label: "Rate plan",
      status: "unknown",
      value: "Limited information — flexibility beyond cancellation isn't itemized by this source",
    },
    {
      label: "Payment",
      status: "unknown",
      value: "Payment terms not confirmed — verify at checkout",
    },
    {
      label: "Taxes & fees",
      status: offer.taxesConfirmed ? "confirmed" : "unknown",
      value: offer.taxesConfirmed
        ? `AED ${Math.round(offer.taxesFeesPerNight).toLocaleString("en-AE")}/night, included in total`
        : "Bundled into the total — not itemized by this source",
    },
  ];
}

// Section 6, "Verify Before Booking" - dynamically generated from whatever
// is actually unknown for THIS offer, never a static checklist. A hotel
// whose source did confirm cancellation terms should not see "Cancellation"
// listed here just because some other property's offer didn't have it.
export function buildVerifyBeforeBooking(fields: SnapshotField[]): SnapshotField[] {
  return fields.filter((f) => f.status === "unknown");
}
