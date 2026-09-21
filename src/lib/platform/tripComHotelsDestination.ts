import type { DestinationBuilder } from "./commercialRegister";

// Trip.com Hotels contextual destination builder, derived conservatively from
// the ONE manually proven contract (wrapped through Cuelinks LinkKit and
// confirmed to land on Trip.com showing Bangkok / 1 Oct -> 3 Oct 2026 / 1 room
// / 2 adults / 0 children / AED):
//
//   https://ae.trip.com/hotels/list?city=359&provinceId=0&countryId=4
//     &checkIn=2026-10-01&checkOut=2026-10-03&lat=0&lon=0&districtId=0
//     &barCurr=AED&searchType=CT&searchWord=Bangkok&searchValue=___&crn=1
//     &adult=2&children=0&searchBoxArg=t&ctm_ref=ix_sb_dl&travelPurpose=0
//     &domestic=false
//
// Only the values that demonstrably vary with the traveller's context are
// derived: city (id, provinceId, countryId and search word come from a
// VERIFIED city mapping), checkIn, checkOut, barCurr, crn (rooms), adult,
// children. Every other parameter is reproduced verbatim, in the proven order,
// and nothing undocumented is added.
//
// This is a city-level contextual handoff (the proven contract is a hotel LIST
// search), not a property deeplink. A destination with no verified Trip.com
// city mapping yields NO route: city ids are never guessed or inferred, and
// there is no fallback to a Trip.com homepage or a free-text search.

export interface TripComCity {
  cityId: number;
  provinceId: number;
  countryId: number;
  // Canonical search word the proven contract used for this city.
  searchWord: string;
}

// VERIFIED city mappings only. Add a city here only with evidence of its
// Trip.com ids; never derive one.
export const TRIPCOM_VERIFIED_CITIES: Record<string, TripComCity> = {
  bangkok: { cityId: 359, provinceId: 0, countryId: 4, searchWord: "Bangkok" },
};

// INVARIANT: AED is the currency of the currently proven Bangkok Trip.com
// contract ONLY. It is scoped to this Trip.com Hotels builder and is NOT a
// global Rate Manifest currency default. A component may carry its own
// 3-letter currency, which always wins; the AED fallback exists solely to
// reproduce the proven contract and must not be reused elsewhere.
const PROVEN_CONTRACT_CURRENCY = "AED";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

export const buildTripComHotelsDestination: DestinationBuilder = ({ context }) => {
  const destination = typeof context.destination === "string" ? context.destination.trim().toLowerCase() : "";
  const city = Object.prototype.hasOwnProperty.call(TRIPCOM_VERIFIED_CITIES, destination) ? TRIPCOM_VERIFIED_CITIES[destination] : undefined;
  if (!city) return null; // no verified Trip.com city mapping -> no route

  const { checkIn, checkOut, rooms, adults, children } = context;
  if (typeof checkIn !== "string" || typeof checkOut !== "string" || !ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkOut <= checkIn) return null;
  if (!int(rooms, 1) || !int(adults, 1) || !int(children, 0)) return null;
  const currency = typeof context.currency === "string" ? context.currency : PROVEN_CONTRACT_CURRENCY;
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  const q =
    `city=${city.cityId}&provinceId=${city.provinceId}&countryId=${city.countryId}` +
    `&checkIn=${checkIn}&checkOut=${checkOut}&lat=0&lon=0&districtId=0&barCurr=${currency}` +
    `&searchType=CT&searchWord=${encodeURIComponent(city.searchWord)}&searchValue=___&crn=${rooms}` +
    `&adult=${adults}&children=${children}&searchBoxArg=t&ctm_ref=ix_sb_dl&travelPurpose=0&domestic=false`;
  return { url: `https://ae.trip.com/hotels/list?${q}` };
};
