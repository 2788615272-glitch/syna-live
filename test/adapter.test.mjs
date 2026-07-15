import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleAdapter } from '../src/runtime/adapters/openai-compatible.mjs';

test('Kimi requests always use the model-required temperature of 1', async (t) => {
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

  assert.equal(requestBody.temperature, 1);
});
