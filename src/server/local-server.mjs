import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { LocalStore } from '../runtime/store.mjs';
import { CompanionRuntime } from '../runtime/companion-runtime.mjs';
import { OpenAICompatibleAdapter } from '../runtime/adapters/openai-compatible.mjs';
import { OpenAIAudioAdapter } from '../runtime/adapters/openai-audio.mjs';
import { VolcengineAudioAdapter } from '../runtime/adapters/volcengine-audio.mjs';
import { BilibiliAdapter } from '../runtime/adapters/bilibili.mjs';
import { providerList } from '../shared/providers.mjs';

const webDir = fileURLToPath(new URL('../../web/', import.meta.url));
const lucideFile = fileURLToPath(new URL('../../node_modules/lucide/dist/umd/lucide.js', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8'
};

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req, maxBytes = 10 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('上传内容过大');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求内容不是有效 JSON');
  }
}

function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'self'");
}

function errorMessage(error) {
  return String(error?.message || '操作失败').replace(/[\r\n]+/g, ' ').slice(0, 300);
}

function safeStatic(base, requestPath) {
  const decoded = decodeURIComponent(requestPath).replace(/^\/+/, '');
  const file = path.resolve(base, decoded);
  return file === base || file.startsWith(`${path.resolve(base)}${path.sep}`) ? file : null;
}

async function serveFile(res, file) {
  try {
    const data = await readFile(file);
    const extension = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': ['.html', '.js', '.css'].includes(extension) ? 'no-store' : 'public, max-age=3600'
    });
    res.end(data);
  } catch {
    json(res, 404, { ok: false, error: 'Not found' });
  }
}

function publicConfig(config) {
  return structuredClone(config);
}

export async function startLocalServer({ dataDir, vault, port = 0, onCompanionCommand = () => {} }) {
  const store = await new LocalStore(dataDir).init();
  const runtime = new CompanionRuntime({
    store,
    vault,
    modelAdapter: new OpenAICompatibleAdapter(),
    liveAdapter: new BilibiliAdapter()
  });
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const stageToken = crypto.randomBytes(24).toString('base64url');

  const server = http.createServer(async (req, res) => {
    headers(res);
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname;
    const authorized = req.headers.authorization === `Bearer ${sessionToken}`;
    const stageAuthorized = authorized || url.searchParams.get('stageToken') === stageToken;

    try {
      if (pathname.startsWith('/api/') && !authorized && !(pathname === '/api/stage/state' && stageAuthorized)) {
        return json(res, 401, { ok: false, error: 'Unauthorized' });
      }

      if (req.method === 'GET' && pathname === '/api/bootstrap') {
        const address = server.address();
        return json(res, 200, {
          ok: true,
          config: publicConfig(store.getConfig()),
          providers: providerList(),
          keyConfigured: vault.has('providerApiKey'),
          voiceKeys: { asr: vault.has('asrApiKey'), tts: vault.has('ttsApiKey'), volcano: vault.has('volcAccessToken') },
          status: runtime.status(),
          messages: store.getMessages(),
          stageUrl: `http://127.0.0.1:${address.port}/stage?stageToken=${stageToken}`,
          version: '0.5.0'
        });
      }

      if (req.method === 'PUT' && pathname === '/api/config') {
        const input = await body(req);
        const current = store.getConfig();
        const next = await store.saveConfig({ ...current, ...input, character: { ...current.character, ...input.character }, provider: { ...current.provider, ...input.provider }, voice: { ...current.voice, ...input.voice }, stage: { ...current.stage, ...input.stage }, memory: { ...current.memory, ...input.memory }, vision: { ...current.vision, ...input.vision }, live: { ...current.live, ...input.live } });
        return json(res, 200, { ok: true, config: publicConfig(next) });
      }

      if (req.method === 'POST' && pathname === '/api/secrets/provider') {
        const input = await body(req, 16 * 1024);
        await vault.set('providerApiKey', input.apiKey);
        return json(res, 200, { ok: true, keyConfigured: vault.has('providerApiKey') });
      }

      if (req.method === 'DELETE' && pathname === '/api/secrets/provider') {
        await vault.set('providerApiKey', '');
        return json(res, 200, { ok: true, keyConfigured: false });
      }

      if (req.method === 'POST' && ['/api/secrets/asr', '/api/secrets/tts', '/api/secrets/volcano'].includes(pathname)) {
        const input = await body(req, 16 * 1024);
        const name = pathname.endsWith('/asr') ? 'asrApiKey' : pathname.endsWith('/tts') ? 'ttsApiKey' : 'volcAccessToken';
        await vault.set(name, input.apiKey);
        return json(res, 200, { ok: true, configured: vault.has(name) });
      }

      if (req.method === 'DELETE' && ['/api/secrets/asr', '/api/secrets/tts', '/api/secrets/volcano'].includes(pathname)) {
        const name = pathname.endsWith('/asr') ? 'asrApiKey' : pathname.endsWith('/tts') ? 'ttsApiKey' : 'volcAccessToken';
        await vault.set(name, '');
        return json(res, 200, { ok: true, configured: false });
      }

      if (req.method === 'POST' && pathname === '/api/provider/test') {
        const config = store.getConfig();
        const adapter = new OpenAICompatibleAdapter();
        await adapter.complete({ ...config.provider, apiKey: vault.get('providerApiKey'), temperature: 0, messages: [{ role: 'user', content: '只回复 OK' }] });
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && pathname === '/api/asr/transcribe') {
        const input = await body(req, 24 * 1024 * 1024);
        const match = /^data:(audio\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(input.dataUrl || ''));
        if (!match) throw new Error('录音格式无效');
        const audio = Buffer.from(match[2], 'base64');
        if (!audio.length || audio.length > 16 * 1024 * 1024) throw new Error('单次录音必须小于 16 MB');
        const voice = store.getConfig().voice;
        const text = voice.asrMode === 'volcano'
          ? await new VolcengineAudioAdapter().transcribe({ ...voice.volcano, accessToken: vault.get('volcAccessToken'), resourceId: voice.volcano.asrResourceId, audio })
          : await new OpenAIAudioAdapter().transcribe({ ...voice.asr, apiKey: vault.get('asrApiKey'), audio, mimeType: match[1] });
        return json(res, 200, { ok: true, text });
      }

      if (req.method === 'POST' && pathname === '/api/tts/synthesize') {
        const input = await body(req, 32 * 1024);
        const voice = store.getConfig().voice;
        const audio = voice.outputMode === 'volcano'
          ? await new VolcengineAudioAdapter().synthesize({ ...voice.volcano, accessToken: vault.get('volcAccessToken'), input: String(input.text || '').slice(0, 5000) })
          : await new OpenAIAudioAdapter().synthesize({ ...voice.tts, apiKey: vault.get('ttsApiKey'), input: String(input.text || '').slice(0, 5000) });
        return json(res, 200, { ok: true, dataUrl: `data:${audio.mimeType};base64,${audio.data}` });
      }

      if (req.method === 'POST' && pathname === '/api/vision/analyze') {
        const input = await body(req, 8 * 1024 * 1024);
        const dataUrl = String(input.dataUrl || '');
        if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('视觉截图格式无效');
        const result = await runtime.analyzeVision(dataUrl);
        return json(res, 200, { ok: true, ...result });
      }

      if (req.method === 'POST' && pathname === '/api/chat') {
        const input = await body(req, 64 * 1024);
        const message = await runtime.chat(input.message, 'chat');
        return json(res, 200, { ok: true, message, status: runtime.status() });
      }

      if (req.method === 'POST' && pathname === '/api/chat/stream') {
        const input = await body(req, 64 * 1024);
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        try {
          for await (const event of runtime.chatStream(input.message, input.source || 'chat')) res.write(`${JSON.stringify(event)}\n`);
        } catch (error) {
          res.write(`${JSON.stringify({ type: 'error', error: errorMessage(error) })}\n`);
        }
        res.end();
        return;
      }

      if (req.method === 'POST' && pathname === '/api/companion/show') {
        await onCompanionCommand('show');
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && pathname === '/api/companion/hide') {
        await onCompanionCommand('hide');
        return json(res, 200, { ok: true });
      }

      if (req.method === 'DELETE' && pathname === '/api/memory') {
        await store.clearMemory();
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && pathname === '/api/avatar') {
        const input = await body(req);
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(input.dataUrl || ''));
        if (!match) throw new Error('只支持 PNG、JPEG 或 WebP 图片');
        const data = Buffer.from(match[2], 'base64');
        if (!data.length || data.length > 8 * 1024 * 1024) throw new Error('图片必须小于 8 MB');
        const extension = match[1] === 'image/jpeg' ? '.jpg' : `.${match[1].split('/')[1]}`;
        const filename = `${crypto.randomUUID()}${extension}`;
        await writeFile(path.join(store.uploadDir, filename), data, { mode: 0o600 });
        return json(res, 200, { ok: true, url: `/user-assets/${filename}` });
      }

      if (req.method === 'GET' && pathname === '/api/stage/state') {
        return json(res, 200, { ok: true, state: store.getStageState(), stage: store.getConfig().stage, characterName: store.getConfig().character.name });
      }

      if (req.method === 'POST' && pathname === '/api/stage/speaking') {
        const input = await body(req, 8 * 1024);
        return json(res, 200, { ok: true, state: store.setStageState({ speaking: input.speaking === true }) });
      }

      if (req.method === 'POST' && pathname === '/api/live/connect') {
        return json(res, 200, { ok: true, status: await runtime.connectLive() });
      }

      if (req.method === 'POST' && pathname === '/api/live/disconnect') {
        return json(res, 200, { ok: true, status: runtime.disconnectLive() });
      }

      if (req.method === 'GET' && pathname === '/api/diagnostics') {
        const config = store.getConfig();
        return json(res, 200, {
          ok: true,
          diagnostics: {
            version: '0.5.0',
            platform: process.platform,
            provider: config.provider.id,
            providerConfigured: vault.has('providerApiKey') && Boolean(config.provider.model),
            avatarConfigured: Boolean(config.stage.avatar),
            memoryEnabled: config.memory.enabled,
            live: runtime.status().live
          }
        });
      }

      if (pathname.startsWith('/user-assets/')) {
        const name = path.basename(pathname);
        if (!(await store.hasUpload(name))) return json(res, 404, { ok: false, error: 'Not found' });
        return serveFile(res, path.join(store.uploadDir, name));
      }

      if (pathname === '/vendor/lucide.js') return serveFile(res, lucideFile);
      if (pathname === '/' || pathname === '/index.html') return serveFile(res, path.join(webDir, 'index.html'));
      if (pathname === '/stage') return serveFile(res, path.join(webDir, 'stage.html'));
      if (pathname === '/companion') return serveFile(res, path.join(webDir, 'companion.html'));
      const file = safeStatic(webDir, pathname);
      if (file) return serveFile(res, file);
      return json(res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      return json(res, 400, { ok: false, error: errorMessage(error) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const address = server.address();
  return {
    port: address.port,
    dashboardUrl: `http://127.0.0.1:${address.port}/?token=${sessionToken}`,
    companionUrl: `http://127.0.0.1:${address.port}/companion?token=${sessionToken}`,
    close: () => {
      runtime.disconnectLive();
      return new Promise((resolve) => server.close(resolve));
    }
  };
}
