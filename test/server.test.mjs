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
    values: { providerApiKey: secret },
    has(name) { return Boolean(this.values[name]); },
    get(name) { return this.values[name] || ''; },
    async set(name, value) { this.values[name] = value; }
  };
  const server = await startLocalServer({ dataDir: dir, vault });
  t.after(async () => { await server.close(); await rm(dir, { recursive: true, force: true }); });
  const unauthorized = await fetch(`http://127.0.0.1:${server.port}/api/bootstrap`);
  assert.equal(unauthorized.status, 401);
  const token = new URL(server.dashboardUrl).searchParams.get('token');
  const headers = { Authorization: `Bearer ${token}` };
  const bootstrap = await fetch(`http://127.0.0.1:${server.port}/api/bootstrap`, { headers }).then((response) => response.json());
  assert.equal(bootstrap.keyConfigured, true);
  assert.equal(JSON.stringify(bootstrap).includes(secret), false);
  assert.equal(JSON.stringify(bootstrap).includes(dir), false);
  const diagnostics = await fetch(`http://127.0.0.1:${server.port}/api/diagnostics`, { headers }).then((response) => response.json());
  assert.equal(JSON.stringify(diagnostics).includes(secret), false);
  assert.equal(JSON.stringify(diagnostics).includes(dir), false);
});
