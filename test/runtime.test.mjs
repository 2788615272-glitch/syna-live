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
    modelAdapter: { stream: async function* (input) { calls.push(input); yield '[眨眼]'; yield '我在，'; yield '怎么啦？'; } },
    liveAdapter: { getStatus: () => ({ connected: false }), disconnect: () => {} }
  });
  const reply = await runtime.chat('听得见吗');
  assert.equal(reply.content, '我在，怎么啦？');
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /Syna/);
  assert.equal(JSON.stringify(calls[0].messages).includes('test-secret'), false);
  assert.equal(store.getStageState().expression, 'wink');
});

test('runtime emits token, speech and expression events while the model streams', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-stream-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  const runtime = new CompanionRuntime({
    store,
    vault: { has: () => true, get: () => 'key' },
    modelAdapter: { stream: async function* () { yield '[生'; yield '气]不许这样，'; yield '听见没有！'; } },
    liveAdapter: { getStatus: () => ({ connected: false }), disconnect: () => {} }
  });
  const events = [];
  for await (const event of runtime.chatStream('测试')) events.push(event);
  assert.equal(events.find((event) => event.type === 'expression').expression, 'angry');
  assert.equal(events.filter((event) => event.type === 'token').map((event) => event.text).join(''), '不许这样，听见没有！');
  assert.ok(events.some((event) => event.type === 'speech'));
  assert.equal(events.at(-1).type, 'done');
});

test('runtime includes prior turns in later model requests', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  const requests = [];
  const runtime = new CompanionRuntime({
    store,
    vault: { has: () => true, get: () => 'key' },
    modelAdapter: { stream: async function* (input) { requests.push(input); yield requests.length === 1 ? '第一轮回答' : '第二轮回答'; } },
    liveAdapter: { getStatus: () => ({ connected: false }), disconnect: () => {} }
  });
  await runtime.chat('第一轮问题');
  await runtime.chat('第二轮问题');
  assert.deepEqual(requests[1].messages.slice(1).map(({ role, content }) => [role, content]), [
    ['user', '第一轮问题'], ['assistant', '第一轮回答'], ['user', '第二轮问题']
  ]);
});

test('vision analysis stores screen context and can produce a proactive reaction', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-vision-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  await store.saveConfig({ ...store.getConfig(), vision: { enabled: true, intervalSeconds: 6, proactive: true } });
  let request;
  const runtime = new CompanionRuntime({
    store,
    vault: { has: () => true, get: () => 'key' },
    modelAdapter: { complete: async (input) => { request = input; return JSON.stringify({ summary: '用户正在编辑代码', salience: 0.9, suggestedReply: '这段代码看起来快完成了。' }); } },
    liveAdapter: { getStatus: () => ({ connected: false }), disconnect: () => {} }
  });
  const result = await runtime.analyzeVision('data:image/jpeg;base64,AA==');
  assert.equal(result.shouldReact, true);
  assert.equal(store.getStageState().vision.summary, '用户正在编辑代码');
  assert.equal(request.messages[1].content[1].type, 'image_url');
});

test('dual-brain chat explicitly trusts fresh vision instead of claiming it cannot see', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-vision-chat-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  await store.saveConfig({ ...store.getConfig(), vision: { enabled: true, mode: 'dual', intervalSeconds: 6, proactive: false } });
  store.setStageState({ vision: { summary: '桌面打开着代码编辑器', updatedAt: Date.now() } });
  let request;
  const runtime = new CompanionRuntime({
    store,
    vault: { has: () => true, get: () => 'key' },
    modelAdapter: { stream: async function* (input) { request = input; yield '我看到代码编辑器。'; } },
    liveAdapter: { getStatus: () => ({ connected: false }), disconnect: () => {} }
  });
  await runtime.chat('你看到了什么');
  assert.match(request.messages[0].content, /可以看见/);
  assert.match(request.messages[0].content, /不要回答.*看不见/);
});

test('single-brain vision attaches the latest screenshot directly to the user turn', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-single-vision-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  await store.saveConfig({ ...store.getConfig(), vision: { enabled: true, mode: 'single', intervalSeconds: 6, proactive: false } });
  let request;
  let visionAnalysisCalls = 0;
  const runtime = new CompanionRuntime({
    store,
    vault: { has: () => true, get: () => 'key' },
    modelAdapter: {
      complete: async () => { visionAnalysisCalls += 1; return '{}'; },
      stream: async function* (input) { request = input; yield '我看到了。'; }
    },
    liveAdapter: { getStatus: () => ({ connected: false }), disconnect: () => {} }
  });
  await runtime.analyzeVision('data:image/jpeg;base64,AA==');
  await runtime.chat('现在屏幕上是什么');
  assert.equal(visionAnalysisCalls, 0);
  const user = request.messages.at(-1);
  assert.equal(user.content[1].type, 'image_url');
  assert.equal(user.content[1].image_url.url, 'data:image/jpeg;base64,AA==');
});
