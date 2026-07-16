import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LocalStore } from '../src/runtime/store.mjs';

test('default profile is public and usable', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  const config = store.getConfig();
  assert.equal(config.character.name, 'Syna');
  assert.equal(config.character.userName, '搭档');
  assert.equal(config.live.enabled, false);
  assert.equal(config.live.roomId, '');
  assert.equal(config.voice.asrMode, 'browser');
  assert.equal(config.voice.outputMode, 'system');
  assert.equal(config.voice.volcano.cluster, 'volcano_icl');
  assert.equal(config.voice.volcano.asrResourceId, 'volc.seedasr.sauc.duration');
  assert.equal(config.vision.enabled, false);
  assert.equal(config.vision.proactiveIntervalSeconds, 75);
  assert.equal(config.stage.expressionLabels.wink, '眨眼');
  assert.equal(config.stage.activeExpression, 'normal');
  assert.deepEqual(Object.keys(config.stage.expressions), ['normal', 'wink', 'angry', 'confused', 'observe', 'speechless']);
  const privateNickname = String.fromCodePoint(22235, 20998, 20043, 19968, 39640, 25163);
  assert.equal(JSON.stringify(config).includes(privateNickname), false);
});

test('config is normalized and memory is bounded', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  await store.saveConfig({ ...store.getConfig(), memory: { enabled: true, maxMessages: 4, notes: 'local note' } });
  for (let index = 0; index < 8; index += 1) await store.appendMessage({ role: index % 2 ? 'assistant' : 'user', content: `message ${index}` });
  assert.equal(store.getMessages().length, 4);
  assert.equal(store.getMessages().at(-1).content, 'message 7');
});

test('expressions can be added and removed without a fixed six-item schema', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-expressions-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new LocalStore(dir).init();
  const input = store.getConfig();
  input.stage.expressions = { normal: '/normal.png', sleepy: '/sleepy.png' };
  input.stage.expressionLabels = { normal: '平静', sleepy: '困困' };
  input.stage.activeExpression = 'sleepy';
  const config = await store.saveConfig(input);
  assert.deepEqual(Object.keys(config.stage.expressions), ['normal', 'sleepy']);
  assert.equal(config.stage.expressionLabels.sleepy, '困困');
  assert.equal(config.stage.activeExpression, 'sleepy');
});
