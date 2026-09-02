// Low-level authenticated client for Viator's Partner API v2 - the
// confirmed pieces only. See DECISIONS.md, "Decision: build a native
// Viator Things To Do integration," for what's confirmed versus still
// needing verification against the real API once the sandbox key is
// active (up to 24 hours after generation, per Viator's own dashboard).
//
// Confirmed from Viator's own documentation (docs.viator.com/partner-api,
// partnerresources.viator.com):
//   - Sandbox base URL: https://api.sandbox.viator.com/partner (seen as a
//     live example in Viator's own "modified-since" guide).
//   - Production base URL: https://api.viator.com/partner.
//   - Auth header: `exp-api-key: <key>`.
//   - Required version header: `Accept: application/json;version=2.0` -
//     Viator's docs say omitting this returns a 400.
//   - `Accept-Language` for localized content, `Content-Type:
//     application/json` on POST bodies, `Accept-Encoding: gzip`
//     recommended.
//
// NOT yet confirmed (deliberately not guessed - see DECISIONS.md): the
// exact request/response shape of the product-detail and
// /availability/check endpoints. This client only exposes what's needed
// for /products/search and /taxonomy/destinations, which are confirmed.
// Extend it once the OpenAPI spec/Postman collection from the Viator
// dashboard's "Resources" tab (or a real sandbox response) confirms the
// rest.

const SANDBOX_BASE_URL = "https://api.sandbox.viator.com/partner";
const PRODUCTION_BASE_URL = "https://api.viator.com/partner";

// Only a sandbox key exists so far (see .env.example) - this reads
// whichever is actually configured, preferring production if a real
// production key is ever added, without any code change here.
function getCredentials(): { apiKey: string; baseUrl: string } | null {
  const productionKey = process.env.VIATOR_PRODUCTION_API_KEY;
  const sandboxKey = process.env.VIATOR_SANDBOX_API_KEY;

  if (productionKey) return { apiKey: productionKey, baseUrl: PRODUCTION_BASE_URL };
  if (sandboxKey) return { apiKey: sandboxKey, baseUrl: SANDBOX_BASE_URL };
  return null;
}

export class ViatorNotConfiguredError extends Error {
  constructor() {
    super("Viator: no API key configured (VIATOR_SANDBOX_API_KEY / VIATOR_PRODUCTION_API_KEY unset).");
    this.name = "ViatorNotConfiguredError";
  }
}

/**
 * Calls a Viator Partner API endpoint with the required auth/version
 * headers already attached. Throws on a non-2xx response or missing
 * credentials - callers (the search function) are responsible for
 * catching and degrading to "no results" the same way every other
 * supplier adapter in this app does, rather than breaking the page.
 */
export async function viatorFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown; language?: string }
): Promise<T> {
  const credentials = getCredentials();
  if (!credentials) throw new ViatorNotConfiguredError();

  const response = await fetch(`${credentials.baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "exp-api-key": credentials.apiKey,
      Accept: "application/json;version=2.0",
      "Accept-Language": init?.language ?? "en-US",
      "Accept-Encoding": "gzip",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    // Viator's own docs recommend a generous timeout for booking-adjacent
    // calls; Next.js/fetch has no built-in timeout, and Netlify's own
    // 60-second function limit is the real ceiling here regardless.
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Viator API ${init?.method ?? "GET"} ${path} -> ${response.status}: ${bodyText.slice(0, 500)}`);
  }

  return response.json() as Promise<T>;
}

export function isViatorConfigured(): boolean {
  return getCredentials() !== null;
}
