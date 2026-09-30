import type { DiscoveredHotel } from '../discovery/types';
import type { ThingsToDoProduct } from '../viator/types';
import { parseWorld } from './world';
import { parsePriorities, reconcilePriorities, type WishSelection } from './priorities';

export type MatchQuery = { destination: string; checkIn: string; checkOut: string; requirements: string[]; priorities: WishSelection[] };
export function parseMatchQuery(body: Record<string, unknown>): MatchQuery {
  const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (typeof body.destination !== 'string' || !body.destination.trim() || body.destination.length > 100 ||
      !date(body.checkIn) || !date(body.checkOut) || body.checkOut <= body.checkIn || body.checkIn < new Date().toISOString().slice(0, 10)) throw new Error('Choose a destination and valid future travel dates.');
  const world = parseWorld(body.world);
  return { destination: body.destination.trim(), checkIn: body.checkIn, checkOut: body.checkOut, requirements: world.requirements, priorities: reconcilePriorities(world.requirements, parsePriorities(body.priorities)) };
}
export function catalogueCandidates(hotels: DiscoveredHotel[], destination: string) {
  return hotels.filter(h => !h.isMockData && h.state !== 'draft' && h.city.trim().toLowerCase() === destination.trim().toLowerCase()).slice(0, 6)
    .map(h => ({ id: h.id, name: h.name, area: h.area, city: h.city, starRating: h.starRating }));
}
export function experienceCandidates(products: ThingsToDoProduct[], requirements: string[]) {
  return products.filter(p => p.title.trim() && Number.isFinite(p.fromPrice) && p.fromPrice >= 0).map((p, index) => {
    const text = `${p.title} ${p.shortDescription}`.toLowerCase();
    const relatedWishes = requirements.filter(wish => wish.toLowerCase().match(/[\p{L}]{4,}/gu)?.some(word => new RegExp(`\\b${word}\\b`, 'iu').test(text)));
    return { id: p.supplierProductId, title: p.title, description: p.shortDescription, fromPrice: p.fromPrice, currency: p.currency, relatedWishes, checkedAt: p.checkedAt, index };
  }).sort((a, b) => b.relatedWishes.length - a.relatedWishes.length || a.index - b.index).slice(0, 6).map(({ index, ...p }) => p);
}
export type MatchResults = { destination: string; hotels: ReturnType<typeof catalogueCandidates>; experiences: ReturnType<typeof experienceCandidates>; experiencesMode: 'production' | 'sandbox' | 'unavailable'; hotelStatus: 'ok' | 'unavailable'; pendingWishes: { wish: string; priority: string }[] };
