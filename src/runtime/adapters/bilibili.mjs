import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export class BilibiliAdapter {
  constructor() {
    this.client = null;
    this.status = { connected: false, roomId: '', error: '' };
  }

  async connect(roomId, handlers = {}) {
    this.disconnect();
    if (!/^\d+$/.test(String(roomId))) throw new Error('请输入正确的 B 站直播间号');
    const { KeepLiveWS } = require('bilibili-live-ws');
    const client = new KeepLiveWS(Number(roomId));
    this.client = client;
    this.status = { connected: false, roomId: String(roomId), error: '' };
    client.on('live', () => {
      this.status.connected = true;
      handlers.onStatus?.(this.getStatus());
    });
    client.on('DANMU_MSG', (event) => {
      const content = String(event?.info?.[1] || '').trim();
      const user = String(event?.info?.[2]?.[1] || '观众').trim();
      if (content) handlers.onMessage?.({ user, content });
    });
    client.on('error', (error) => {
      this.status.error = String(error?.message || '连接失败').slice(0, 160);
      handlers.onStatus?.(this.getStatus());
    });
    client.on('close', () => {
      this.status.connected = false;
      handlers.onStatus?.(this.getStatus());
    });
    return this.getStatus();
  }

  disconnect() {
    try { this.client?.close(); } catch {}
    this.client = null;
    this.status = { connected: false, roomId: '', error: '' };
  }

  getStatus() {
    return { ...this.status };
  }
}
