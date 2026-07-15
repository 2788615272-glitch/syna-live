import { gzipSync, gunzipSync } from 'node:zlib';
import crypto from 'node:crypto';
import WebSocket from 'ws';

function frameHeader(type, flags, serialization, compression) {
  return Buffer.from([0x11, (type << 4) | flags, (serialization << 4) | compression, 0]);
}

function framed(type, flags, serialization, payload) {
  const compressed = gzipSync(payload);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(compressed.length);
  return Buffer.concat([frameHeader(type, flags, serialization, 1), size, compressed]);
}

function parsePayload(message) {
  const data = Buffer.from(message);
  if (data.length < 12) return {};
  const size = data.readUInt32BE(8);
  let payload = data.subarray(12, 12 + size);
  if ((data[2] & 0x0f) === 1) payload = gunzipSync(payload);
  try { return JSON.parse(payload.toString('utf8')); } catch { return {}; }
}

export class VolcengineAudioAdapter {
  constructor({ fetchImpl = globalThis.fetch, WebSocketImpl = WebSocket } = {}) {
    this.fetch = fetchImpl;
    this.WebSocket = WebSocketImpl;
  }

  async synthesize({ appId, accessToken, cluster = 'volcano_icl', voiceId, speed = 1, input }) {
    if (!appId || !accessToken || !voiceId) throw new Error('请填写火山 AppID、Access Token 和音色 ID');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetch('https://openspeech.bytedance.com/api/v1/tts', {
        method: 'POST',
        headers: { Authorization: `Bearer;${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: { appid: appId, token: accessToken, cluster },
          user: { uid: 'syna_live' },
          audio: { voice_type: voiceId, encoding: 'wav', speed_ratio: Number(speed) || 1 },
          request: { reqid: crypto.randomUUID(), text: input, text_type: 'plain', operation: 'query' }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.code === 3000 && payload.data) return { data: payload.data, mimeType: 'audio/wav' };
      const transientGrantError = String(payload.message || '').includes('load grant requested grant not found in SaaS storage');
      if (attempt === 0 && transientGrantError) { await new Promise((resolve) => setTimeout(resolve, 300)); continue; }
      throw new Error(`火山 TTS 失败${payload.message ? `：${payload.message}` : ` (${response.status})`}`);
    }
    throw new Error('火山 TTS 失败');
  }

  transcribe({ appId, accessToken, resourceId = 'volc.seedasr.sauc.duration', audio }) {
    if (!appId || !accessToken) return Promise.reject(new Error('请填写火山 AppID 和 Access Token'));
    return new Promise((resolve, reject) => {
      const socket = new this.WebSocket('wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async', {
        headers: {
          'X-Api-App-Key': appId,
          'X-Api-Access-Key': accessToken,
          'X-Api-Resource-Id': resourceId,
          'X-Api-Request-Id': crypto.randomUUID(),
          'X-Api-Sequence': '-1'
        }
      });
      let partial = '';
      let settled = false;
      const timeout = setTimeout(() => { socket.terminate(); reject(new Error('火山 ASR 响应超时')); }, 12000);
      const finish = (error, text = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (socket.readyState === this.WebSocket.OPEN) socket.close();
        if (error) reject(error); else resolve(text.trim());
      };
      socket.once('error', (error) => finish(new Error(`火山 ASR 连接失败：${error.message}`)));
      socket.once('open', () => {
        const config = Buffer.from(JSON.stringify({
          user: { uid: 'syna_live' },
          audio: { format: 'wav', codec: 'pcm', rate: 16000, bits: 16, channel: 1 },
          request: { model_name: 'bigmodel', enable_itn: true, result_type: 'full' }
        }));
        socket.send(framed(1, 0, 1, config));
        const bytes = Buffer.from(audio);
        for (let offset = 0; offset < bytes.length; offset += 16384) {
          const chunk = bytes.subarray(offset, offset + 16384);
          const last = offset + 16384 >= bytes.length;
          socket.send(framed(2, last ? 2 : 0, 0, chunk));
        }
      });
      socket.on('message', (message) => {
        const data = Buffer.from(message);
        if (data.length < 4) return;
        const type = data[1] >> 4;
        const flags = data[1] & 0x0f;
        const payload = parsePayload(data);
        if (type === 15) return finish(new Error(`火山 ASR 失败：${payload.message || payload.error || '未知错误'}`));
        if (type !== 9) return;
        const text = payload?.result?.text || '';
        if (text) partial = text;
        if (flags === 3) finish(null, text || partial);
      });
      socket.once('close', () => { if (partial) finish(null, partial); });
    });
  }
}
