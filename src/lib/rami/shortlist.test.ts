import test from 'node:test';
import assert from 'node:assert/strict';
import { shortlistBrief, toggleCandidate } from './shortlist';
import type { MatchResults } from './matches';

test('shortlisting requires a current candidate and never silently replaces a choice', () => {
  assert.deepEqual(toggleCandidate([], 'a', ['a', 'b'], 1), ['a']);
  assert.deepEqual(toggleCandidate(['a'], 'a', ['a', 'b'], 1), []);
  assert.throws(() => toggleCandidate(['a'], 'b', ['a', 'b'], 1), /Remove one/);
  assert.throws(() => toggleCandidate([], 'invented', ['a'], 5));
  assert.deepEqual(toggleCandidate(['old', 'a', 'a'], 'b', ['a', 'b'], 5), ['a', 'b']);
});
test('download includes only explicit choices and preserves test-price and unconfirmed labels', () => {
  const results: MatchResults = { destination: 'Dubai', hotels: [{ id: 'a', name: 'Stay A', area: 'Marina', city: 'Dubai', starRating: 5 }, { id: 'b', name: 'Stay B', area: 'Marina', city: 'Dubai', starRating: 4 }], experiences: [{ id: 'a', title: 'Kayaking', description: '', fromPrice: 100, currency: 'AED', relatedWishes: [], checkedAt: '2026-10-01T00:00:00Z' }], experiencesMode: 'sandbox', hotelStatus: 'ok', pendingWishes: [{ wish: 'Private pool', priority: 'essential' }] };
  const brief = shortlistBrief(results, ['b', 'invented'], ['a'], '2099-01-01', '2099-01-03');
  assert.match(brief, /Stay B/); assert.doesNotMatch(brief, /Stay A|invented/);
  assert.match(brief, /Kayaking/); assert.match(brief, /test price/);
  assert.match(brief, /Private pool · essential · needs confirmation/);
  assert.match(brief, /No total trip price is available/);
  assert.match(brief, /2099-01-01 to 2099-01-03/);
});
