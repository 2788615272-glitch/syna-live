import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleAdapter } from '../src/runtime/adapters/openai-compatible.mjs';

test('Kimi K2.5 requests use the model-required temperature of 0.6', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const adapter = new OpenAICompatibleAdapter();
  await adapter.complete({
    id: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.5',
    apiKey: 'test-key',
    temperature: 0,
    messages: [{ role: 'user', content: 'test' }]
  });

  assert.equal(requestBody.temperature, 0.6);
  assert.deepEqual(requestBody.thinking, { type: 'disabled' });
});

test('Kimi streaming disables thinking and yields text deltas immediately', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response('data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const chunks = [];
  for await (const chunk of new OpenAICompatibleAdapter().stream({ id: 'moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.5', apiKey: 'key', messages: [] })) chunks.push(chunk);
  assert.deepEqual(chunks, ['你', '好']);
  assert.deepEqual(requestBody.thinking, { type: 'disabled' });
  assert.equal(requestBody.stream, true);
  assert.equal(requestBody.temperature, 0.6);
});
