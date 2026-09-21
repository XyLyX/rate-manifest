// Hotel journey links (pure).

/**
 * Confirm -> Check IQ "Return to rate check".
 *
 * Confirm only renders for a trip that already has a hotel selection, and a
 * selection can only be made from an authorised Check IQ view, so the return
 * carries the same authorisation (authorized=1) plus the trip/hotel/date
 * context the rate check needs (occupancy is re-read from the trip). The
 * Check IQ gate itself is unchanged: a fresh entry without authorized=1 is
 * still redirected to Compare.
 */
export function rateCheckReturnHref(args: { hotelId: string; checkIn: string; checkOut: string; tripId: string }): string {
  const q = new URLSearchParams({
    hotel: args.hotelId,
    checkin: args.checkIn,
    checkout: args.checkOut,
    trip: args.tripId,
    authorized: "1",
  });
  return `/check-iq?${q.toString()}`;
}
