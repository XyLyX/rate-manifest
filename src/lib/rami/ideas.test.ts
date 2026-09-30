import test from 'node:test';
import assert from 'node:assert/strict';
import { appendIdea, tripIdeas } from './ideas';
import { parseDraft } from './draft';

test('ideas follow the traveller context while leaving arbitrary additions open', () => {
  assert.ok(tripIdeas('a quiet beach').some(i => i.id === 'coast-moment'));
  assert.ok(!tripIdeas('a beach sunset').some(i => i.id === 'coast-moment'));
  assert.ok(tripIdeas('snowy mountains').some(i => i.id === 'warm-evening'));
  const arbitrary = tripIdeas('a volcanic observatory on a distant island');
  assert.ok(arbitrary.some(i => i.id === 'own'));
  assert.ok(arbitrary.some(i => i.id === 'culture'));
  assert.ok(!tripIdeas('mountain nature walk').some(i => i.id === 'nature'));
});
test('idea drafts preserve an unfinished answer and survive saving independently of accepted wishes', () => {
  assert.equal(appendIdea('My original answer', 'A food experience'), 'My original answer\nA food experience');
  assert.equal(appendIdea('A food experience', 'A food experience'), 'A food experience');
  assert.ok(appendIdea('x'.repeat(999), 'A food experience').length <= 1000);
  const saved = parseDraft({ version: 1, answers: [], world: null, input: 'Unsent beach trip', nextIdea: 'A local guide', editing: null, renders: 0 });
  assert.equal(saved.nextIdea, 'A local guide');
  assert.equal(saved.world, null);
  assert.deepEqual(saved.answers, []);
  assert.equal(parseDraft({ ...saved, nextIdea: undefined }).nextIdea, '');
  assert.throws(() => parseDraft({ ...saved, nextIdea: 'x'.repeat(1001) }));
});
