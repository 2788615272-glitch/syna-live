import { createSpeechInput } from './speech-input.js';

const token = new URLSearchParams(location.search).get('token') || '';
const $ = (id) => document.getElementById(id);
const root = $('companion');
let config;
let busy = false;
let mode = 'text';
let speechInput;
let currentVoiceAudio;
let lastAvatar = '';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || '请求失败');
  return payload;
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

function stopRecognition() {
  speechInput?.stop();
}

function scheduleAutoListen() {
  const voiceBusy = ('speechSynthesis' in window && speechSynthesis.speaking) || (currentVoiceAudio && !currentVoiceAudio.paused && !currentVoiceAudio.ended);
  if (mode !== 'auto' || busy || voiceBusy) return;
  setTimeout(() => startRecognition(), 450);
}

function startRecognition() {
  if (!speechInput || speechInput.active || busy) return;
  speechInput.start({ continuous: mode === 'auto', language: config.voice.language }).catch((error) => setStatus(error.message));
}

async function speak(text) {
  if (!config.voice.enabled) { scheduleAutoListen(); return; }
  stopRecognition();
  if (config.voice.outputMode === 'api') {
    const payload = await api('/api/tts/synthesize', { method: 'POST', body: JSON.stringify({ text: text.replace(/^\[[^\]]+\]\s*/, '') }) });
    currentVoiceAudio?.pause();
    currentVoiceAudio = new Audio(payload.dataUrl);
    currentVoiceAudio.onended = currentVoiceAudio.onerror = async () => {
      await api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) }).catch(() => {});
      scheduleAutoListen();
    };
    await currentVoiceAudio.play();
    return;
  }
  if (!('speechSynthesis' in window)) { scheduleAutoListen(); return; }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/^\[[^\]]+\]\s*/, ''));
  utterance.lang = config.voice.language;
  utterance.rate = config.voice.rate;
  utterance.pitch = config.voice.pitch;
  utterance.onend = utterance.onerror = async () => {
    await api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) }).catch(() => {});
    scheduleAutoListen();
  };
  speechSynthesis.speak(utterance);
}

async function sendMessage(message) {
  const content = String(message || '').trim();
  if (!content || busy) return;
  busy = true;
  stopRecognition();
  $('reply').textContent = '正在想……';
  try {
    const payload = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: content }) });
    $('reply').textContent = payload.message.content;
    await speak(payload.message.content);
  } catch (error) {
    $('reply').textContent = error.message;
  } finally {
    busy = false;
    scheduleAutoListen();
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

speechInput = createSpeechInput({ api, getMode: () => config?.voice?.asrMode || 'browser', onText: sendMessage, onStatus: setStatus });

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('talkBtn').addEventListener('click', () => speechInput.active ? stopRecognition() : startRecognition());
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
    if (!busy && payload.state.subtitle) $('reply').textContent = payload.state.subtitle;
  } catch {}
}

async function load() {
  const payload = await api('/api/bootstrap');
  config = payload.config;
  $('characterName').textContent = config.character.name;
  const lastMessage = payload.messages.filter((message) => message.role === 'assistant').at(-1);
  if (lastMessage) $('reply').textContent = lastMessage.content;
  setMode('text');
  await refreshStage();
  setInterval(refreshStage, 400);
}

load().catch((error) => { $('reply').textContent = error.message; });
