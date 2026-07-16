import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startLocalServer } from '../src/server/local-server.mjs';

test('local server protects data and diagnostics are redacted', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-server-'));
  const secret = 'not-a-real-secret-value';
  const vault = {
    values: { providerApiKey: secret, asrApiKey: 'private-asr-key', ttsApiKey: 'private-tts-key', volcAccessToken: 'private-volc-token' },
    has(name) { return Boolean(this.values[name]); },
    get(name) { return this.values[name] || ''; },
    async set(name, value) { this.values[name] = value; }
  };
  const server = await startLocalServer({ dataDir: dir, vault });
  t.after(async () => { await server.close(); await rm(dir, { recursive: true, force: true }); });
  const unauthorized = await fetch(`http://127.0.0.1:${server.port}/api/bootstrap`);
  assert.equal(unauthorized.status, 401);
  const dashboard = await fetch(`http://127.0.0.1:${server.port}/`);
  assert.match(dashboard.headers.get('content-security-policy') || '', /media-src[^;]*data:/);
  const token = new URL(server.dashboardUrl).searchParams.get('token');
  const headers = { Authorization: `Bearer ${token}` };
  const bootstrap = await fetch(`http://127.0.0.1:${server.port}/api/bootstrap`, { headers }).then((response) => response.json());
  assert.equal(bootstrap.keyConfigured, true);
  assert.equal(JSON.stringify(bootstrap).includes(secret), false);
  assert.equal(JSON.stringify(bootstrap).includes('private-asr-key'), false);
  assert.equal(JSON.stringify(bootstrap).includes('private-tts-key'), false);
  assert.equal(JSON.stringify(bootstrap).includes('private-volc-token'), false);
  assert.equal(JSON.stringify(bootstrap).includes(dir), false);
  assert.equal(JSON.stringify(bootstrap).includes('providerApiKey'), false);
  assert.equal(JSON.stringify(bootstrap).includes('volcAccessToken'), false);
  assert.equal(JSON.stringify(bootstrap).includes('SESSDATA'), false);
  assert.equal(JSON.stringify(bootstrap).includes('bili_jct'), false);
  const diagnostics = await fetch(`http://127.0.0.1:${server.port}/api/diagnostics`, { headers }).then((response) => response.json());
  assert.equal(JSON.stringify(diagnostics).includes(secret), false);
  assert.equal(JSON.stringify(diagnostics).includes(dir), false);
  const speechControlUnauthorized = await fetch(`http://127.0.0.1:${server.port}/api/speech/control`);
  assert.equal(speechControlUnauthorized.status, 401);
  const claimed = await fetch(`http://127.0.0.1:${server.port}/api/speech/claim`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'privacy-test' })
  }).then((response) => response.json());
  assert.equal(claimed.control.owner, 'privacy-test');
});

test('desktop companion command stays behind the local session token', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'syna-companion-'));
  const commands = [];
  const vault = { has() { return false; }, get() { return ''; }, async set() {} };
  const server = await startLocalServer({ dataDir: dir, vault, onCompanionCommand: (command) => commands.push(command) });
  t.after(async () => { await server.close(); await rm(dir, { recursive: true, force: true }); });
  const unauthorized = await fetch(`http://127.0.0.1:${server.port}/api/companion/show`, { method: 'POST' });
  assert.equal(unauthorized.status, 401);
  const token = new URL(server.companionUrl).searchParams.get('token');
  const response = await fetch(`http://127.0.0.1:${server.port}/api/companion/show`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(commands, ['show']);
});
