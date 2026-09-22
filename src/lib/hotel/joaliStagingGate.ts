// GitHub Issue #3 - the single, shared, server-side switch for the entire
// JOALI feature. Fails closed by construction: only the exact string "true"
// enables it - absent, empty, "false", "1", or any other value all disable
// it. Deliberately NOT process.env.NODE_ENV or Netlify's CONTEXT (a site's
// own pinned-branch deploy reports CONTEXT="production" regardless of
// whether that site is conceptually staging or prod - confirmed against the
// real rate-manifest-staging deploy metadata), and NOT anything client-side
// (noindex/unlinked pages are discoverability only, not access control).
//
// Set JOALI_STAGING_ENABLED=true ONLY on the staging Netlify site's own
// environment variables - never on production.
export function isJoaliStagingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.JOALI_STAGING_ENABLED === "true";
}

// GitHub Issue #3 follow-up (2026-09-23): the Discover-to-JOALI connection.
// A Maldives search previously created a trip exactly like any other
// destination but had no path from it to /joali. Pure and DB-free
// (src/app/actions/trip.ts's exploreJoaliFromDiscover is a "use server" file
// that may only export async functions, so this - the actual gate+
// destination decision - lives here instead, directly unit-testable without
// ever touching the database).
const MALDIVES_DESTINATION = "maldives";

function normaliseDestination(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Whether an already-created, already-validated trip should route to /joali
 * instead of the normal Discover result page - true only when the gate is
 * exactly "true" AND the trip's own stored destination is (normalised)
 * "maldives". Never trusts a caller's own claim about the destination or the
 * gate: both are re-derived here from the actual trip/env values.
 */
export function isJoaliEligibleDestination(destination: string, env: Record<string, string | undefined> = process.env): boolean {
  return isJoaliStagingEnabled(env) && normaliseDestination(destination) === MALDIVES_DESTINATION;
}
