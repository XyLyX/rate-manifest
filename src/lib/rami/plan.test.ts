import test from 'node:test';
import assert from 'node:assert/strict';
import { completePlanBrief } from './plan';

const world = { scene: 'A beach cabin', question: 'What activities?', requirements: ['Private pool'], changed: true };
test('complete plan keeps accepted wishes distinct from pending experiences', () => {
  const plan = completePlanBrief(world, ['A quiet beach trip'], [{ wish: 'Private pool', priority: 'essential' }], 'A cultural walk', null);
  assert.match(plan, /Accepted trip wishes\n• Private pool \[essential\]/);
  assert.match(plan, /Selected experiences awaiting submission\nA cultural walk/);
  assert.match(plan, /pending requests, not accepted or booked/);
  assert.match(plan, /No confirmed total trip price/);
  assert.doesNotMatch(plan, /Saved shortlist copy/);
});
test('included old shortlists retain provenance and never appear as refreshed offers', () => {
  const plan = completePlanBrief(world, [], [], '', { version: 1, savedAt: '2026-10-01T00:00:00Z', brief: 'MY RAMI SHORTLIST\nExperiences: sandbox\nFrom AED 100 (test price)' });
  assert.match(plan, /included by your choice/);
  assert.match(plan, /2026-10-01T00:00:00Z/);
  assert.match(plan, /may differ from the current wishes/);
  assert.match(plan, /have not been refreshed/);
  assert.match(plan, /test price/);
  assert.match(plan, /priority not chosen/);
});
