import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePriorities, reconcilePriorities } from './priorities';
import { parseDraft } from './draft';

test('changed wishes never inherit an essential choice from a different wish', () => {
  const choices = parsePriorities([{ wish: 'Private pool', priority: 'essential' }, { wish: 'Quiet beach', priority: 'flexible' }]);
  assert.deepEqual(reconcilePriorities(['Shared pool', 'Quiet beach'], choices), [{ wish: 'Quiet beach', priority: 'flexible' }]);
  assert.deepEqual(reconcilePriorities(['Shared pool'], choices), []);
});
test('saved priorities restore and older drafts remain compatible', () => {
  const draft = { version: 1, answers: ['Quiet beach'], world: { scene: 'Quiet beach', question: 'What stay?', requirements: ['Quiet beach'], changed: true }, input: '', editing: null, renders: 1 };
  assert.deepEqual(parseDraft(draft).priorities, []);
  assert.deepEqual(parseDraft({ ...draft, priorities: [{ wish: 'Quiet beach', priority: 'essential' }, { wish: 'Removed wish', priority: 'flexible' }] }).priorities, [{ wish: 'Quiet beach', priority: 'essential' }]);
  assert.throws(() => parsePriorities([{ wish: 'Quiet beach', priority: 'essential' }, { wish: 'Quiet beach', priority: 'flexible' }]));
  assert.throws(() => parsePriorities([{ wish: 'Quiet beach', priority: 'invented' }]));
});
