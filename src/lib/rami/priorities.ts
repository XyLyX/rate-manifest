export type WishPriority = 'essential' | 'flexible';
export type WishSelection = { wish: string; priority: WishPriority };

// Priorities follow exact wishes; changed or removed wishes need a fresh choice.
export function reconcilePriorities(requirements: string[], selections: WishSelection[]): WishSelection[] {
  return requirements.flatMap(wish => {
    const selected = selections.find(s => s.wish === wish);
    return selected ? [{ wish, priority: selected.priority }] : [];
  });
}
export function parsePriorities(value: unknown): WishSelection[] {
  if (value === undefined) return []; // Older saved trips have no priorities.
  if (!Array.isArray(value) || value.length > 20) throw new Error('Invalid wish priorities');
  const result: WishSelection[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || typeof entry.wish !== 'string' || !entry.wish.trim() || entry.wish.length > 240 ||
        (entry.priority !== 'essential' && entry.priority !== 'flexible') || result.some(s => s.wish === entry.wish)) throw new Error('Invalid wish priority');
    result.push({ wish: entry.wish, priority: entry.priority });
  }
  return result;
}
