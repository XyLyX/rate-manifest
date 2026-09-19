// Commercial routing: Cuelinks V3 link-conversion primitive.
//
// Cuelinks is a COMMERCIAL ROUTING layer only — it turns an ordinary
// merchant URL into a trackable/affiliated link (or tells us it can't).
// It is NOT hotel/flight/rail discovery, NOT a rate source, and NOT a
// StayingAPI replacement. StayingAPI remains Hotel Check IQ only.
//
// Observed behaviour (live-tested against the Rate Manifest Cuelinks
// account, outside this codebase): Cuelinks can return a tracking_url
// even when `affiliated` is false. So `affiliated` is the only
// authoritative signal for "is this route monetizable" — tracking_url
// existing is not sufficient, and callers must not treat affiliated:false
// as an error condition. It's a normal, valid result.
//
// Server-side only: never import this from client code. The API key is
// read only from process.env.CUELINKS_API_KEY.

const CUELINKS_CONVERT_ENDPOINT =
  "https://developers.cuelinks.com/pub_api/v3/links/convert";

export type CuelinksConversionResult = {
  originalUrl: string;
  trackingUrl: string | null;
  affiliated: boolean;
  campaignId: number | null;
  campaignName: string | null;
};

export class CuelinksConfigError extends Error {}
export class CuelinksRequestError extends Error {}
export class CuelinksResponseError extends Error {}

function assertValidDestinationUrl(destinationUrl: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(destinationUrl);
  } catch {
    throw new CuelinksRequestError(
      `convertCuelinksUrl: destinationUrl is not a valid URL: ${JSON.stringify(destinationUrl)}`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CuelinksRequestError(
      `convertCuelinksUrl: destinationUrl must be http(s), got protocol ${JSON.stringify(parsed.protocol)}`,
    );
  }

  return parsed;
}

// Normalize only the Cuelinks V3 response structure actually observed
// in live Rate Manifest tests:
//
//   data.tracking_url
//   data.original_url
//   data.affiliated
//   data.campaign.id
//   data.campaign.name
//   data.affiliate_url
//
// No speculative aliases or alternate response wrappers are accepted.
// affiliate_url is part of the observed upstream response but is not
// currently exposed because Rate Manifest only needs trackingUrl here.

function normalizeCuelinksResponse(
  raw: unknown,
  originalUrl: string,
): CuelinksConversionResult {
  if (typeof raw !== "object" || raw === null) {
    throw new CuelinksResponseError(
      "convertCuelinksUrl: Cuelinks response was not a JSON object",
    );
  }

  const data = (raw as Record<string, unknown>).data;

  if (typeof data !== "object" || data === null) {
    throw new CuelinksResponseError(
      "convertCuelinksUrl: Cuelinks response missing a 'data' object",
    );
  }

  const record = data as Record<string, unknown>;

  const affiliated = record.affiliated;

  if (typeof affiliated !== "boolean") {
    throw new CuelinksResponseError(
      `convertCuelinksUrl: Cuelinks response missing a boolean 'data.affiliated' field (got ${JSON.stringify(affiliated)})`,
    );
  }

  const trackingUrlRaw = record.tracking_url;
  const trackingUrl =
    typeof trackingUrlRaw === "string" && trackingUrlRaw.length > 0
      ? trackingUrlRaw
      : null;

  const originalUrlRaw = record.original_url;
  const resolvedOriginalUrl =
    typeof originalUrlRaw === "string" && originalUrlRaw.length > 0
      ? originalUrlRaw
      : originalUrl;

  const campaign = record.campaign;
  const campaignRecord =
    typeof campaign === "object" && campaign !== null
      ? (campaign as Record<string, unknown>)
      : null;

  const campaignIdRaw = campaignRecord?.id;
  const campaignId =
    typeof campaignIdRaw === "number"
      ? campaignIdRaw
      : typeof campaignIdRaw === "string" &&
          campaignIdRaw.trim() !== "" &&
          !Number.isNaN(Number(campaignIdRaw))
        ? Number(campaignIdRaw)
        : null;

  const campaignNameRaw = campaignRecord?.name;
  const campaignName =
    typeof campaignNameRaw === "string" && campaignNameRaw.length > 0
      ? campaignNameRaw
      : null;

  return {
    originalUrl: resolvedOriginalUrl,
    trackingUrl,
    affiliated,
    campaignId,
    campaignName,
  };
}

/**
 * Convert an ordinary merchant destination URL into a Cuelinks-tracked
 * commercial route.
 *
 * Merchant-agnostic: takes no hardcoded campaign IDs or hostnames.
 *
 * `affiliated: false` is a normal, valid result. Cuelinks can return a
 * tracking_url even when unaffiliated, so callers MUST use `affiliated`
 * — not trackingUrl presence — to determine whether the route is an
 * approved monetized route.
 *
 * Throws only for genuine failure conditions:
 * - invalid destination URL
 * - missing server configuration
 * - network/HTTP failure
 * - unusable Cuelinks response
 */
export async function convertCuelinksUrl(
  destinationUrl: string,
): Promise<CuelinksConversionResult> {
  // Validate caller input first. No network call is made for invalid URLs.
  const validatedUrl = assertValidDestinationUrl(destinationUrl);

  const apiKey = process.env.CUELINKS_API_KEY;

  if (!apiKey) {
    throw new CuelinksConfigError(
      "convertCuelinksUrl: CUELINKS_API_KEY is not set in the server environment",
    );
  }

  let response: Response;

  try {
    response = await fetch(CUELINKS_CONVERT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: validatedUrl.toString(),
      }),
    });
  } catch (err) {
    throw new CuelinksRequestError(
      `convertCuelinksUrl: network error calling Cuelinks — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!response.ok) {
    let detail = "";

    try {
      detail = await response.text();
    } catch {
      // Best-effort diagnostic detail only.
    }

    throw new CuelinksRequestError(
      `convertCuelinksUrl: Cuelinks returned HTTP ${response.status}${
        detail ? ` — ${detail.slice(0, 300)}` : ""
      }`,
    );
  }

  let json: unknown;

  try {
    json = await response.json();
  } catch (err) {
    throw new CuelinksResponseError(
      `convertCuelinksUrl: Cuelinks response was not valid JSON — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return normalizeCuelinksResponse(json, validatedUrl.toString());
}
