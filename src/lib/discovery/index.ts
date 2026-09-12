// The single switch point Page 1 calls through - claude/discovery-property-
// graph-architecture.md ("FROZEN 2026-09-12"), Section 9: "Google can be
// the initial discovery source without becoming a permanent architectural
// dependency." Swapping in a real vendor (Track B) once one is chosen means
// changing `activeDiscoverySource` here, not touching src/app/page.tsx or
// any component that renders Page 1.
export { curatedCatalogSource as activeDiscoverySource } from "./curatedCatalogSource";
export type { DiscoveredHotel, DiscoverySearchParams, DiscoverySource } from "./types";
