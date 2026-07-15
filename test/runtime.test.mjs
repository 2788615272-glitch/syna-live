import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LocalStore } from '../src/runtime/store.mjs';
import { CompanionRuntime } from '../src/runtime/companion-runtime.mjs';

test('runtime presents one small chat interface to callers', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-runtime-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  const calls = [];
  const runtime = new CompanionRuntime({
    store,
    vault: { has: () => true, get: () => 'test-secret' },
    modelAdapter: { complete: async (input) => { calls.push(input); return '我在，怎么啦？'; } },
    liveAdapter: { getStatus: () => ({ connected: false }), disconnect: () => {} }
  });
  const reply = await runtime.chat('听得见吗');
  assert.equal(reply.content, '我在，怎么啦？');
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /Syna/);
  assert.equal(JSON.stringify(calls[0].messages).includes('test-secret'), false);
});
