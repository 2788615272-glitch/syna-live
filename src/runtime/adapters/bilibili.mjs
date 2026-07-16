import WebSocket from 'ws';
import { BilibiliApiClient, LiveWS, parseLiveConfig } from 'bilibili-live-danmaku';

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

function cookieValue(cookie, name) {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(String(cookie || ''))?.[1] || '';
}

async function createBilibiliConnection(roomId) {
  const api = new BilibiliApiClient();
  await api.initCookie();
  const room = (await api.liveRoomInit({ id: Number(roomId) })).data;
  const actualRoomId = Number(room.room_id || roomId);
  const danmu = (await api.xliveGetDanmuInfo({ id: actualRoomId })).data;
  const client = new LiveWS(actualRoomId, {
    ...parseLiveConfig(danmu),
    buvid: cookieValue(api.cookie, 'buvid3')
  });
  return {
    client,
    roomId: String(actualRoomId),
    liveStatus: Number(room.live_status) || 0,
    title: ''
  };
}

function waitForConnection(client, timeoutMs = 12000) {
  if (client.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('弹幕服务器连接超时')), timeoutMs);
    const connected = () => finish();
    const failed = (event) => finish(new Error(event?.error?.message || '弹幕服务器连接失败'));
    const closed = () => finish(new Error('弹幕服务器在认证前断开'));
    const finish = (error) => {
      clearTimeout(timeout);
      client.removeEventListener('CONNECT_SUCCESS', connected);
      client.removeEventListener('error', failed);
      client.removeEventListener('close', closed);
      error ? reject(error) : resolve();
    };
    client.addEventListener('CONNECT_SUCCESS', connected);
    client.addEventListener('error', failed);
    client.addEventListener('close', closed);
  });
}

export class BilibiliAdapter {
  constructor({ createConnection = createBilibiliConnection } = {}) {
    this.createConnection = createConnection;
    this.client = null;
    this.manualClose = false;
    this.status = { connected: false, connecting: false, roomId: '', liveStatus: 0, title: '', error: '' };
  }

  async connect(roomId, handlers = {}) {
    this.disconnect();
    if (!/^\d+$/.test(String(roomId))) throw new Error('请输入正确的 B 站直播间号');
    this.manualClose = false;
    this.status = { connected: false, connecting: true, roomId: String(roomId), liveStatus: 0, title: '', error: '' };
    handlers.onStatus?.(this.getStatus());
    try {
      const connection = await this.createConnection(roomId);
      const client = connection.client;
      this.client = client;
      this.status = { ...this.status, roomId: connection.roomId, liveStatus: connection.liveStatus, title: connection.title || '' };
      client.addEventListener('DANMU_MSG', (event) => {
        const payload = event?.data || {};
        const content = String(payload?.info?.[1] || '').trim();
        const user = String(payload?.info?.[2]?.[1] || '观众').trim();
        if (content) handlers.onMessage?.({ user, content });
      });
      client.addEventListener('error', (event) => {
        this.status.error = String(event?.error?.message || '弹幕连接异常').slice(0, 160);
        handlers.onStatus?.(this.getStatus());
      });
      client.addEventListener('close', () => {
        this.status.connected = false;
        this.status.connecting = false;
        if (!this.manualClose && !this.status.error) this.status.error = '弹幕连接已断开，请重新连接';
        handlers.onStatus?.(this.getStatus());
      });
      await waitForConnection(client);
      this.status.connected = true;
      this.status.connecting = false;
      this.status.error = '';
      handlers.onStatus?.(this.getStatus());
      return this.getStatus();
    } catch (error) {
      try { this.client?.close(); } catch {}
      this.client = null;
      this.status.connected = false;
      this.status.connecting = false;
      this.status.error = String(error?.message || 'B站弹幕连接失败').slice(0, 160);
      handlers.onStatus?.(this.getStatus());
      throw new Error(this.status.error);
    }
  }

  disconnect() {
    this.manualClose = true;
    try { this.client?.close(); } catch {}
    this.client = null;
    this.status = { connected: false, connecting: false, roomId: '', liveStatus: 0, title: '', error: '' };
  }

  getStatus() {
    return { ...this.status };
  }
}
