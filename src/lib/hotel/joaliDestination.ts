import type { HotelRouteBuilder } from "./commercial";

// JOALI direct reservation-engine destination builder (GitHub Issue #3,
// Awin advertiser 125626 / publisher 3076059). CONFIRMED contract - the
// owner tested both properties' Awin redirects successfully against:
//
//   https://reservation.joali.com/?hotel=<41373|41375>&chain=30805&level=hotel
//     &locale=en-US&currency=USD&productcurrency=USD&arrive=<checkIn>
//     &depart=<checkOut>&adult=<adults>&child=<children>&rooms=<rooms>
//
// Only the traveller-varying fields (arrive, depart, adult, child, rooms)
// are derived from validated trip context; every other parameter is
// reproduced exactly as confirmed. No fixed test date is ever used - a
// missing/invalid date or party value yields NO route, never a fallback.
// Property id is matched against a closed, verified map only - a third
// JOALI property is never inferred, and an unrecognised id yields no route.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

export interface JoaliProperty {
  hotelId: number;
  name: string;
}

// VERIFIED properties only - add an entry here only with a confirmed Awin redirect test.
export const JOALI_VERIFIED_PROPERTIES: Record<string, JoaliProperty> = {
  "joali-maldives": { hotelId: 41373, name: "JOALI Maldives" },
  "joali-being": { hotelId: 41375, name: "JOALI BEING" },
};

const JOALI_RESERVATION_BASE = "https://reservation.joali.com/";
const JOALI_CHAIN_ID = 30805;

export const buildJoaliDestination: HotelRouteBuilder = (ctx) => {
  const property = Object.prototype.hasOwnProperty.call(JOALI_VERIFIED_PROPERTIES, ctx.propertyId)
    ? JOALI_VERIFIED_PROPERTIES[ctx.propertyId]
    : undefined;
  if (!property) return null; // no verified JOALI property mapping -> no route

  const { checkIn, checkOut, rooms, adults, children } = ctx.stay;
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkOut <= checkIn) return null;
  if (!int(rooms, 1) || !int(adults, 1) || !int(children, 0)) return null;

  const params = new URLSearchParams({
    hotel: String(property.hotelId),
    chain: String(JOALI_CHAIN_ID),
    level: "hotel",
    locale: "en-US",
    currency: "USD",
    productcurrency: "USD",
    arrive: checkIn,
    depart: checkOut,
    adult: String(adults),
    child: String(children),
    rooms: String(rooms),
  });

  return { url: `${JOALI_RESERVATION_BASE}?${params.toString()}` };
};
