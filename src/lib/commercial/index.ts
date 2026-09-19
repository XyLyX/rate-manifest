// Track D: Commercial Router — public API.
// Re-exports the commercial routing surface. Callers import from here,
// not directly from the sub-modules.

export type {
  RouteType,
  RouteEligibility,
  CommercialRoute,
} from "./types";

export { resolveCommercialRoute } from "./router";

export type { CuelinksConversionResult } from "./cuelinks";

export {
  convertCuelinksUrl,
  CuelinksConfigError,
  CuelinksRequestError,
  CuelinksResponseError,
} from "./cuelinks";
