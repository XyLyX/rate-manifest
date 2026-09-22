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
