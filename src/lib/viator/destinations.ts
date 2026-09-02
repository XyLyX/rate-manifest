import { viatorFetch } from "./client";

// Resolves a destination name (e.g. "Dubai") to Viator's numeric
// destinationId, which every other endpoint needs - confirmed against the
// real OpenAPI spec the user pulled from their Viator dashboard (not
// guessed - see DECISIONS.md, "Viator adapter: confirmed against the real
// OpenAPI spec"). GET /destinations takes no parameters and returns
// Viator's entire destination list (thousands of entries, from countries
// down to neighborhoods) - their own docs say "destinations should be
// refreshed weekly," which is the opposite of a per-search live call, so
// this is cached in memory for the life of the server instance rather
// than fetched on every search. If this proves worth building out past
// the small first version, the natural next step is persisting the
// resolved IDs in the database the same way staying_api_cache persists
// StayingAPI results, rather than re-fetching the full list on every cold
// start.

interface DestinationDetails {
  destinationId: number;
  name: string;
  type: string;
  parentDestinationId?: number;
}

interface DestinationsResponse {
  destinations: DestinationDetails[];
  totalCount?: number;
}

let cachedDestinations: DestinationDetails[] | null = null;
let cachedAt: number | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h - conservative versus Viator's own "weekly," cheap either way

async function getAllDestinations(): Promise<DestinationDetails[]> {
  if (cachedDestinations && cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedDestinations;
  }
  const response = await viatorFetch<DestinationsResponse>("/destinations");
  cachedDestinations = response.destinations;
  cachedAt = Date.now();
  return cachedDestinations;
}

/**
 * Finds the destinationId for a given place name. Prefers an exact,
 * case-insensitive match on a CITY-type destination (Viator's `type`
 * enum - see DECISIONS.md) since that's what a "Dubai" search should
 * mean here; falls back to the first case-insensitive substring match of
 * any type if no CITY match exists, rather than returning nothing.
 * Returns null if genuinely nothing matches - callers should treat that
 * as "no results" the same way every supplier adapter in this app
 * degrades on a miss, not as an error.
 */
export async function resolveDestinationId(name: string): Promise<number | null> {
  const destinations = await getAllDestinations();
  const needle = name.trim().toLowerCase();

  const exactCity = destinations.find((d) => d.type === "CITY" && d.name.toLowerCase() === needle);
  if (exactCity) return exactCity.destinationId;

  const anyExact = destinations.find((d) => d.name.toLowerCase() === needle);
  if (anyExact) return anyExact.destinationId;

  const partial = destinations.find((d) => d.name.toLowerCase().includes(needle));
  return partial ? partial.destinationId : null;
}
