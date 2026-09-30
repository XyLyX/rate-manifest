import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueCandidates, experienceCandidates, parseMatchQuery, parseParty } from './matches';
import type { DiscoveredHotel } from '../discovery/types';
import type { ThingsToDoProduct } from '../viator/types';

test('matching requires an explicit destination and valid future dates', () => {
  const body = { party: { adults: 2, rooms: 1, childAges: [0, 12] }, world: { scene: 'Beach villa', question: 'When?', requirements: ['Private pool'], changed: true }, destination: ' Dubai ', checkIn: '2099-01-01', checkOut: '2099-01-03' };
  assert.equal(parseMatchQuery(body).destination, 'Dubai');
  for (const patch of [{ destination: '' }, { checkIn: '2099-02-30' }, { checkOut: '2099-01-01' }, { checkIn: '2000-01-01' }]) assert.throws(() => parseMatchQuery({ ...body, ...patch }));
});
test('catalogue matching excludes mock, draft and wrong destination identities', () => {
  const hotel: DiscoveredHotel = { id: '1', name: 'Stay', area: 'Marina', city: 'Dubai', starRating: 5, imageUrl: null, state: 'curated', sourceId: 'curated-catalog', sourcePropertyId: '1', isMockData: false };
  const result = catalogueCandidates([hotel, { ...hotel, id: '2', isMockData: true }, { ...hotel, id: '3', state: 'draft' }, { ...hotel, id: '4', city: 'Other city' }], 'dubai');
  assert.deepEqual(result.map(h => h.id), ['1']);
  assert.equal('price' in result[0]!, false);
  assert.equal('confirmedAvailable' in result[0]!, false);
});
test('experience text relevance never claims wish fulfilment or availability', () => {
  const product: ThingsToDoProduct = { supplierProductId: '1', supplierSlug: 'viator', supplierName: 'Viator', title: 'Kayaking tour', shortDescription: 'Kayaking on the coast', imageUrl: null, rating: null, reviewCount: 0, currency: 'AED', fromPrice: 100, confirmedAvailable: false, bookingUrl: 'https://www.viator.com', checkedAt: '2026-10-01T00:00:00Z' };
  const result = experienceCandidates([product], ['Kayaking', 'Private pool']);
  assert.deepEqual(result[0]?.relatedWishes, ['Kayaking']);
  assert.equal('confirmedAvailable' in result[0]!, false);
  assert.equal(result[0]?.fromPrice, 100);
});

test('party validation retains infant age zero and rejects missing or invalid ages', () => {
  assert.deepEqual(parseParty({ adults: 2, rooms: 1, childAges: [0, 17] }).childAges, [0, 17]);
  for (const party of [null, { adults: 0, rooms: 1, childAges: [] }, { adults: 1, rooms: 2, childAges: [] }, { adults: 2, rooms: 1, childAges: [''] }, { adults: 2, rooms: 1, childAges: [18] }]) assert.throws(() => parseParty(party));
});
