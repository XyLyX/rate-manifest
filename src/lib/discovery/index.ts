// Hotel/property catalog discovery runner. Resolves a destination to a
// shortlist of hotel objects for Page 1 (Discover). No price data,
// no StayingAPI contact of any kind.
//
// Separate from src/lib/price-discovery/ (market price ranges for the
// Compare page) and src/lib/suppliers/ (StayingAPI / Check IQ).
export type { DiscoveredHotel, DiscoverySearchParams, DiscoverySource } from "./types";
export { curatedCatalogSource as activeDiscoverySource } from "./curatedCatalogSource";

// V2A legacy catalogue retirement (2026-09-22, approved plan, Phase 1): the
// single explicit switch for public property discovery on the homepage.
// False until Rate Manifest has actually approved a legitimate discovery
// supplier - a real, vetted catalogue - not merely until the `hotels` table
// happens to be non-empty. The homepage must not derive "is discovery live"
// from row *content*: a stray test insert, a partially-applied legacy
// migration, or any other accidental row in `hotels` must never surface as
// public inventory just because a row exists. Flip this to true only as
// part of a deliberate future decision to launch a real discovery source,
// alongside whatever adapter change that decision requires - never as a
// side effect of seeding or cleaning up data.
export const LEGITIMATE_DISCOVERY_SUPPLIER_APPROVED = false;
