// Shared travel context types — the foundation all three towers
// (Hotels, Flights, Rail) read from.
//
// Design intent (2026-09-15, Task F):
//   - Destination carries what is structurally different between towers:
//     a hotel tower needs areas/districts; a flight tower needs airport codes;
//     a rail tower needs station codes. A single free-text city string is not
//     enough once two or more towers are live at the same destination.
//   - TravelContext replaces the implicit "read trip.destination + trip.checkIn
//     everywhere" pattern with an explicit, mode-aware shape. The hotels tower
//     already uses all fields (tripId, destination, dates, travellers, purpose)
//     — this just makes the shared contract explicit and adds the fields the
//     other two towers will need.
//   - Neither type touches the DB yet. trips.origin and trips.arrivalPoint are
//     not DB columns today; they are added here as optional so that pages can
//     pass them in when the form collects them, without a migration blocking
//     the structural pages landing first.
//
// Extending this later:
//   - When the Flights form is built, add origin to the DiscoverForm and
//     createTrip() server action, then add an `origin` column to the trips
//     table. TravelContext.origin is already typed; no downstream change needed.
//   - Destination.airports / .railStations are seeded manually today. A future
//     "destination enrichment" step can backfill them from a reference dataset.

export interface Destination {
  /** Canonical display city name, e.g. "Dubai", "London", "Tokyo". */
  city: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "AE", "GB". Optional until enriched. */
  country?: string;
  /**
   * IATA airport codes serving this city, ordered by traffic/relevance.
   * E.g. Dubai → ["DXB", "DWC"], London → ["LHR", "LGW", "LCY", "STN", "LTN"].
   * Empty array means "unknown or not yet enriched", not "no airport."
   */
  airports: string[];
  /**
   * Rail station codes serving this city, using the same code format the
   * rail data source uses (UIC, NLC, or IATA depending on source).
   * E.g. London → ["LBG", "STP", "PAD", "EUS", "VIC"].
   * Empty array means "unknown or not yet enriched."
   */
  railStations: string[];
}

export type TravelMode = "hotels" | "flights" | "rail" | "combined";

/**
 * The shared context that flows through all four pages for any tower.
 * Hotels use all fields today; Flights and Rail fill in optional fields
 * (origin, arrivalPoint) once their forms are built.
 *
 * This is NOT a DB row — it is a read-shape assembled by each page's
 * server component from the trips table plus any mode-specific context.
 * Pages should import this type and destructure what they need rather than
 * reading trip.* directly everywhere, so a future rename or extension is
 * one place.
 */
export interface TravelContext {
  tripId: string;
  mode: TravelMode;
  /** Destination city, matches trips.destination. */
  destination: string;
  /** Origin city for flights/rail. Absent for hotels. */
  origin?: string;
  /**
   * The specific airport or station code within the destination the traveller
   * is arriving at / departing from. Needed for multi-airport cities.
   * E.g. "DXB" within "Dubai", "LHR" within "London".
   */
  arrivalPoint?: string;
  checkIn: string;   // ISO date YYYY-MM-DD
  checkOut: string;  // ISO date YYYY-MM-DD
  adults: number;
  children: number;
  rooms: number;
  /** ISO 4217 currency code, e.g. "AED". Defaults to the market default. */
  currency: string;
  /**
   * Market/locale context, e.g. "AE" (UAE). Used to filter supplier
   * results by regional availability and affiliate programme eligibility.
   * Not yet collected in the UI; defaults to "AE" in hotels tower.
   */
  market: string;
  /** Trip purpose — see TRIP_PURPOSES in src/lib/constants.ts. */
  purpose: string;
}

/**
 * Minimal seeded destination catalogue.
 * Production: fetch from DB or a reference file. For now, inline the cities
 * the hotel catalog actually covers so Flights/Rail pages can reference real
 * airport and station codes without a DB migration.
 */
export const KNOWN_DESTINATIONS: Record<string, Destination> = {
  Dubai: {
    city: "Dubai",
    country: "AE",
    airports: ["DXB", "DWC"],
    railStations: [], // Dubai Metro is city-only, no inter-city rail
  },
  "Abu Dhabi": {
    city: "Abu Dhabi",
    country: "AE",
    airports: ["AUH"],
    railStations: [],
  },
};
