// Intelligence Store — Rate Manifest v2
//
// Implements IntelStore for persistence of destination intelligence
// observations and synthesised cards.
//
// This module provides:
//   1. InMemoryIntelStore — the default implementation. Observations and
//      cards live in process memory and are lost on restart. Use for
//      development, testing, and as the v2 launch backend while DB
//      persistence is not yet wired.
//
//   2. The IntelStore interface contract (re-exported from
//      destinationIntelligence.ts for convenience).
//
// Swapping to DB-backed persistence:
//   Implement IntelStore against your DB client (Drizzle + Postgres, etc.)
//   and replace the export of `defaultIntelStore` below. Nothing in
//   page.tsx or getDestinationPillars() changes — they consume the interface,
//   not the implementation.
//
// Historical observations:
//   upsert() is ADDITIVE. If an observation with the same id already exists,
//   the call is a no-op (idempotent). Observations are never overwritten.
//   The observation log is the canonical history; synthesised cards are a
//   derived cache.

import type {
  IntelObservation,
  IntelPillar,
  IntelStore,
  StoredIntelCard,
} from "./destinationIntelligence";

// ── In-memory implementation ──────────────────────────────────────────────

export class InMemoryIntelStore implements IntelStore {
  // key: `${destination}::${pillar}::${id}`
  private observations = new Map<string, IntelObservation>();

  // key: `${destination}::${pillar}`
  private cards = new Map<string, StoredIntelCard>();

  async upsert(observation: IntelObservation): Promise<void> {
    const key = `${observation.destination}::${observation.pillar}::${observation.id}`;
    if (this.observations.has(key)) {
      // Idempotent — same id already stored, skip
      return;
    }
    this.observations.set(key, observation);
  }

  async query(
    destination: string,
    pillar: IntelPillar
  ): Promise<IntelObservation[]> {
    const prefix = `${destination}::${pillar}::`;
    const results: IntelObservation[] = [];
    for (const [key, obs] of this.observations) {
      if (key.startsWith(prefix)) {
        results.push(obs);
      }
    }
    // Newest first
    results.sort(
      (a, b) =>
        new Date(b.retrievedAt).getTime() - new Date(a.retrievedAt).getTime()
    );
    return results;
  }

  async getCard(
    destination: string,
    pillar: IntelPillar
  ): Promise<StoredIntelCard | null> {
    return this.cards.get(`${destination}::${pillar}`) ?? null;
  }

  async putCard(
    destination: string,
    pillar: IntelPillar,
    card: StoredIntelCard
  ): Promise<void> {
    this.cards.set(`${destination}::${pillar}`, card);
  }

  // ── Convenience methods (not on the interface) ────────────────────────

  /** All observations for a destination, across all pillars, newest first. */
  async allForDestination(destination: string): Promise<IntelObservation[]> {
    const results: IntelObservation[] = [];
    for (const obs of this.observations.values()) {
      if (obs.destination === destination) {
        results.push(obs);
      }
    }
    results.sort(
      (a, b) =>
        new Date(b.retrievedAt).getTime() - new Date(a.retrievedAt).getTime()
    );
    return results;
  }

  /** All stored cards for a destination, keyed by pillar. */
  async allCardsForDestination(
    destination: string
  ): Promise<Map<IntelPillar, StoredIntelCard>> {
    const result = new Map<IntelPillar, StoredIntelCard>();
    const pillars: IntelPillar[] = [
      "cost-reality",
      "smart-choices",
      "getting-around",
      "local-pulse",
    ];
    for (const pillar of pillars) {
      const card = await this.getCard(destination, pillar);
      if (card) result.set(pillar, card);
    }
    return result;
  }

  /** Observation count (for diagnostics / admin). */
  get observationCount(): number {
    return this.observations.size;
  }

  /** Card count (for diagnostics / admin). */
  get cardCount(): number {
    return this.cards.size;
  }
}

// ── Singleton default store ───────────────────────────────────────────────
//
// Module-level singleton: persists across requests within a single Next.js
// server process (useful with route handlers that run background refresh).
// Replace with a DB-backed implementation for multi-instance deployments.

export const defaultIntelStore: InMemoryIntelStore = new InMemoryIntelStore();

// ── Background refresh orchestration ─────────────────────────────────────
//
// Wires together: observations → Gemini synthesis → store → getDestinationPillars
//
// Called by a Route Handler or external cron — NOT by page.tsx.
// page.tsx remains synchronous and never waits on Gemini.

import type { IntelProvider } from "./destinationIntelligence";
import { FRESHNESS_TTL_MS } from "./destinationIntelligence";

export interface RefreshOptions {
  destination: string;
  pillar: IntelPillar;
  store?: IntelStore;
  provider: IntelProvider;
}

/**
 * Re-synthesise a single pillar card from stored observations.
 *
 * Failure modes:
 *   - No observations → no card written; existing card (if any) untouched.
 *   - Provider returns null → same as above.
 *   - Written card sets validUntil based on provider hint or observation TTL.
 */
export async function refreshPillarCard(
  opts: RefreshOptions
): Promise<StoredIntelCard | null> {
  const store = opts.store ?? defaultIntelStore;
  const observations = await store.query(opts.destination, opts.pillar);

  if (observations.length === 0) {
    return null;
  }

  // Most recent observation per signal (dedup by signal label)
  const bySignal = new Map<string, (typeof observations)[0]>();
  for (const obs of observations) {
    if (!bySignal.has(obs.signal)) {
      bySignal.set(obs.signal, obs);
    }
  }

  const evidence = Array.from(bySignal.values()).map((obs) => ({
    signal: obs.signal,
    rawText: obs.rawText,
    sources: obs.sources,
    freshnessType: obs.freshnessType,
  }));

  const result = await opts.provider.synthesize(
    opts.pillar,
    opts.destination,
    evidence
  );

  if (!result) {
    return null;
  }

  // Determine validUntil: provider hint > TTL of shortest-lived observation
  let validUntil = result.validUntil;
  if (!validUntil) {
    const shortestTtlMs = Math.min(
      ...evidence.map((e) => FRESHNESS_TTL_MS[e.freshnessType])
    );
    validUntil = new Date(Date.now() + shortestTtlMs).toISOString();
  }

  const card: StoredIntelCard = {
    pillar: opts.pillar,
    title: result.title,
    body: result.body,
    generatedAt: new Date().toISOString(),
    validUntil,
    confidence: result.confidence,
    isResearched: true,
  };

  await store.putCard(opts.destination, opts.pillar, card);
  return card;
}
