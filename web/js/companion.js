const token = new URLSearchParams(location.search).get('token') || '';
const $ = (id) => document.getElementById(id);
const root = $('companion');
let config;
let busy = false;
let mode = 'text';
let recognition;
let listening = false;
let restartTimer;
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

function setStatus(text) { $('listenStatus').textContent = text; }

function setAvatar(stage, stageState) {
  const expression = stageState.expression || stage.activeExpression || 'normal';
  const expressionAvatar = stage.expressions?.[expression] || stage.avatar;
  const source = stageState.speaking && stage.talkingAvatar ? stage.talkingAvatar : expressionAvatar;
  if (source && source !== lastAvatar) { $('avatar').src = source; lastAvatar = source; }
  root.classList.toggle('speaking', Boolean(stageState.speaking));
}

function stopRecognition() {
  clearTimeout(restartTimer);
  if (recognition && listening) recognition.stop();
}

function scheduleAutoListen() {
  if (mode !== 'auto' || busy || speechSynthesis.speaking) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => startRecognition(), 450);
}

function startRecognition() {
  if (!recognition || listening || busy) return;
  try { recognition.continuous = mode === 'auto'; recognition.start(); }
  catch { scheduleAutoListen(); }
}

async function speak(text) {
  if (!config.voice.enabled || !('speechSynthesis' in window)) { scheduleAutoListen(); return; }
  stopRecognition();
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
    if (!speechSynthesis.speaking) scheduleAutoListen();
  }
}

function setMode(nextMode) {
  stopRecognition();
  mode = nextMode;
  root.dataset.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  if (mode === 'text') setStatus('键盘输入模式');
  if (mode === 'manual') setStatus(recognition ? '点击按钮后识别一句话' : '当前环境不支持语音识别');
  if (mode === 'auto') {
    setStatus(recognition ? '自动聆听已开启，可随时说话' : '当前环境不支持语音识别');
    scheduleAutoListen();
  }
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.onstart = () => {
    listening = true;
    $('talkBtn').classList.add('listening');
    $('talkBtn').textContent = '正在识别，点击停止';
    setStatus(mode === 'auto' ? '正在自动聆听…' : '请开始说话…');
  };
  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalText += text;
      else interimText += text;
    }
    if (interimText) setStatus(`识别中：${interimText}`);
    if (finalText) sendMessage(finalText);
  };
  recognition.onerror = (event) => {
    if (!['no-speech', 'aborted'].includes(event.error)) setStatus(`语音识别不可用：${event.error}`);
  };
  recognition.onend = () => {
    listening = false;
    $('talkBtn').classList.remove('listening');
    $('talkBtn').textContent = '点击开始识别';
    scheduleAutoListen();
  };
}

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('talkBtn').addEventListener('click', () => listening ? stopRecognition() : startRecognition());
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
