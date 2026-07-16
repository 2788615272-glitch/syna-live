import { createSpeechInput } from './speech-input.js';

const token = new URLSearchParams(location.search).get('token') || '';
const $ = (id) => document.getElementById(id);
const root = $('companion');
let config;
let busy = false;
let modelStreaming = false;
let mode = 'text';
let speechInput;
let currentVoiceAudio;
let lastAvatar = '';
let speechPlayback = Promise.resolve();
let speechGeneration = 0;
let cancelCurrentSpeech;
let pendingSpeechMessage = '';
let messages = [];
let messageSignature = '';
const speechOwner = `companion-${crypto.randomUUID()}`;
let globalSpeechGeneration = 0;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || '请求失败');
  return payload;
}

async function* streamApi(path, payload) {
  const response = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok || !response.body) throw new Error(`流式请求失败 (${response.status})`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? '' : lines.pop() || '';
    for (const line of lines) if (line.trim()) yield JSON.parse(line);
    if (done) break;
  }
}

function setStatus(text) {
  $('listenStatus').textContent = text;
  const recording = /录音|聆听|开始说话/.test(text);
  $('talkBtn').classList.toggle('listening', recording);
  $('talkBtn').textContent = recording ? '正在录音，点击停止识别' : '点击开始识别';
}

function setAvatar(stage, stageState) {
  const expression = stageState.expression || stage.activeExpression || 'normal';
  const expressionAvatar = stage.expressions?.[expression] || stage.avatar;
  const source = stageState.speaking && stage.talkingAvatar ? stage.talkingAvatar : expressionAvatar;
  if (source && source !== lastAvatar) { $('avatar').src = source; lastAvatar = source; }
  root.classList.toggle('speaking', Boolean(stageState.speaking));
}

function renderConversation() {
  const container = $('conversation');
  container.replaceChildren(...messages.slice(-20).map((message) => {
    const item = document.createElement('article');
    item.className = `conversation-message ${message.role}`;
    const meta = document.createElement('div');
    meta.className = 'conversation-meta';
    meta.textContent = message.role === 'assistant' ? config.character.name : config.character.userName;
    const bubble = document.createElement('div');
    bubble.className = 'conversation-bubble';
    bubble.textContent = message.content;
    item.append(meta, bubble);
    return item;
  }));
  container.scrollTop = container.scrollHeight;
}

async function refreshMessages() {
  const payload = await api('/api/messages');
  const signature = payload.messages.map(({ id }) => id).join('|');
  if (signature === messageSignature) return;
  messageSignature = signature;
  messages = payload.messages;
  renderConversation();
}

function stopRecognition() {
  speechInput?.stop();
}

function scheduleAutoListen() {
  const voiceBusy = ('speechSynthesis' in window && speechSynthesis.speaking) || (currentVoiceAudio && !currentVoiceAudio.paused && !currentVoiceAudio.ended);
  if (mode !== 'auto' || busy || voiceBusy) return;
  setTimeout(() => startRecognition(), 450);
}

function startRecognition(manual = false) {
  if (!speechInput || speechInput.active || (!manual && modelStreaming)) return;
  speechInput.start({ continuous: mode === 'auto', language: config.voice.language }).catch((error) => setStatus(error.message));
}

function interruptSpeech() {
  claimGlobalSpeech().catch(() => {});
  interruptLocalSpeech();
}

function interruptLocalSpeech() {
  speechGeneration += 1;
  cancelCurrentSpeech?.();
  currentVoiceAudio?.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) }).catch(() => {});
}

async function claimGlobalSpeech() {
  const payload = await api('/api/speech/claim', { method: 'POST', body: JSON.stringify({ owner: speechOwner }) });
  globalSpeechGeneration = payload.control.generation;
  return globalSpeechGeneration;
}

async function syncSpeechControl() {
  const payload = await api('/api/speech/control');
  if (payload.control.generation <= globalSpeechGeneration) return;
  globalSpeechGeneration = payload.control.generation;
  if (payload.control.owner !== speechOwner) interruptLocalSpeech();
}

function queueSpeech(text, generation = speechGeneration) {
  speechPlayback = speechPlayback.catch(() => {}).then(() => generation === speechGeneration ? speak(text, generation) : undefined).catch((error) => setStatus(error.message));
}

async function speak(text, generation = speechGeneration) {
  if (generation !== speechGeneration) return;
  if (!config.voice.enabled) { scheduleAutoListen(); return; }
  stopRecognition();
  if (config.voice.outputMode !== 'system') {
    const payload = await api('/api/tts/synthesize', { method: 'POST', body: JSON.stringify({ text: text.replace(/^\[[^\]]+\]\s*/, '') }) });
    if (generation !== speechGeneration) return;
    const audio = new Audio(payload.dataUrl);
    currentVoiceAudio = audio;
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };
      cancelCurrentSpeech = () => { audio.pause(); finish(); };
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error('语音音频播放失败'));
      audio.play().catch(finish);
    }).finally(() => {
      if (currentVoiceAudio === audio) currentVoiceAudio = undefined;
      cancelCurrentSpeech = undefined;
    });
    await api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) }).catch(() => {});
    return;
  }
  if (!('speechSynthesis' in window)) { scheduleAutoListen(); return; }
  if (generation !== speechGeneration) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/^\[[^\]]+\]\s*/, ''));
  utterance.lang = config.voice.language;
  utterance.rate = config.voice.rate;
  utterance.pitch = config.voice.pitch;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    cancelCurrentSpeech = () => { speechSynthesis.cancel(); finish(); };
    utterance.onend = utterance.onerror = finish;
    speechSynthesis.speak(utterance);
  });
  cancelCurrentSpeech = undefined;
  await api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) }).catch(() => {});
}

async function sendMessage(message) {
  const content = String(message || '').trim();
  if (!content) return;
  if (busy) { pendingSpeechMessage = content; interruptSpeech(); return; }
  interruptSpeech();
  const replySpeechGeneration = speechGeneration;
  busy = true;
  modelStreaming = true;
  stopRecognition();
  $('reply').textContent = '';
  try {
    for await (const event of streamApi('/api/chat/stream', { message: content })) {
      if (event.type === 'error') throw new Error(event.error);
      if (event.type === 'token') $('reply').textContent += event.text;
      if (event.type === 'speech') queueSpeech(event.text, replySpeechGeneration);
      if (event.type === 'expression') setAvatar(config.stage, { expression: event.expression, speaking: true });
    }
    modelStreaming = false;
    await refreshMessages();
    $('reply').textContent = '';
    await speechPlayback;
  } catch (error) {
    $('reply').textContent = error.message;
  } finally {
    modelStreaming = false;
    busy = false;
    if (pendingSpeechMessage) {
      const nextMessage = pendingSpeechMessage;
      pendingSpeechMessage = '';
      setTimeout(() => sendMessage(nextMessage), 0);
    } else scheduleAutoListen();
  }
}

function setMode(nextMode) {
  stopRecognition();
  mode = nextMode;
  root.dataset.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  if (mode === 'text') setStatus('键盘输入模式');
  if (mode === 'manual') setStatus('点击按钮后录制并识别一句话');
  if (mode === 'auto') {
    setStatus('自动聆听已开启，可随时说话');
    scheduleAutoListen();
  }
}

speechInput = createSpeechInput({
  api,
  getMode: () => config?.voice?.asrMode || 'browser',
  onText: (text) => { interruptSpeech(); sendMessage(text); },
  onStatus: setStatus
});

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('talkBtn').addEventListener('click', () => {
  if (speechInput.active) stopRecognition();
  else { interruptSpeech(); startRecognition(true); }
});
$('chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const message = $('chatInput').value;
  $('chatInput').value = '';
  sendMessage(message);
});
$('chatInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('chatForm').requestSubmit(); }
});
$('hideBtn').addEventListener('click', () => api('/api/companion/hide', { method: 'POST', body: '{}' }).catch(() => {}));

async function refreshStage() {
  try {
    const payload = await api('/api/stage/state');
    setAvatar(payload.stage, payload.state);
  } catch {}
}

async function load() {
  const payload = await api('/api/bootstrap');
  config = payload.config;
  messages = payload.messages;
  messageSignature = messages.map(({ id }) => id).join('|');
  $('characterName').textContent = config.character.name;
  renderConversation();
  setMode('text');
  await refreshStage();
  setInterval(refreshStage, 400);
  setInterval(() => refreshMessages().catch(() => {}), 1000);
  setInterval(() => syncSpeechControl().catch(() => {}), 250);
}

load().catch((error) => { $('reply').textContent = error.message; });
