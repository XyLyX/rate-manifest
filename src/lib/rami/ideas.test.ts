import test from 'node:test';
import assert from 'node:assert/strict';
import { appendIdea, pendingIdeas, remainingIdeas, tripIdeas } from './ideas';
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
test('accepting a suggestion batch preserves new selections and concurrent edits', () => {
  assert.equal(remainingIdeas('A local guide', 'A local guide'), '');
  assert.equal(remainingIdeas('A local guide\nA sunset meal', 'A local guide'), 'A sunset meal');
  assert.equal(remainingIdeas('An edited cultural walk', 'A local guide'), 'An edited cultural walk');
});
test('select advances the stream and selected experiences never repeat', () => {
  const ideas = tripIdeas('quiet beach').filter(idea => idea.id !== 'own');
  const first = ideas[0]!;
  const selected = appendIdea('', first.answer);
  const remaining = pendingIdeas(ideas, selected);
  assert.equal(remaining.length, ideas.length - 1);
  assert.ok(!remaining.some(idea => idea.id === first.id));
  assert.notEqual(remaining[0]?.id, first.id);
  assert.deepEqual(pendingIdeas(ideas, ideas.map(idea => idea.answer).join('\n')), []);
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
