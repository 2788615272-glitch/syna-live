import { createSpeechInput } from './speech-input.js';

const $ = (id) => document.getElementById(id);
const queryToken = new URLSearchParams(location.search).get('token') || '';
if (queryToken) sessionStorage.setItem('synaSessionToken', queryToken);
const token = queryToken || sessionStorage.getItem('synaSessionToken') || '';

const state = {
  config: null,
  providers: [],
  messages: [],
  stageUrl: '',
  keyConfigured: false,
  voiceKeys: { asr: false, tts: false, volcano: false },
  busy: false
};

const expressionNames = {
  normal: '平静', wink: '眨眼', angry: '生气', confused: '疑惑', observe: '观察', speechless: '无语'
};

const viewMeta = {
  studio: ['陪伴台', '和你的角色实时对话'],
  character: ['角色人设', '塑造名字、关系和说话方式'],
  provider: ['模型连接', '连接兼容的语言模型'],
  voice: ['语音', '本机语音朗读与输入'],
  live: ['直播', '弹幕连接与 OBS 透明舞台'],
  privacy: ['隐私与数据', '管理本地记忆与诊断']
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `请求失败 (${response.status})`);
  return payload;
}

let toastTimer;
let currentVoiceAudio;
function toast(message, error = false) {
  const node = $('toast');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 2600);
}

function setValue(id, value) {
  const node = $(id);
  if (node.type === 'checkbox') node.checked = Boolean(value);
  else node.value = value ?? '';
}

function fillForm() {
  const c = state.config;
  setValue('characterName', c.character.name);
  setValue('userName', c.character.userName);
  setValue('relationship', c.character.relationship);
  setValue('personality', c.character.personality);
  setValue('speakingStyle', c.character.speakingStyle);
  setValue('boundaries', c.character.boundaries);
  setValue('providerId', c.provider.id);
  setValue('providerBaseUrl', c.provider.baseUrl);
  setValue('providerModel', c.provider.model);
  setValue('temperature', c.provider.temperature);
  setValue('voiceEnabled', c.voice.enabled);
  setValue('voiceOutputMode', c.voice.outputMode);
  setValue('voiceLanguage', c.voice.language);
  setValue('voiceRate', c.voice.rate);
  setValue('voicePitch', c.voice.pitch);
  setValue('ttsBaseUrl', c.voice.tts.baseUrl);
  setValue('ttsModel', c.voice.tts.model);
  setValue('ttsVoice', c.voice.tts.voice);
  setValue('ttsFormat', c.voice.tts.format);
  setValue('asrMode', c.voice.asrMode);
  setValue('asrBaseUrl', c.voice.asr.baseUrl);
  setValue('asrModel', c.voice.asr.model);
  setValue('asrLanguage', c.voice.asr.language);
  setValue('volcAppId', c.voice.volcano.appId);
  setValue('volcCluster', c.voice.volcano.cluster);
  setValue('volcVoiceId', c.voice.volcano.voiceId);
  setValue('volcAsrResourceId', c.voice.volcano.asrResourceId);
  setValue('volcSpeed', c.voice.volcano.speed);
  setValue('avatarScale', c.stage.avatarScale);
  setValue('liveRoomId', c.live.roomId);
  setValue('liveAutoReply', c.live.autoReply);
  setValue('subtitleEnabled', c.stage.subtitleEnabled);
  setValue('memoryEnabled', c.memory.enabled);
  setValue('maxMessages', c.memory.maxMessages);
  setValue('memoryNotes', c.memory.notes);
  setValue('stageUrl', state.stageUrl);
  $('temperatureValue').textContent = Number(c.provider.temperature).toFixed(1);
  $('voiceRateValue').textContent = Number(c.voice.rate).toFixed(2);
  $('voicePitchValue').textContent = Number(c.voice.pitch).toFixed(2);
  updateAvatarPreview();
  updateProviderMeta();
  updateVoiceMeta();
  updateStatus();
}

function collectConfig() {
  const c = state.config;
  return {
    character: {
      name: $('characterName').value,
      userName: $('userName').value,
      relationship: $('relationship').value,
      personality: $('personality').value,
      speakingStyle: $('speakingStyle').value,
      boundaries: $('boundaries').value
    },
    provider: {
      id: $('providerId').value,
      baseUrl: $('providerBaseUrl').value,
      model: $('providerModel').value,
      temperature: Number($('temperature').value)
    },
    voice: {
      enabled: $('voiceEnabled').checked,
      outputMode: $('voiceOutputMode').value,
      language: $('voiceLanguage').value,
      rate: Number($('voiceRate').value),
      pitch: Number($('voicePitch').value),
      tts: { baseUrl: $('ttsBaseUrl').value, model: $('ttsModel').value, voice: $('ttsVoice').value, format: $('ttsFormat').value },
      asrMode: $('asrMode').value,
      asr: { baseUrl: $('asrBaseUrl').value, model: $('asrModel').value, language: $('asrLanguage').value },
      volcano: { appId: $('volcAppId').value, cluster: $('volcCluster').value, voiceId: $('volcVoiceId').value, asrResourceId: $('volcAsrResourceId').value, speed: Number($('volcSpeed').value) }
    },
    stage: {
      ...c.stage,
      avatarScale: Number($('avatarScale').value),
      subtitleEnabled: $('subtitleEnabled').checked
    },
    memory: {
      enabled: $('memoryEnabled').checked,
      maxMessages: Number($('maxMessages').value),
      notes: $('memoryNotes').value
    },
    live: {
      ...c.live,
      roomId: $('liveRoomId').value,
      autoReply: $('liveAutoReply').checked
    }
  };
}

async function saveConfig(showToast = true) {
  const payload = await api('/api/config', { method: 'PUT', body: JSON.stringify(collectConfig()) });
  state.config = payload.config;
  const newKey = $('providerApiKey').value.trim();
  if (newKey) {
    const keyResult = await api('/api/secrets/provider', { method: 'POST', body: JSON.stringify({ apiKey: newKey }) });
    state.keyConfigured = keyResult.keyConfigured;
    $('providerApiKey').value = '';
  }
  for (const kind of ['asr', 'tts', 'volcano']) {
    const input = $(kind === 'volcano' ? 'volcAccessToken' : `${kind}ApiKey`);
    const apiKey = input.value.trim();
    if (apiKey) {
      const result = await api(`/api/secrets/${kind}`, { method: 'POST', body: JSON.stringify({ apiKey }) });
      state.voiceKeys[kind] = result.configured;
      input.value = '';
    }
  }
  fillForm();
  if (showToast) toast('配置已保存');
}

function updateVoiceMeta() {
  const apiTts = $('voiceOutputMode').value === 'api';
  const apiAsr = $('asrMode').value === 'api';
  const volcano = $('voiceOutputMode').value === 'volcano' || $('asrMode').value === 'volcano';
  $('systemVoiceFields').hidden = apiTts;
  $('ttsApiFields').hidden = !apiTts;
  $('asrApiFields').hidden = !apiAsr;
  $('volcanoVoiceFields').hidden = !volcano;
  $('asrKeyState').textContent = apiAsr ? (state.voiceKeys.asr ? 'ASR Key 已保存' : '未配置 ASR Key') : $('asrMode').value === 'volcano' ? (state.voiceKeys.volcano ? '火山 Token 已保存' : '未配置火山 Token') : '本机模式';
  $('volcanoKeyState').textContent = state.voiceKeys.volcano ? 'Token 已保存' : '未配置 Token';
}

function updateProviderMeta() {
  const provider = state.providers.find((item) => item.id === $('providerId').value) || state.providers.at(-1);
  if (!provider) return;
  $('providerRecommended').classList.toggle('hidden', !provider.recommended);
  $('modelHint').textContent = provider.modelHint;
  for (const [id, url] of [['providerKeyLink', provider.keyUrl], ['providerDocsLink', provider.docsUrl]]) {
    const link = $(id);
    link.href = url || '#';
    link.hidden = !url;
  }
  $('keyState').textContent = state.keyConfigured ? 'Key 已安全保存' : '未配置 Key';
  const fixedTemperature = Number.isFinite(provider.fixedTemperature) ? provider.fixedTemperature : null;
  $('temperature').disabled = fixedTemperature !== null;
  if (fixedTemperature !== null) $('temperature').value = fixedTemperature;
  $('temperatureValue').textContent = fixedTemperature !== null ? `${fixedTemperature.toFixed(1)}（固定）` : Number($('temperature').value).toFixed(1);
  $('temperatureHint').textContent = provider.temperatureHint || '';
}

function updateAvatarPreview() {
  const c = state.config;
  const source = c.stage.expressions?.[c.stage.activeExpression] || c.stage.avatar;
  for (const id of ['stageAvatar', 'characterAvatar']) $(id).src = source;
  $('stageAvatar').style.transform = `scale(${c.stage.avatarScale})`;
  $('characterAvatar').style.transform = `scale(${c.stage.avatarScale})`;
  $('chatCharacterName').textContent = c.character.name;
  renderExpressionManager();
}

function renderExpressionManager() {
  const container = $('expressionManager');
  if (!container || !state.config) return;
  container.replaceChildren(...Object.entries(expressionNames).map(([name, label]) => {
    const card = document.createElement('div');
    card.className = `expression-card${state.config.stage.activeExpression === name ? ' active' : ''}`;
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'expression-select';
    const image = document.createElement('img');
    image.src = state.config.stage.expressions?.[name] || state.config.stage.avatar;
    image.alt = `${label}表情`;
    const text = document.createElement('span');
    text.textContent = label;
    select.append(image, text);
    select.addEventListener('click', () => {
      state.config.stage.activeExpression = name;
      updateAvatarPreview();
      saveConfig(false).catch((error) => toast(error.message, true));
    });
    const upload = document.createElement('label');
    upload.className = 'expression-upload';
    upload.title = `替换${label}表情`;
    upload.textContent = '+';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.addEventListener('change', (event) => uploadExpression(event.target.files?.[0], name).catch((error) => toast(error.message, true)));
    upload.append(input);
    card.append(select, upload);
    return card;
  }));
}

function updateStatus(status = null) {
  const ready = state.keyConfigured && Boolean(state.config.provider.model);
  $('readyDot').classList.toggle('ready', ready);
  $('readyLabel').textContent = ready ? '可以开始对话' : '等待模型配置';
  $('versionLabel').textContent = 'Syna Live 0.4.0';
  $('quickProvider').textContent = ready ? (state.providers.find((item) => item.id === state.config.provider.id)?.name || '已配置') : '未配置';
  $('quickVoice').textContent = state.config.voice.enabled ? '开启' : '关闭';
  const live = status?.live;
  if (live) {
    $('liveStatus').textContent = live.connected ? '已连接' : (live.error || '未连接');
    $('liveStatus').classList.toggle('connected', live.connected);
    $('quickLive').textContent = live.connected ? `房间 ${live.roomId}` : '未连接';
  }
}

function renderMessages() {
  const container = $('messages');
  container.replaceChildren();
  if (!state.messages.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-chat';
    const title = document.createElement('strong');
    title.textContent = `${state.config.character.name} 在这里`;
    empty.append(title, document.createTextNode('配置模型后即可开始本地陪伴会话。'));
    container.append(empty);
    return;
  }
  for (const message of state.messages) {
    const item = document.createElement('article');
    item.className = `message ${message.role}`;
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = message.role === 'assistant' ? state.config.character.name : state.config.character.userName;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = message.content;
    item.append(meta, bubble);
    container.append(item);
  }
  container.scrollTop = container.scrollHeight;
}

async function speak(text) {
  if (!state.config.voice.enabled) {
    await api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) });
    return;
  }
  if (state.config.voice.outputMode !== 'system') {
    currentVoiceAudio?.pause();
    const payload = await api('/api/tts/synthesize', { method: 'POST', body: JSON.stringify({ text: text.replace(/^\[[^\]]+\]\s*/, '') }) });
    currentVoiceAudio = new Audio(payload.dataUrl);
    currentVoiceAudio.onended = currentVoiceAudio.onerror = () => api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) }).catch(() => {});
    await currentVoiceAudio.play();
    return;
  }
  if (!('speechSynthesis' in window)) {
    await api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) });
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/^\[[^\]]+\]\s*/, ''));
  utterance.lang = state.config.voice.language;
  utterance.rate = state.config.voice.rate;
  utterance.pitch = state.config.voice.pitch;
  utterance.onend = utterance.onerror = () => api('/api/stage/speaking', { method: 'POST', body: JSON.stringify({ speaking: false }) }).catch(() => {});
  speechSynthesis.speak(utterance);
}

async function sendMessage(message) {
  if (state.busy) return;
  state.busy = true;
  $('sendBtn').disabled = true;
  state.messages.push({ role: 'user', content: message });
  renderMessages();
  try {
    const payload = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message }) });
    state.messages.push(payload.message);
    $('stageSubtitle').textContent = payload.message.content;
    renderMessages();
    updateStatus(payload.status);
    speak(payload.message.content);
  } catch (error) {
    state.messages.pop();
    renderMessages();
    toast(error.message, true);
  } finally {
    state.busy = false;
    $('sendBtn').disabled = false;
  }
}

async function uploadAvatar(file, talking = false) {
  if (!file) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const result = await api('/api/avatar', { method: 'POST', body: JSON.stringify({ dataUrl }) });
  if (talking) state.config.stage.talkingAvatar = result.url;
  else {
    state.config.stage.avatar = result.url;
    state.config.stage.expressions.normal = result.url;
  }
  await saveConfig(false);
  toast(talking ? '说话立绘已更新' : '静态立绘已更新');
}

async function uploadExpression(file, expression) {
  if (!file) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const result = await api('/api/avatar', { method: 'POST', body: JSON.stringify({ dataUrl }) });
  state.config.stage.expressions[expression] = result.url;
  state.config.stage.activeExpression = expression;
  await saveConfig(false);
  toast(`${expressionNames[expression]}表情已更新`);
}

async function load() {
  if (!token) throw new Error('缺少本地会话令牌，请重新启动 Syna Live');
  const payload = await api('/api/bootstrap');
  state.config = payload.config;
  state.providers = payload.providers;
  state.messages = payload.messages;
  state.stageUrl = payload.stageUrl;
  state.keyConfigured = payload.keyConfigured;
  state.voiceKeys = payload.voiceKeys || { asr: false, tts: false, volcano: false };
  $('providerId').replaceChildren(...state.providers.map((provider) => {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.recommended ? `${provider.name}（推荐）` : provider.name;
    return option;
  }));
  fillForm();
  renderMessages();
  updateStatus(payload.status);
  window.lucide?.createIcons();
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  const view = button.dataset.view;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.view').forEach((item) => item.classList.toggle('active', item.id === `view-${view}`));
  $('viewTitle').textContent = viewMeta[view][0];
  $('viewSubtitle').textContent = viewMeta[view][1];
}));

$('providerId').addEventListener('change', () => {
  const provider = state.providers.find((item) => item.id === $('providerId').value);
  if (provider && provider.id !== 'custom') $('providerBaseUrl').value = provider.baseUrl;
  updateProviderMeta();
  window.lucide?.createIcons();
});
$('temperature').addEventListener('input', () => $('temperatureValue').textContent = Number($('temperature').value).toFixed(1));
$('voiceRate').addEventListener('input', () => $('voiceRateValue').textContent = Number($('voiceRate').value).toFixed(2));
$('voicePitch').addEventListener('input', () => $('voicePitchValue').textContent = Number($('voicePitch').value).toFixed(2));
$('voiceOutputMode').addEventListener('change', updateVoiceMeta);
$('asrMode').addEventListener('change', updateVoiceMeta);
$('avatarScale').addEventListener('input', () => {
  const scale = Number($('avatarScale').value);
  $('stageAvatar').style.transform = `scale(${scale})`;
  $('characterAvatar').style.transform = `scale(${scale})`;
});
$('globalSaveBtn').addEventListener('click', () => saveConfig().catch((error) => toast(error.message, true)));
$('openCompanionBtn').addEventListener('click', async () => {
  try { await api('/api/companion/show', { method: 'POST', body: '{}' }); toast('桌面陪伴已弹出'); }
  catch (error) { toast(error.message, true); }
});
$('refreshBtn').addEventListener('click', () => load().then(() => toast('状态已刷新')).catch((error) => toast(error.message, true)));
$('chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const message = $('chatInput').value.trim();
  if (!message) return;
  $('chatInput').value = '';
  sendMessage(message);
});
$('chatInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('chatForm').requestSubmit();
  }
});
$('clearChatBtn').addEventListener('click', async () => {
  if (!confirm('清空当前本地对话？')) return;
  await api('/api/memory', { method: 'DELETE' });
  state.messages = [];
  renderMessages();
  toast('本地对话已清空');
});
$('clearMemoryBtn').addEventListener('click', () => $('clearChatBtn').click());
$('avatarFile').addEventListener('change', (event) => uploadAvatar(event.target.files[0]).catch((error) => toast(error.message, true)));
$('talkingAvatarFile').addEventListener('change', (event) => uploadAvatar(event.target.files[0], true).catch((error) => toast(error.message, true)));
$('testProviderBtn').addEventListener('click', async () => {
  try { await saveConfig(false); await api('/api/provider/test', { method: 'POST', body: '{}' }); toast('模型连接成功'); }
  catch (error) { toast(error.message, true); }
});
$('clearKeyBtn').addEventListener('click', async () => {
  await api('/api/secrets/provider', { method: 'DELETE' });
  state.keyConfigured = false;
  updateProviderMeta();
  updateStatus();
  toast('模型 Key 已清除');
});
$('testVoiceBtn').addEventListener('click', async () => {
  try {
    await saveConfig(false);
    await speak(`你好，我是 ${state.config.character.name}。声音听起来怎么样？`);
    toast('正在播放语音');
  } catch (error) { toast(error.message, true); }
});
$('connectLiveBtn').addEventListener('click', async () => {
  try { await saveConfig(false); const result = await api('/api/live/connect', { method: 'POST', body: '{}' }); updateStatus({ live: result.status }); toast('正在连接直播间'); }
  catch (error) { toast(error.message, true); }
});
$('disconnectLiveBtn').addEventListener('click', async () => {
  const result = await api('/api/live/disconnect', { method: 'POST', body: '{}' });
  updateStatus({ live: result.status });
  toast('直播间已断开');
});
for (const id of ['openStageBtn', 'previewStageBtn']) $(id).addEventListener('click', () => window.open(state.stageUrl, '_blank', 'noopener'));
$('copyStageUrlBtn').addEventListener('click', async () => { await navigator.clipboard.writeText(state.stageUrl); toast('OBS 舞台地址已复制'); });
$('exportDiagnosticsBtn').addEventListener('click', async () => {
  const payload = await api('/api/diagnostics');
  const blob = new Blob([JSON.stringify(payload.diagnostics, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'syna-live-diagnostics.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

let asrTestOnly = false;
const speechInput = createSpeechInput({
  api,
  getMode: () => state.config?.voice?.asrMode || $('asrMode').value,
  onText: (text) => {
    if (asrTestOnly) { asrTestOnly = false; toast(`识别结果：${text}`); return; }
    $('chatInput').value = text;
    $('chatForm').requestSubmit();
  },
  onStatus: (message) => toast(message, message.includes('失败') || message.includes('不可用'))
});
$('micBtn').addEventListener('click', async () => {
  try {
    if (speechInput.active) speechInput.stop();
    else await speechInput.start({ language: state.config.voice.language });
  } catch (error) { toast(error.message, true); }
});
$('testAsrBtn').addEventListener('click', async () => {
  try {
    if (speechInput.active) { speechInput.stop(); return; }
    await saveConfig(false);
    asrTestOnly = true;
    await speechInput.start({ language: state.config.voice.language });
    toast('请说一句话，再次点击结束录音');
  } catch (error) { asrTestOnly = false; toast(error.message, true); }
});

load().catch((error) => toast(error.message, true));
