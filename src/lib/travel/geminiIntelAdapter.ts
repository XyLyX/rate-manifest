// Gemini Intelligence Adapter — Rate Manifest v2
//
// SERVER-SIDE ONLY. Never import this file in a client component or any
// module that might be bundled for the browser.
//
// This adapter implements IntelProvider using Google Gemini via the
// Generative Language REST API. It converts raw source evidence into
// structured, visitor-facing pillar cards using a constrained prompt that
// enforces the "Nothing Invented" rule: Gemini is instructed to synthesise
// only from the evidence provided, not from its training data.
//
// Required environment variables:
//   GEMINI_API_KEY    — Google AI Studio API key. Obtain from
//                       https://aistudio.google.com/app/apikey
//                       Never prefix with NEXT_PUBLIC_. Never log this value.
//   GEMINI_MODEL      — (optional) Gemini model ID.
//                       Default: "gemini-1.5-flash"
//                       Alternatives: "gemini-1.5-pro" (higher quality, slower)
//   GEMINI_TIMEOUT_MS — (optional) HTTP request timeout in milliseconds.
//                       Default: 10000 (10 seconds)
//
// Failure contract:
//   synthesize() returns null on any failure — network error, API error,
//   malformed response, timeout, or missing/invalid key. The caller
//   (getDestinationPillars or the background refresh job) falls back to
//   stored intelligence or the honest "unavailable" state. This adapter
//   NEVER throws; it logs a warning and returns null.
//
// Structured output:
//   Gemini is instructed to return valid JSON matching the PillarSynthesis
//   schema. The response is parsed and validated before returning; an
//   invalid JSON response is treated as a synthesis failure.

import type {
  IntelPillar,
  IntelProvider,
  IntelSource,
  FreshnessType,
} from "./destinationIntelligence";

// ── Types ─────────────────────────────────────────────────────────────────

interface PillarSynthesisInput {
  signal: string;
  rawText: string;
  sources: IntelSource[];
  freshnessType: FreshnessType;
}

interface PillarSynthesisResult {
  title: string;
  body: string;
  confidence: "verified" | "high" | "medium" | "low";
  validUntil?: string; // ISO 8601 date hint from the model
}

// Gemini REST API response shape (abbreviated to what we use)
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

// ── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "gemini-1.5-flash";
const DEFAULT_TIMEOUT_MS = 10_000;
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

// ── Prompt construction ───────────────────────────────────────────────────

function buildPrompt(
  pillar: IntelPillar,
  destination: string,
  evidence: PillarSynthesisInput[]
): string {
  const pillarDescriptions: Record<IntelPillar, string> = {
    "cost-reality":
      "what a stay at this destination actually costs — total pricing, taxes, fees, levies, demand drivers",
    "smart-choices":
      "timing, district selection, booking-source decisions, and event awareness that materially affect value",
    "getting-around":
      "airport(s), transfer options, local transit, and which accommodation locations those make sensible or impractical",
    "local-pulse":
      "cultural norms, legal requirements, active events, and practical conditions that shape the on-the-ground experience",
  };

  const evidenceBlock = evidence
    .map((e, i) => {
      const sourceNames = e.sources.map((s) => s.name).join(", ");
      return `--- Evidence ${i + 1} ---
Signal: ${e.signal}
Sources: ${sourceNames}
Freshness type: ${e.freshnessType}
Content:
${e.rawText}`;
    })
    .join("\n\n");

  return `You are producing verified destination intelligence for a travel decision platform called Rate Manifest.

Your task: synthesise the evidence below into a single structured pillar card for the "${pillar}" pillar (${pillarDescriptions[pillar]}) for ${destination}.

Rules you MUST follow:
1. Use ONLY the evidence provided. Do not add facts from your own training data.
2. If the evidence does not support a claim, omit that claim. Do not invent.
3. Write in a neutral, professional register — no marketing language, no superlatives.
4. The body should be 2–4 sentences. Dense, specific, factual. Not a bullet list.
5. The title should be ≤ 12 words, specific to this destination and pillar.
6. Set confidence to "verified" only if every claim has a named source. Otherwise "high", "medium", or "low".
7. Estimate validUntil as an ISO 8601 date (YYYY-MM-DD) based on how long the synthesised claims are likely to remain accurate given the evidence's freshness types.

Respond with ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "title": string,
  "body": string,
  "confidence": "verified" | "high" | "medium" | "low",
  "validUntil": string  // ISO 8601 date, e.g. "2027-03-01"
}

Evidence:

${evidenceBlock}`;
}

// ── Response parsing ──────────────────────────────────────────────────────

function parseGeminiSynthesis(
  responseText: string
): PillarSynthesisResult | null {
  // Strip any markdown code fences the model might add despite instructions
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("[GeminiIntelAdapter] Response was not valid JSON:", cleaned.slice(0, 200));
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).title !== "string" ||
    typeof (parsed as Record<string, unknown>).body !== "string" ||
    !["verified", "high", "medium", "low"].includes(
      (parsed as Record<string, unknown>).confidence as string
    )
  ) {
    console.warn("[GeminiIntelAdapter] Response schema invalid:", parsed);
    return null;
  }

  const p = parsed as Record<string, unknown>;
  return {
    title: p.title as string,
    body: p.body as string,
    confidence: p.confidence as "verified" | "high" | "medium" | "low",
    validUntil: typeof p.validUntil === "string" ? p.validUntil : undefined,
  };
}

// ── Adapter ───────────────────────────────────────────────────────────────

export class GeminiIntelAdapter implements IntelProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts?: { apiKey?: string; model?: string; timeoutMs?: number }) {
    const key = opts?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    if (!key) {
      // Log once at construction rather than on every synthesize() call
      console.warn(
        "[GeminiIntelAdapter] GEMINI_API_KEY is not set. " +
          "Synthesis will return null; the system will use stored intelligence."
      );
    }
    this.apiKey = key;
    this.model = opts?.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs =
      opts?.timeoutMs ??
      (process.env.GEMINI_TIMEOUT_MS
        ? parseInt(process.env.GEMINI_TIMEOUT_MS, 10)
        : DEFAULT_TIMEOUT_MS);
  }

  async synthesize(
    pillar: IntelPillar,
    destination: string,
    evidence: PillarSynthesisInput[]
  ): Promise<PillarSynthesisResult | null> {
    if (!this.apiKey) return null;
    if (evidence.length === 0) {
      console.warn(
        `[GeminiIntelAdapter] No evidence for ${destination}::${pillar} — skipping`
      );
      return null;
    }

    const prompt = buildPrompt(pillar, destination, evidence);
    const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,        // low temperature: factual, not creative
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });

    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[GeminiIntelAdapter] Network error for ${destination}::${pillar}: ${reason}`
      );
      return null;
    }

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = "(unreadable)";
      }
      console.warn(
        `[GeminiIntelAdapter] API error ${response.status} for ${destination}::${pillar}: ${errorBody.slice(0, 300)}`
      );
      return null;
    }

    let data: GeminiResponse;
    try {
      data = (await response.json()) as GeminiResponse;
    } catch {
      console.warn(
        `[GeminiIntelAdapter] Could not parse API response for ${destination}::${pillar}`
      );
      return null;
    }

    if (data.error) {
      console.warn(
        `[GeminiIntelAdapter] API returned error for ${destination}::${pillar}: ` +
          `${data.error.status} — ${data.error.message}`
      );
      return null;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.warn(
        `[GeminiIntelAdapter] Empty text in response for ${destination}::${pillar}`
      );
      return null;
    }

    return parseGeminiSynthesis(text);
  }
}

// ── Factory (convenience) ─────────────────────────────────────────────────
// Creates a GeminiIntelAdapter from environment variables. Used by the
// background refresh job. Not called by page.tsx.

export function createGeminiAdapter(): GeminiIntelAdapter {
  return new GeminiIntelAdapter();
}
