import type { MatchResults } from './matches';

export const SHORTLIST_KEY = 'rami-saved-shortlist-v1';
export type SavedShortlist = { version: 1; brief: string; savedAt: string };
export function parseSavedShortlist(value: unknown): SavedShortlist {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved shortlist');
  const saved = value as Record<string, unknown>;
  if (saved.version !== 1 || typeof saved.brief !== 'string' || !saved.brief.startsWith('MY RAMI SHORTLIST\n') || saved.brief.length > 30_000 ||
      typeof saved.savedAt !== 'string' || !Number.isFinite(Date.parse(saved.savedAt))) throw new Error('Invalid saved shortlist');
  return { version: 1, brief: saved.brief, savedAt: saved.savedAt };
}

export function toggleCandidate(selected: string[], id: string, allowed: string[], limit: number): string[] {
  if (!allowed.includes(id)) throw new Error('Choose an option from the current search results.');
  const current = [...new Set(selected)].filter(item => allowed.includes(item));
  if (current.includes(id)) return current.filter(item => item !== id);
  if (current.length >= limit) throw new Error(`Choose up to ${limit} options. Remove one before adding another.`);
  return [...current, id];
}

export function shortlistBrief(results: MatchResults, hotelIds: string[], experienceIds: string[], checkIn: string, checkOut: string): string {
  const hotels = results.hotels.filter(h => hotelIds.includes(h.id));
  const experiences = results.experiences.filter(p => experienceIds.includes(p.id));
  return ['MY RAMI SHORTLIST', `${results.destination} · ${checkIn} to ${checkOut}`, '', 'Stays to consider',
    ...hotels.map(h => `${h.name} · ${h.area}, ${h.city} · ${h.starRating} stars\nSource: Rate Manifest catalogue. Amenities, rates and room availability not confirmed.`),
    ...(hotels.length ? [] : ['No stay selected.']), '', `Experiences to consider (${results.experiencesMode})`,
    ...experiences.map(p => `${p.title}\nSource: Viator · checked ${p.checkedAt}\nFrom ${p.currency} ${p.fromPrice.toFixed(2)} (${results.experiencesMode === 'sandbox' ? 'test price' : 'indicative search price'}). Party-specific price and availability not confirmed.`),
    ...(experiences.length ? [] : ['No experience selected.']), '', 'Wishes still to confirm',
    ...results.pendingWishes.map(s => `${s.wish} · ${s.priority} · needs confirmation`), '',
    'Planning shortlist only. No reservation or payment has been made. No total trip price is available.'].join('\n\n');
}
