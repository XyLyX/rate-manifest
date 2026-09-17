// Destination Intelligence — Rate Manifest v2
//
// This module is the provider-neutral orchestration and model layer for
// the four Travel Intelligence pillars shown on the homepage.
//
// Architecture:
//   - Pure model / orchestration layer: no React, no DB access, no external
//     API calls from this file. Adapters live in separate modules.
//   - IntelProvider interface: any synthesis provider (Gemini, Set Course,
//     static fixture) implements this contract. Swap at the call site.
//   - IntelStore interface: persistence of observations and synthesised cards.
//     In-memory default; swap to a DB-backed implementation without touching
//     this file or page.tsx.
//   - getDestinationPillars() remains the single public entry point for
//     page.tsx — signature unchanged from v1.
//
// Freshness model:
//   Different signal types age at different rates. The freshnessType field
//   on IntelObservation drives TTL decisions in the store:
//     structural  — months to years  (neighbourhood layout, tax regime)
//     seasonal    — weeks to months  (demand patterns, event calendars)
//     current     — days to weeks    (active events, supply changes)
//     realtime    — hours            (live disruptions — future use)
//
// "Nothing Invented" rule:
//   - Every claim in a PillarCard must be sourced and verifiable.
//   - For destinations outside our curated set, the honest state is
//     "not yet researched" — NOT a marketing paragraph about Rate Manifest.
//   - Gemini synthesis (geminiIntelAdapter.ts) produces text only from
//     named evidence; the adapter's structured prompt enforces this.
//
// Extending:
//   - To add a new destination: add a seed entry to SEED_INTEL — verified
//     content only. Do NOT expand this to a global encyclopedia.
//   - To add a new synthesis provider: implement IntelProvider and pass it
//     to your background refresh job.
//   - To add persistent storage: implement IntelStore and wire it in.
//
// Required environment variables (for Gemini synthesis, separate adapter):
//   GEMINI_API_KEY   — Google AI Studio API key (server-side only, never
//                      exposed to client; Next.js: use without NEXT_PUBLIC_)
//   GEMINI_MODEL     — (optional) model ID, default "gemini-1.5-flash"
//   GEMINI_TIMEOUT_MS — (optional) request timeout ms, default 10000

// ── Pillar taxonomy ───────────────────────────────────────────────────────

export type IntelPillar =
  | "cost-reality"
  | "smart-choices"
  | "getting-around"
  | "local-pulse";

export const PILLAR_LABELS: Record<IntelPillar, string> = {
  "cost-reality": "Cost Reality",
  "smart-choices": "Smart Choices",
  "getting-around": "Getting There & Around",
  "local-pulse": "Local Pulse",
};

// ── Freshness taxonomy ────────────────────────────────────────────────────

export type FreshnessType =
  | "structural" // months-years: tax regimes, transport infrastructure, neighbourhood character
  | "seasonal"   // weeks-months: demand patterns, event calendars, seasonal advice
  | "current"    // days-weeks: active events, supply changes
  | "realtime";  // hours: live disruptions (future use)

// TTL in milliseconds per freshness type — for store freshness assessment
export const FRESHNESS_TTL_MS: Record<FreshnessType, number> = {
  structural: 90 * 24 * 60 * 60 * 1000,   // 90 days
  seasonal:   21 * 24 * 60 * 60 * 1000,   // 21 days
  current:     3 * 24 * 60 * 60 * 1000,   //  3 days
  realtime:    4 * 60 * 60 * 1000,         //  4 hours
};

// ── Evidence and observation model ───────────────────────────────────────

export interface IntelSource {
  name: string;        // e.g. "DCCA", "Dubai Media Office", "Rate Manifest research"
  url?: string;        // source URL if available
  retrievedAt: string; // ISO 8601 timestamp
}

// An IntelObservation is a single sourced signal about a destination pillar.
// Observations are ADDITIVE — never overwrite an existing observation.
// The store retains history; freshness assessment reads the latest per pillar.
export interface IntelObservation {
  id: string;            // unique: `${destination}::${pillar}::${retrievedAt}`
  destination: string;
  pillar: IntelPillar;
  signal: string;        // short label: "Tourism Dirham levy", "Ramadan restrictions"
  sources: IntelSource[];
  retrievedAt: string;   // ISO 8601 — when this observation was recorded
  applicableDateRange?: {
    from?: string;  // YYYY-MM-DD
    until?: string; // YYYY-MM-DD — omit for open-ended
  };
  freshnessType: FreshnessType;
  confidenceLevel: "verified" | "high" | "medium" | "low";
  rawText: string;         // source content, unmodified
  synthesisText: string;   // visitor-facing synthesis (from IntelProvider or human)
}

// ── Synthesised card model ────────────────────────────────────────────────

// The output a visitor sees — one per pillar per destination.
// Produced by the IntelProvider from one or more IntelObservations.
export interface PillarCard {
  pillar: IntelPillar;
  label: string;        // resolved display label from PILLAR_LABELS
  title: string;
  body: string;
  freshnessState: "fresh" | "valid" | "stale" | "unavailable";
  // freshState meaning:
  //   fresh       — synthesised within TTL of the most recent observation's freshnessType
  //   valid       — older than fresh TTL but below the stale threshold (2×TTL)
  //   stale       — beyond stale threshold; content shown with a caveat
  //   unavailable — no observation exists for this destination+pillar
  generatedAt?: string; // ISO 8601 — when synthesis ran
  validUntil?: string;  // ISO 8601 — when this card should be re-synthesised
  source?: string;      // short attribution, e.g. "DCCA / Rate Manifest research"
  isResearched: boolean; // false = "unavailable" placeholder, not real intelligence
}

export interface DestinationIntelResult {
  destination: string | null;
  cards: PillarCard[];
  isCurated: boolean; // false = not in SEED_INTEL and no stored intelligence
}

// ── Provider interface ────────────────────────────────────────────────────

// Anything that can synthesise pillar intelligence from evidence.
// Implement this for Gemini, Set Course, or a static fixture.
export interface IntelProvider {
  synthesize(
    pillar: IntelPillar,
    destination: string,
    evidence: Array<{
      signal: string;
      rawText: string;
      sources: IntelSource[];
      freshnessType: FreshnessType;
    }>
  ): Promise<{
    title: string;
    body: string;
    confidence: "verified" | "high" | "medium" | "low";
    validUntil?: string; // ISO 8601 — provider can hint at expiry
  } | null>; // null = synthesis failed; caller falls back to stored intelligence
}

// ── Store interface ───────────────────────────────────────────────────────

export interface StoredIntelCard {
  pillar: IntelPillar;
  title: string;
  body: string;
  generatedAt: string;  // ISO 8601
  validUntil?: string;  // ISO 8601
  confidence: string;
  isResearched: true;   // only researched cards are stored
}

export interface IntelStore {
  // Append an observation. Never overwrites — uses id for dedup.
  upsert(observation: IntelObservation): Promise<void>;

  // Latest observations for a destination + pillar, newest first.
  query(destination: string, pillar: IntelPillar): Promise<IntelObservation[]>;

  // Read the last synthesised card for a destination + pillar.
  // Returns null if none exists.
  getCard(destination: string, pillar: IntelPillar): Promise<StoredIntelCard | null>;

  // Persist a synthesised card.
  putCard(destination: string, pillar: IntelPillar, card: StoredIntelCard): Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function seedCard(
  pillar: IntelPillar,
  title: string,
  body: string,
  opts?: { source?: string; generatedAt?: string }
): PillarCard {
  return {
    pillar,
    label: PILLAR_LABELS[pillar],
    title,
    body,
    freshnessState: "valid", // seed data is curated, not live-synthesised
    isResearched: true,
    source: opts?.source,
    generatedAt: opts?.generatedAt ?? "2026-09",
  };
}

function unavailableCard(pillar: IntelPillar, destination: string): PillarCard {
  // Honest restrained state: we haven't researched this destination yet.
  // NOT a marketing paragraph about Rate Manifest capabilities.
  return {
    pillar,
    label: PILLAR_LABELS[pillar],
    title: PILLAR_LABELS[pillar],
    body: `${destination} hasn't been researched for this pillar yet. Rate Manifest publishes verified intelligence only — we don't generate placeholder content for destinations outside our current dataset.`,
    freshnessState: "unavailable",
    isResearched: false,
  };
}

function assessFreshness(
  card: StoredIntelCard,
  now: number
): "fresh" | "valid" | "stale" {
  if (!card.validUntil) return "valid"; // no expiry set — treat as valid
  const validUntilMs = new Date(card.validUntil).getTime();
  const ttlMs = validUntilMs - new Date(card.generatedAt).getTime();
  if (now < validUntilMs) return "fresh";
  if (now < validUntilMs + ttlMs) return "valid"; // within 2× TTL
  return "stale";
}

// ── Seed intelligence dataset ─────────────────────────────────────────────
//
// Verified, sourced content for launched destinations.
// Keys must match the `destination` values in Trip model (case-sensitive).
// IMPORTANT: do NOT expand this into a global encyclopedia. New destinations
// are added through the Gemini research pipeline, not by manually writing
// paragraphs here. This seed data exists so the product is not empty on
// launch for Dubai and Abu Dhabi.

const SEED_INTEL: Record<string, PillarCard[]> = {
  Dubai: [
    seedCard(
      "cost-reality",
      "What a Dubai hotel actually costs",
      "Dubai hotel rates move faster than most markets because supply responds to event-driven demand. Major DWTC exhibitions — Gulfood, Arab Health, GITEX — compress citywide inventory simultaneously; properties outside the event district still reprice because total supply tightens. On top of the nightly rate, a Tourism Dirham levy (AED 7–50 per room per night, scaled to hotel category) and a 10% municipality fee apply. These appear differently across booking channels, so the headline rate in any comparison rarely reflects the checkout total. Rate Manifest compares totals, not headlines.",
      { source: "Rate Manifest research", generatedAt: "2026-09" }
    ),
    seedCard(
      "smart-choices",
      "District and timing decisions in Dubai",
      "District choice is also a pricing decision. DIFC prices at the top of the market and is the right choice for business-first stays — its proximity to financial institutions and Gate District dining is the point. Downtown Dubai anchors around the Burj Khalifa and Dubai Mall and skews leisure. Business Bay sits adjacent to DIFC at generally lower base rates. Dubai Marina and JBR suit beach-access stays at mid-to-high pricing. The high season runs October through April; summer rates (June–August) are meaningfully lower, offset by 40°C+ heat. Major event weeks produce sharp short-term spikes regardless of season — book ahead if your dates overlap, or avoid if they don't need to.",
      { source: "Rate Manifest research", generatedAt: "2026-09" }
    ),
    seedCard(
      "getting-around",
      "DXB vs DWC, Metro, and taxis",
      "Dubai has two airports. DXB (Dubai International) handles the overwhelming majority of international arrivals and connects directly to the city by Metro: the Red Line runs from Terminals 1 and 3 into Downtown, DIFC, and Dubai Marina — no taxi needed for most hotel districts. DWC (Al Maktoum International / Dubai World Central) is approximately 50km south of Downtown; no Metro connection exists, so all transfers require a taxi or pre-arranged vehicle. Within the city, the Metro Red and Green Lines cover the main hotel corridors. Taxis are metered, affordable by international standards, and widely available. Careem and Uber operate freely across the emirate.",
      { source: "Rate Manifest research", generatedAt: "2026-09" }
    ),
    seedCard(
      "local-pulse",
      "Cultural and practical context for Dubai",
      "Dubai operates under UAE federal law alongside Islamic cultural norms. Outside hotel pools and beach resorts, dress modestly — this applies particularly in souks, around mosques, and in non-resort public areas. During Ramadan, eating and drinking in public during daylight hours is restricted by law; hotel restaurants and private areas are not affected. Alcohol is available only in licensed hotel venues, clubs, and authorised restaurants. Photography of government buildings, military facilities, and people without consent is restricted. Dubai's rapid development means specific venues, routes, and infrastructure can change; verify key logistics closer to travel.",
      { source: "Rate Manifest research", generatedAt: "2026-09" }
    ),
  ],

  "Abu Dhabi": [
    seedCard(
      "cost-reality",
      "What drives Abu Dhabi hotel pricing",
      "Abu Dhabi hotel pricing runs on two distinct demand cycles. The Yas Marina Circuit Formula 1 Grand Prix — held annually, typically late November — produces the steepest short-term pricing on Yas Island. ADNEC (Abu Dhabi National Exhibition Centre) events create demand spikes across the city's business districts. Outside these peaks, base rates are generally lower than comparable Dubai properties. Standard charges include a 10% service fee; municipality and tourism fees apply and vary by property classification. Ask for the total inclusive figure before treating any headline rate as a comparison point.",
      { source: "Rate Manifest research", generatedAt: "2026-09" }
    ),
    seedCard(
      "smart-choices",
      "Corniche, Yas Island, or Saadiyat: which area for your trip",
      "Abu Dhabi's districts serve distinct trip purposes with distinct pricing. The Corniche and downtown cluster suits business stays and access to federal government offices. Yas Island is the leisure hub — Ferrari World, Warner Bros. World, Yas Marina Circuit, Yas Mall — with resort-tier pricing to match. Saadiyat Island is positioned around cultural tourism (the Louvre Abu Dhabi anchors it) alongside a beach resort tier at a premium price point. The convenience premium of Yas Island is only justified if the island's attractions are the actual reason for the trip; for city business, the Corniche or downtown avoids a 20–30 minute unnecessary transfer.",
      { source: "Rate Manifest research", generatedAt: "2026-09" }
    ),
    seedCard(
      "getting-around",
      "AUH airport, taxis, and no metro",
      "Abu Dhabi International Airport (AUH) is approximately 35km east of the city centre and 30 minutes from Yas Island. Unlike Dubai, Abu Dhabi does not have a metro system. Taxis, Careem, and Uber are the standard options for the airport transfer and all city journeys. The Etihad Rail intercity network — which began passenger services in 2024 — connects Abu Dhabi to Dubai and Al Ain; verify the current schedule and station locations before planning around it. For most visitors, the absence of a Metro means that hotel location relative to your actual itinerary is a more consequential decision here than in Dubai.",
      { source: "Rate Manifest research", generatedAt: "2026-09" }
    ),
    seedCard(
      "local-pulse",
      "Cultural and practical context for Abu Dhabi",
      "Abu Dhabi applies UAE federal standards, often with stricter local enforcement than Dubai. Dress modestly outside hotel and resort areas; this is observed more consistently here. Alcohol is available only in licensed hotel venues. Photographing government buildings, palaces, embassies, and people without consent is restricted. Abu Dhabi is the UAE's federal capital, which means government offices, ministries, and major institutions are concentrated here — the city operates on a more reserved professional register than Dubai. For business visitors, understanding this distinction affects both scheduling and conduct expectations.",
      { source: "Rate Manifest research", generatedAt: "2026-09" }
    ),
  ],
};

// ── Empty state: no destination selected ─────────────────────────────────
// Shows what the four pillars mean without claiming destination knowledge.
// These are product-explaining cards, not marketing paragraphs.

const EMPTY_STATE_CARDS: PillarCard[] = [
  {
    pillar: "cost-reality",
    label: PILLAR_LABELS["cost-reality"],
    title: "Know the real cost of being there",
    body: "From flights and hotels to daily expenses — get a clear picture before you go.",
    freshnessState: "valid",
    isResearched: false,
  },
  {
    pillar: "smart-choices",
    label: PILLAR_LABELS["smart-choices"],
    title: "Find what truly fits you",
    body: "Compare stays, locations and experiences with intelligence that goes beyond price.",
    freshnessState: "valid",
    isResearched: false,
  },
  {
    pillar: "getting-around",
    label: PILLAR_LABELS["getting-around"],
    title: "Move smarter, explore further",
    body: "Flights, transfers, public transport and local options — all in one place.",
    freshnessState: "valid",
    isResearched: false,
  },
  {
    pillar: "local-pulse",
    label: PILLAR_LABELS["local-pulse"],
    title: "Go beyond the guidebook",
    body: "Real neighbourhoods, local experiences and insider insights for a richer journey.",
    freshnessState: "valid",
    isResearched: false,
  },
];

// ── Public API ────────────────────────────────────────────────────────────
//
// page.tsx calls only this function — signature unchanged from v1.
//
// Resolution order:
//   1. SEED_INTEL — curated, verified cards for launched destinations.
//   2. store (optional, injected) — live synthesised cards from the Gemini
//      research pipeline; fresher than seed where available.
//   3. Honest unavailable state — for destinations outside our dataset.
//      NOT a marketing paragraph.
//
// The store parameter is optional here so page.tsx stays simple (no async
// store initialisation in the server component). The background refresh job
// (future: a Next.js Route Handler or cron) uses the IntelStore directly.

export function getDestinationPillars(
  destination: string | null,
  storedCards?: Map<IntelPillar, StoredIntelCard>
): DestinationIntelResult {
  if (!destination) {
    return { destination: null, cards: EMPTY_STATE_CARDS, isCurated: false };
  }

  const now = Date.now();
  const PILLARS: IntelPillar[] = [
    "cost-reality",
    "smart-choices",
    "getting-around",
    "local-pulse",
  ];

  const seed = SEED_INTEL[destination];

  const cards: PillarCard[] = PILLARS.map((pillar) => {
    // 1. Check stored (live) card — higher priority than seed when fresh/valid
    if (storedCards) {
      const stored = storedCards.get(pillar);
      if (stored) {
        const freshness = assessFreshness(stored, now);
        if (freshness !== "stale") {
          return {
            pillar,
            label: PILLAR_LABELS[pillar],
            title: stored.title,
            body: stored.body,
            freshnessState: freshness,
            generatedAt: stored.generatedAt,
            validUntil: stored.validUntil,
            isResearched: true,
          };
        }
        // stale stored card — fall through to seed, but use stored body
        // with a note that it may be outdated (future: add stale UI indicator)
        return {
          pillar,
          label: PILLAR_LABELS[pillar],
          title: stored.title,
          body: stored.body,
          freshnessState: "stale",
          generatedAt: stored.generatedAt,
          isResearched: true,
        };
      }
    }

    // 2. Seed card
    if (seed) {
      const seedPillarCard = seed.find((c) => c.pillar === pillar);
      if (seedPillarCard) return seedPillarCard;
    }

    // 3. Honest unavailable state — not marketing copy
    return unavailableCard(pillar, destination);
  });

  const isCurated = !!seed || (storedCards !== undefined && storedCards.size > 0);

  return { destination, cards, isCurated };
}
