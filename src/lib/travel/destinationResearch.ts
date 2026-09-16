// Destination Research — Rate Manifest v2.1
//
// SERVER-SIDE ONLY. Never import this file in a client component.
//
// This module is the async entry point for destination intelligence on the
// homepage. It wires together:
//   1. The defaultIntelStore (in-memory cache of synthesised cards).
//   2. A direct Gemini call that synthesises all four pillars in a single
//      request from Gemini's training knowledge of the destination.
//   3. Next.js unstable_cache for cross-request persistence (72h TTL).
//   4. getDestinationPillars() from destinationIntelligence.ts as the
//      visitor-facing resolution layer (seed data, freshness assessment,
//      unavailable state).
//
// Design notes:
//   - callGeminiForDestination() receives no pre-supplied evidence — Gemini's
//     training knowledge IS the evidence source for this path. All cards are
//     stored with confidence "medium" and source "Gemini / training knowledge".
//     A future upgrade can replace or augment this with live web search evidence.
//   - The return type of callGeminiForDestination() is
//     Record<string, StoredIntelCard> | null, not a Map, so Next.js can
//     serialise the result to its cache (Maps are not JSON-serialisable).
//   - Circular import: this module imports from both destinationIntelligence.ts
//     and intelStore.ts. Neither of those imports from this file — no cycle.
//
// Required environment variables:
//   GEMINI_API_KEY     — Google AI Studio key (server-side only; no NEXT_PUBLIC_)
//   GEMINI_MODEL       — (optional) model ID, default "gemini-flash-latest"
//   GEMINI_TIMEOUT_MS  — (optional) HTTP timeout ms, default 15000
//
// Failure contract:
//   getDestinationPillarsLive() never throws. On any Gemini failure it falls
//   back to seed data (Dubai / Abu Dhabi) or the honest "not yet researched"
//   state from getDestinationPillars(). No placeholder marketing copy.

import { unstable_cache } from "next/cache";
import type {
  IntelPillar,
  StoredIntelCard,
  DestinationIntelResult,
} from "./destinationIntelligence";
import { getDestinationPillars } from "./destinationIntelligence";
import { defaultIntelStore } from "./intelStore";

// ── Constants ─────────────────────────────────────────────────────────────

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-flash-latest";
const DEFAULT_TIMEOUT_MS = 15_000;

// Maps JSON response keys to IntelPillar values
const PILLAR_MAP: Record<string, IntelPillar> = {
  cost_reality: "cost-reality",
  smart_choices: "smart-choices",
  getting_around: "getting-around",
  local_pulse: "local-pulse",
};

// ── Synthesis prompt ──────────────────────────────────────────────────────
//
// Instructs Gemini to produce all four pillar cards in a single call.
// Gemini's training knowledge is the evidence source for this path.
// The prompt enforces the formatting rules, uncertainty notation, and
// the "Framework note:" requirement for Getting There & Around.

function buildSynthesisPrompt(destination: string): string {
  return `You are a destination intelligence researcher for Rate Manifest, a travel decision platform.

Produce structured intelligence for ${destination} across four pillars. Use your training knowledge of ${destination}. Follow every output rule precisely — deviations cause parsing failures that result in no content being shown to visitors.

OUTPUT RULES:
1. Write ONLY facts you have reasonable confidence are accurate for ${destination}. If uncertain, state the uncertainty explicitly (e.g., "typically USD 80–120/night, though rates vary by season").
2. Default currency: USD. Include local currency in parentheses where directly relevant (e.g., "USD 80–120 (IDR 1.3–1.9M)").
3. Body format: exactly 3–4 bullet points per pillar. Each bullet starts with "• " (bullet character + space). Separate bullets with a single newline character (\n). No trailing newline. Dense, specific, factual — not marketing language.
4. Titles: ≤ 12 words, specific to ${destination} and the pillar. Never generic.
5. No marketing language, no superlatives, no fabricated statistics. If a number is approximate, say so.
6. Do not add facts you are not confident about. A shorter accurate answer beats a longer uncertain one.

PILLAR 1 — COST REALITY (JSON key: cost_reality):
What a stay at ${destination} actually costs. Cover: typical mid-range hotel price ranges per night (USD, with local currency), accommodation taxes and destination-specific levies or fees, key demand drivers that cause price spikes (events, seasons, school holidays), and how the real checkout total compares to the headline nightly rate.

PILLAR 2 — SMART CHOICES (JSON key: smart_choices):
Timing, district selection, and booking decisions that materially affect value at ${destination}. Cover: best and worst times to visit from a pricing and experience perspective, key districts or areas with their practical trade-offs, event periods that compress inventory and push rates, and any booking-source or cancellation considerations worth knowing.

PILLAR 3 — GETTING THERE & AROUND (JSON key: getting_around):
Airports, transfers, and local transit — and how they determine which accommodation areas are practical. Cover: which airport(s) serve ${destination} and typical international arrival experience, transfer time and cost ranges from airport to main hotel areas, local transport options available to visitors (metro, taxi, rideshare, ferry, motorbike hire, etc.), and which hotel zones those options make convenient or impractical.
IMPORTANT: The body MUST end with a bullet that begins exactly with "• Framework note:" followed by one structural observation about how accommodation location choice works at ${destination} given the above.

PILLAR 4 — LOCAL PULSE (JSON key: local_pulse):
Cultural norms, legal requirements, and practical conditions at ${destination}. Cover: key cultural practices or restrictions visitors must know before arriving, any legal requirements around dress, alcohol, photography, or behaviour, active seasonal or religious conditions that affect the trip, and practical day-to-day realities that shape the on-the-ground experience.

Respond with ONLY valid JSON — no markdown code fences, no explanation text before or after. Exactly this schema:
{
  "cost_reality":  { "title": "string ≤12 words", "body": "• bullet 1\n• bullet 2\n• bullet 3" },
  "smart_choices": { "title": "string ≤12 words", "body": "• bullet 1\n• bullet 2\n• bullet 3" },
  "getting_around": { "title": "string ≤12 words", "body": "• bullet 1\n• bullet 2\n• Framework note: one structural observation" },
  "local_pulse":   { "title": "string ≤12 words", "body": "• bullet 1\n• bullet 2\n• bullet 3" }
}`;
}

// ── Gemini response types ─────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

interface RawPillarData {
  title: string;
  body: string;
}

// ── Core Gemini call ──────────────────────────────────────────────────────
//
// Returns a plain object keyed by JSON response keys (e.g., "cost_reality"),
// not by IntelPillar values. The plain-object return type is intentional:
// Maps are not JSON-serialisable and would break unstable_cache.
//
// Wrapped by getCachedResearch below; do not call directly from page.tsx.

async function callGeminiForDestination(
  destination: string
): Promise<Record<string, StoredIntelCard> | null> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    console.warn(
      `[destinationResearch] GEMINI_API_KEY is not set — ` +
        `skipping synthesis for "${destination}"`
    );
    return null;
  }

  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = process.env.GEMINI_TIMEOUT_MS
    ? parseInt(process.env.GEMINI_TIMEOUT_MS, 10)
    : DEFAULT_TIMEOUT_MS;

  const prompt = buildSynthesisPrompt(destination);
  const url = `${GEMINI_BASE_URL}/${model}:generateContent`;

  console.log(`[destinationResearch] Gemini request: "${destination}" using ${model}`);

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.15, // low temperature: factual, consistent
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });

  // ── HTTP request ────────────────────────────────────────────────────────
  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  },
  body: requestBody,
  signal: controller.signal,
});
    clearTimeout(timer);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[destinationResearch] Network error for "${destination}": ${reason}`
    );
    return null;
  }

  if (!response.ok) {
    let errBody = "(unreadable)";
    try {
      errBody = await response.text();
    } catch {
      /* ignore */
    }
    console.warn(
      `[destinationResearch] API error ${response.status} for "${destination}": ` +
        errBody.slice(0, 300)
    );
    return null;
  }

  // ── Parse response ──────────────────────────────────────────────────────
  let data: GeminiResponse;
  try {
    data = (await response.json()) as GeminiResponse;
  } catch {
    console.warn(
      `[destinationResearch] Could not parse API response for "${destination}"`
    );
    return null;
  }

  if (data.error) {
    console.warn(
      `[destinationResearch] API returned error for "${destination}": ` +
        `${data.error.status} — ${data.error.message}`
    );
    return null;
  }

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.warn(
      `[destinationResearch] Empty response text for "${destination}"`
    );
    return null;
  }

  // Strip any markdown fences the model might add despite the instruction
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn(
      `[destinationResearch] Response was not valid JSON for "${destination}":`,
      cleaned.slice(0, 300)
    );
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    console.warn(
      `[destinationResearch] Response root is not an object for "${destination}"`
    );
    return null;
  }

  // ── Validate and convert each pillar ────────────────────────────────────
  const parsedObj = parsed as Record<string, unknown>;
  const now = new Date();
  const validUntil = new Date(
    now.getTime() + 3 * 24 * 60 * 60 * 1000 // 3 days — "current" freshness type TTL
  ).toISOString();
  const generatedAt = now.toISOString();

  const result: Record<string, StoredIntelCard> = {};

  for (const [jsonKey, pillar] of Object.entries(PILLAR_MAP)) {
    const raw = parsedObj[jsonKey] as RawPillarData | undefined;

    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.title !== "string" ||
      typeof raw.body !== "string" ||
      !raw.title.trim() ||
      !raw.body.trim()
    ) {
      console.warn(
        `[destinationResearch] Missing or invalid pillar "${jsonKey}" in response for "${destination}"`
      );
      // Skip this pillar — do not write a malformed card
      continue;
    }

    result[jsonKey] = {
      pillar,
      title: raw.title.trim(),
      body: raw.body.trim(),
      generatedAt,
      validUntil,
      confidence: "medium", // training knowledge, not a verified live source
      isResearched: true,
    };
  }

  if (Object.keys(result).length === 0) {
    console.warn(
      `[destinationResearch] All pillars invalid for "${destination}" — discarding response`
    );
    return null;
  }

  console.log(
    `[destinationResearch] Gemini success: "${destination}" — ${Object.keys(result).length} pillars`
  );
    

  return result;
}

// ── Cross-request cache ───────────────────────────────────────────────────
//
// unstable_cache stores the serialised result in Next.js's data cache,
// keyed by ["destination-intel-v2", destination]. This persists across
// serverless function invocations within the same deployment, so the
// second request for "Bali" does not call Gemini again until 72h pass.
//
// Maps are not JSON-serialisable — that's why callGeminiForDestination
// returns Record<string, StoredIntelCard> | null, not a Map.

const getCachedResearch = unstable_cache(
  callGeminiForDestination,
  ["destination-intel-v3"],
  { revalidate: 60 * 60 * 24 * 3 } // 72 hours
);

// ── Public entry point ────────────────────────────────────────────────────
//
// Called by page.tsx instead of the synchronous getDestinationPillars().
//
// Resolution order:
//   1. In-memory store — all 4 pillars fresh → return immediately, no Gemini call.
//   2. getCachedResearch (Gemini via Next.js data cache, 72h TTL) — on success:
//      a. Write cards to in-memory store for the rest of this process lifetime.
//      b. Return via getDestinationPillars() with the stored card map.
//   3. getDestinationPillars() fallback — uses seed data (Dubai / Abu Dhabi)
//      or the honest "not yet researched" state for other destinations.
//
// Never throws. On any failure, falls through to the next level.

export async function getDestinationPillarsLive(
  destination: string | null
): Promise<DestinationIntelResult> {
  if (!destination) {
    return getDestinationPillars(null);
  }

  console.log(
  `[destinationResearch] Live intelligence entry: "${destination}"`
  );

  const PILLARS: IntelPillar[] = [
    "cost-reality",
    "smart-choices",
    "getting-around",
    "local-pulse",
  ];

  // ── 1. Check in-memory store ────────────────────────────────────────────
  // allCardsForDestination is a convenience method on InMemoryIntelStore;
  // it iterates over all stored cards and returns a pillar-keyed Map.
  const storedCards =
    await defaultIntelStore.allCardsForDestination(destination);

  console.log(
  `[destinationResearch] Store check: "${destination}" — ${storedCards.size} cards`,
  Array.from(storedCards.entries()).map(([pillar, card]) => ({
    pillar,
    researched: card.isResearched,
    validUntil: card.validUntil,
  }))
 );

 if (storedCards.size === PILLARS.length) {
    const now = Date.now();
    const allFresh = Array.from(storedCards.values()).every((card) => {
      if (!card.validUntil) return false;
      return new Date(card.validUntil).getTime() > now;
    });
    if (allFresh) {
      return getDestinationPillars(destination, storedCards);
    }
  }

  // ── 2. Gemini (via Next.js data cache) ─────────────────────────────────
  try {
    const raw = await callGeminiForDestination(destination);
    if (raw && Object.keys(raw).length > 0) {
      // Write to in-memory store and build the pillar map for getDestinationPillars
      const pillarMap = new Map<IntelPillar, StoredIntelCard>();

      for (const [jsonKey, card] of Object.entries(raw)) {
        const pillar = PILLAR_MAP[jsonKey];
        if (!pillar) continue;
        // Store in memory (subsequent requests within this process skip Gemini)
        await defaultIntelStore.putCard(destination, pillar, card);
        pillarMap.set(pillar, card);
      }

      return getDestinationPillars(destination, pillarMap);
    }
  } catch (err) {
    // unstable_cache itself can throw on deserialization errors
    console.warn(
      `[destinationResearch] getCachedResearch threw for "${destination}":`,
      err
    );
  }

  // ── 3. Fallback — seed data or honest unavailable state ─────────────────
  return getDestinationPillars(destination);
}
