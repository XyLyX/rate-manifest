import test from 'node:test';
import assert from 'node:assert/strict';
import { activeResult, updateError } from './update';

test('a late response from a stopped update cannot be committed to the trip', async () => {
  const controller = new AbortController();
  let finish!: (value: string) => void;
  const response = new Promise<string>(resolve => { finish = resolve; });
  let committed = 'previous scene';
  const update = activeResult(response, controller.signal).then(value => { committed = value; });
  controller.abort(); finish('late scene');
  await assert.rejects(update, { name: 'AbortError' });
  assert.equal(committed, 'previous scene');
});
test('active updates finish and stopped updates get a distinct recovery message', async () => {
  assert.equal(await activeResult(Promise.resolve('new scene'), new AbortController().signal), 'new scene');
  assert.match(updateError(new DOMException('cancelled', 'AbortError')), /unfinished answer are retained/);
  assert.equal(updateError(new Error('source unavailable')), 'source unavailable');
});
