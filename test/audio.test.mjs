import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIAudioAdapter } from '../src/runtime/adapters/openai-audio.mjs';

test('ASR adapter sends a real audio file to an OpenAI-compatible endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ text: '你好 Syna' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const text = await new OpenAIAudioAdapter().transcribe({ baseUrl: 'https://voice.example/v1', model: 'whisper-1', apiKey: 'asr-key', audio: Buffer.from('audio'), language: 'zh' });
  assert.equal(text, '你好 Syna');
  assert.equal(request.url, 'https://voice.example/v1/audio/transcriptions');
  assert.equal(request.options.headers.Authorization, 'Bearer asr-key');
  assert.equal(request.options.body.get('model'), 'whisper-1');
});

test('TTS adapter returns encoded audio from an OpenAI-compatible endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(Buffer.from('mp3-data'), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  t.after(() => { globalThis.fetch = originalFetch; });
  const result = await new OpenAIAudioAdapter().synthesize({ baseUrl: 'https://voice.example/v1', model: 'tts-1', apiKey: 'tts-key', voice: 'alloy', input: '你好' });
  assert.equal(result.mimeType, 'audio/mpeg');
  assert.equal(Buffer.from(result.data, 'base64').toString(), 'mp3-data');
});
