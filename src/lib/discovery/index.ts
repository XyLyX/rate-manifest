// Hotel/property catalog discovery runner. Resolves a destination to a
// shortlist of hotel objects for Page 1 (Discover). No price data,
// no StayingAPI contact of any kind.
//
// Separate from src/lib/price-discovery/ (market price ranges for the
// Compare page) and src/lib/suppliers/ (StayingAPI / Check IQ).
export type { DiscoveredHotel, DiscoverySearchParams, DiscoverySource } from "./types";
export { curatedCatalogSource as activeDiscoverySource } from "./curatedCatalogSource";
