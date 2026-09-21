import type { AccessAdapter } from "./accessAdapter";
import { dcmTuneConfigFromEnv, createDcmTuneAdapter } from "./dcmTuneAccess";
import { createLinkKitAdapter, linkKitConfigFromEnv } from "./linkkitAccess";

// The production access adapters, keyed by access-route slug, configured from
// the proven non-secret contracts (with optional env overrides). Pass the
// result as `adapters` to resolveTowerHandoff. No secret/API credential is read.
export function productionAccessAdapters(env: Record<string, string | undefined> = process.env): Record<string, AccessAdapter> {
  return {
    cuelinks: createLinkKitAdapter(linkKitConfigFromEnv(env)),
    dcm: createDcmTuneAdapter(dcmTuneConfigFromEnv(env)),
  };
}
