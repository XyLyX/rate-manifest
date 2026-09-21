import type { TowerKind } from "./types";

// Provider-neutral decision tournament, shared by Hotel, Flight, Rail and Cruise.
//
//   Quarterfinalists -> Semifinalists (Compare) -> traveller chooses a Finalist
//
// This represents decision NARROWING only. It is deliberately blind to
// commerce: nothing here accepts, stores or reads merchants, access routes,
// commissions, campaigns, routes or attribution, and no function reorders,
// scores or "recommends" candidates. Commercial code consumes a tournament
// (see finalValidation.ts / handoff.ts) but can never advance a candidate,
// because no tournament operation takes commercial input and this module
// imports nothing commercial (enforced by tests).
//
// It is pure, immutable domain state. It needs no new persistence: the
// Finalist of a Hotel is already persisted as the hotel component's
// propertyId; Quarterfinalists/Semifinalists are the request-scoped result and
// shortlist sets the journey already carries (e.g. the Compare URL).

export const TOURNAMENT_STAGES = ["quarterfinalist", "semifinalist", "finalist"] as const;
export type TournamentStage = (typeof TOURNAMENT_STAGES)[number];

// The locked Hotel V1 shortlist size, applied as the shared semifinalist cap.
export const SEMIFINALIST_MAX = 5;

// A candidate carries only factual, source-neutral identity/detail.
export interface TournamentCandidate {
  id: string;
  label?: string;
  facts?: Record<string, string | number | boolean | null>;
}

export interface Tournament {
  readonly kind: TowerKind;
  // Source order. Never re-sorted: order is not a ranking.
  readonly candidates: readonly TournamentCandidate[];
  readonly semifinalistIds: readonly string[];
  readonly finalistId: string | null;
  // Only an explicit traveller choice can set a finalist.
  readonly finalistChosenBy: "traveller" | null;
}

// Keys that would smuggle commercial economics, ranking or a manufactured
// "winner" into the decision. Candidates carrying them are refused outright.
const FORBIDDEN_CANDIDATE_KEY =
  /commission|affiliate|payout|revenue|earning|monetis|monetiz|campaign|tracking|sub_?id|access_?route|route_?type|eligib|sponsor|priority|boost|promot|rank|score|recommend|best_?deal|winner/i;

function assertNonCommercial(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_CANDIDATE_KEY.test(k)) {
      throw new Error(`Tournament candidate must not carry commercial/ranking data (${path}.${k})`);
    }
    assertNonCommercial(v, `${path}.${k}`);
  }
}

function freeze(t: Tournament): Tournament {
  return Object.freeze({ ...t, candidates: Object.freeze([...t.candidates]), semifinalistIds: Object.freeze([...t.semifinalistIds]) });
}

/** Admits the Quarterfinalists (the result set the traveller starts narrowing). Order is preserved as given. */
export function admitQuarterfinalists(kind: TowerKind, candidates: readonly TournamentCandidate[]): Tournament {
  const seen = new Set<string>();
  for (const c of candidates) {
    if (typeof c.id !== "string" || c.id.length === 0) throw new Error("Tournament candidate needs a non-empty id");
    if (seen.has(c.id)) throw new Error(`Duplicate tournament candidate: ${c.id}`);
    seen.add(c.id);
    assertNonCommercial(c, c.id);
  }
  return freeze({ kind, candidates: candidates.map((c) => ({ ...c })), semifinalistIds: [], finalistId: null, finalistChosenBy: null });
}

/**
 * The traveller narrows Quarterfinalists to Semifinalists (Compare set).
 * Members must be Quarterfinalists; 1..SEMIFINALIST_MAX; the result keeps the
 * Quarterfinalist order. A previously chosen Finalist that is no longer a
 * Semifinalist is cleared (a Finalist is always a Semifinalist).
 */
export function narrowToSemifinalists(t: Tournament, ids: readonly string[], max: number = SEMIFINALIST_MAX): Tournament {
  const wanted = new Set(ids);
  if (wanted.size !== ids.length) throw new Error("Duplicate semifinalist ids");
  if (wanted.size < 1) throw new Error("At least one semifinalist is required");
  if (wanted.size > max) throw new Error(`At most ${max} semifinalists`);
  const known = new Set(t.candidates.map((c) => c.id));
  for (const id of wanted) if (!known.has(id)) throw new Error(`Not a quarterfinalist: ${id}`);

  const semifinalistIds = t.candidates.map((c) => c.id).filter((id) => wanted.has(id));
  const keep = t.finalistId !== null && wanted.has(t.finalistId);
  return freeze({ ...t, semifinalistIds, finalistId: keep ? t.finalistId : null, finalistChosenBy: keep ? t.finalistChosenBy : null });
}

/** The traveller explicitly chooses ONE Semifinalist as the Finalist. Nothing else can. */
export function chooseFinalist(t: Tournament, id: string, by: "traveller"): Tournament {
  if (by !== "traveller") throw new Error("A Finalist can only be chosen by the traveller");
  if (!t.semifinalistIds.includes(id)) throw new Error(`Not a semifinalist: ${id}`);
  return freeze({ ...t, finalistId: id, finalistChosenBy: "traveller" });
}

export function clearFinalist(t: Tournament): Tournament {
  return freeze({ ...t, finalistId: null, finalistChosenBy: null });
}

export function stageOf(t: Tournament, id: string): TournamentStage | null {
  if (!t.candidates.some((c) => c.id === id)) return null;
  if (t.finalistId === id) return "finalist";
  if (t.semifinalistIds.includes(id)) return "semifinalist";
  return "quarterfinalist";
}

/** Candidates whose CURRENT stage is `stage` (a semifinalist is not also listed as a quarterfinalist). */
export function candidatesAt(t: Tournament, stage: TournamentStage): TournamentCandidate[] {
  return t.candidates.filter((c) => stageOf(t, c.id) === stage);
}

/**
 * Rebuilds a tournament from state the journey already holds (result set,
 * shortlist, chosen property/itinerary/sailing), validating every transition.
 */
export function restoreTournament(
  kind: TowerKind,
  candidates: readonly TournamentCandidate[],
  state: { semifinalistIds?: readonly string[]; finalistId?: string | null }
): Tournament {
  let t = admitQuarterfinalists(kind, candidates);
  const finalistId = state.finalistId ?? null;
  const semis = [...(state.semifinalistIds ?? [])];
  if (finalistId && !semis.includes(finalistId)) semis.push(finalistId);
  if (semis.length > 0) t = narrowToSemifinalists(t, semis);
  if (finalistId) t = chooseFinalist(t, finalistId, "traveller");
  return t;
}
