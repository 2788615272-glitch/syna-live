import test from 'node:test';
import assert from 'node:assert/strict';
import { BilibiliAdapter } from '../src/runtime/adapters/bilibili.mjs';

test('Bilibili adapter waits for authenticated room connection', async (t) => {
  let client;
  const adapter = new BilibiliAdapter({
    createConnection: async (roomId) => {
      client = new EventTarget();
      client.close = () => {};
      setTimeout(() => client.dispatchEvent(new Event('CONNECT_SUCCESS')), 0);
      return { client, roomId: String(roomId), liveStatus: 0, title: '测试直播间' };
    }
  });
  t.after(() => adapter.disconnect());
  const status = await adapter.connect('6782529');
  assert.equal(status.connected, true);
  assert.equal(status.liveStatus, 0);
  assert.equal(status.title, '测试直播间');
});
