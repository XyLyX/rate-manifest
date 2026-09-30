import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorld, scenePrompt } from './world';
import { POST } from '../../app/api/rami/prototype/route';

test('free-form scenery is retained, including environments outside fixed themes', () => {
  const scene = 'A volcanic island with black sand, a quiet cabin and a northern-lights sky';
  assert.equal(parseWorld({ scene, question: 'Who is travelling?', requirements: [scene], changed: true }).scene, scene);
  assert.match(scenePrompt(scene), /remove features the traveller replaced/);
  assert.throws(() => parseWorld({ scene, question: '', requirements: ['x'.repeat(241)], changed: true }));
});
test('private API fails closed and edits the previous image instead of regenerating', async () => {
  const env = { ...process.env };
  const originalFetch = globalThis.fetch;
  const world = { scene: 'Snowy mountain cabin for a family', question: 'What activities?', requirements: ['Family'], changed: true };
  const req = (body: object, token = 'private-test') => new Request('https://example.test/api/rami/prototype', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, accessCode: token }) });
  try {
    delete process.env.RAMI_PROTOTYPE_ENABLED;
    assert.equal((await POST(req({ action: 'describe' }))).status, 503);
    process.env.RAMI_PROTOTYPE_ENABLED = 'true'; process.env.RAMI_PROTOTYPE_TOKEN = 'private-test'; process.env.OPENAI_API_KEY = 'test-only';
    assert.equal((await POST(req({}, 'wrong'))).status, 401);
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      if (String(url).endsWith('/chat/completions')) {
        const body = JSON.parse(options?.body as string);
        assert.match(body.messages[1].content, /Snowy/);
        return Response.json({ choices: [{ message: { content: JSON.stringify(world) } }] });
      }
      assert.match(String(url), /images\/edits$/);
      assert.ok(options?.body instanceof FormData);
      assert.ok(options.body.get('image') instanceof Blob);
      assert.match(String(options.body.get('prompt')), /Snowy mountain cabin for a family/);
      return Response.json({ data: [{ b64_json: 'YWJj' }] });
    };
    const description = await POST(req({ action: 'describe', answers: ['Snowy mountain cabin, family'], previous: null }));
    assert.deepEqual((await description.json()).world, world);
    const rendered = await POST(req({ action: 'render', world, image: 'data:image/jpeg;base64,YWJj' }));
    assert.equal((await rendered.json()).image, 'data:image/jpeg;base64,YWJj');
    assert.equal(calls, 2);
    assert.equal((await POST(req({ action: 'render', world, image: 'https://untrusted.test/image' }))).status, 400);
    globalThis.fetch = async () => Response.json({ error: 'provider failure' }, { status: 429 });
    assert.equal((await POST(req({ action: 'render', world }))).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
