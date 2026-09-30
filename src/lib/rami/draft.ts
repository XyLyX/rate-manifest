import { parseWorld, type World } from './world';
import { parsePriorities, reconcilePriorities, type WishSelection } from './priorities';

export const DRAFT_KEY = 'rami-trip-draft-v1';
export type TripDraft = { version: 1; answers: string[]; world: World | null; input: string; editing: number | null; renders: number; priorities: WishSelection[] };

// Explicit allowlist: access codes and image payloads never enter the saved brief.
export function parseDraft(value: unknown): TripDraft {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved trip');
  const draft = value as Record<string, unknown>;
  if (draft.version !== 1 || !Array.isArray(draft.answers) || draft.answers.length > 12 ||
      draft.answers.some(a => typeof a !== 'string' || !a.trim() || a.length > 1000) ||
      typeof draft.input !== 'string' || draft.input.length > 1000 ||
      !Number.isInteger(draft.renders) || (draft.renders as number) < 0 || (draft.renders as number) > 12 ||
      (draft.editing !== null && (!Number.isInteger(draft.editing) || (draft.editing as number) < 0 || (draft.editing as number) >= draft.answers.length))) {
    throw new Error('Invalid saved trip');
  }
  const world = draft.world === null ? null : parseWorld(draft.world);
  if ((draft.answers.length > 0) !== (world !== null)) throw new Error('Incomplete saved trip');
  return { version: 1, answers: [...draft.answers] as string[], world: world ? { scene: world.scene, question: world.question, requirements: [...world.requirements], changed: world.changed } : null,
    input: draft.input, editing: draft.editing as number | null, renders: draft.renders as number,
    priorities: reconcilePriorities(world?.requirements ?? [], parsePriorities(draft.priorities)) };
}
