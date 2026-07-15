import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { gzipSync } from 'node:zlib';
import { VolcengineAudioAdapter } from '../src/runtime/adapters/volcengine-audio.mjs';

test('Volcengine TTS uses the native app, cluster and voice fields', async () => {
  let request;
  const adapter = new VolcengineAudioAdapter({ fetchImpl: async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ code: 3000, data: Buffer.from('wav').toString('base64') }), { status: 200 });
  }});
  const result = await adapter.synthesize({ appId: 'app-id', accessToken: 'token', cluster: 'volcano_icl', voiceId: 'voice-id', speed: 1, input: '你好' });
  assert.equal(request.url, 'https://openspeech.bytedance.com/api/v1/tts');
  assert.equal(request.body.app.appid, 'app-id');
  assert.equal(request.body.audio.voice_type, 'voice-id');
  assert.equal(result.mimeType, 'audio/wav');
});

test('Volcengine ASR sends native websocket headers and returns final text', async () => {
  const responsePayload = gzipSync(Buffer.from(JSON.stringify({ result: { text: '火山识别成功' } })));
  const sequence = Buffer.alloc(4);
  const size = Buffer.alloc(4); size.writeUInt32BE(responsePayload.length);
  const responseFrame = Buffer.concat([Buffer.from([0x11, 0x93, 0x11, 0]), sequence, size, responsePayload]);
  class FakeSocket extends EventEmitter {
    static OPEN = 1;
    constructor(url, options) { super(); this.url = url; this.options = options; this.readyState = 1; FakeSocket.instance = this; queueMicrotask(() => this.emit('open')); }
    send(data) { if ((data[1] & 0x0f) === 2) queueMicrotask(() => this.emit('message', responseFrame)); }
    close() { this.readyState = 3; }
    terminate() { this.readyState = 3; }
  }
  const text = await new VolcengineAudioAdapter({ WebSocketImpl: FakeSocket }).transcribe({ appId: 'app-id', accessToken: 'token', resourceId: 'volc.seedasr.sauc.duration', audio: Buffer.from('wav') });
  assert.equal(text, '火山识别成功');
  assert.equal(FakeSocket.instance.options.headers['X-Api-App-Key'], 'app-id');
  assert.equal(FakeSocket.instance.options.headers['X-Api-Resource-Id'], 'volc.seedasr.sauc.duration');
});
