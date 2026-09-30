import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDraft } from './draft';

const draft = { version: 1, answers: ['A quiet black-sand beach'], world: { scene: 'A black-sand beach', question: 'What stay would you like?', requirements: ['Quiet beach'], changed: true }, input: 'Small cabin', editing: 0, renders: 3 };
test('saved trip restores corrections and allowance, excluding secrets and image payloads', () => {
  const saved = parseDraft({ ...draft, accessCode: 'secret', image: 'data:image/jpeg;base64,abc', world: { ...draft.world, accessCode: 'secret' } });
  assert.equal(saved.editing, 0);
  assert.equal(saved.renders, 3);
  assert.equal(saved.input, 'Small cabin');
  assert.doesNotMatch(JSON.stringify(saved), /secret|accessCode|data:image/);
  assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(saved))), saved);
});
test('corrupt and incompatible saved trips cannot enter the active journey', () => {
  for (const patch of [{ version: 2 }, { renders: 13 }, { editing: 1 }, { answers: [] }, { world: null }, { input: 'x'.repeat(1001) }]) {
    assert.throws(() => parseDraft({ ...draft, ...patch }));
  }
});
