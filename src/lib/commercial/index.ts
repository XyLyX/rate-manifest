// Track D: Commercial Router — public API.
// Re-exports the full type surface from types.ts and the single public
// function from router.ts. Callers (Track F's /confirm page) import from
// here, not directly from the sub-modules.
export type { RouteType, RouteEligibility, CommercialRoute } from "./types";
export { resolveCommercialRoute } from "./router";
