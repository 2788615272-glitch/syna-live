function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function encodeWav(parts, inputRate, outputRate = 16000) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const input = new Float32Array(length);
  let offset = 0;
  for (const part of parts) { input.set(part, offset); offset += part.length; }
  const ratio = inputRate / outputRate;
  const samples = new Int16Array(Math.max(1, Math.floor(input.length / ratio)));
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, input[Math.min(input.length - 1, Math.floor(index * ratio))] || 0));
    samples[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + samples.byteLength);
  const view = new DataView(buffer);
  const write = (position, text) => [...text].forEach((char, index) => view.setUint8(position + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.byteLength, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.byteLength, true);
  new Int16Array(buffer, 44).set(samples);
  return new Blob([buffer], { type: 'audio/wav' });
}

export function createSilenceDetector({ silenceMs = 700, minimumSpeechMs = 250 } = {}) {
  let speechStartedAt = null;
  let lastSpeechAt = null;
  let ended = false;
  return {
    push({ now, speaking }) {
      if (ended) return true;
      if (speaking) {
        speechStartedAt ??= now;
        lastSpeechAt = now;
        return false;
      }
      if (speechStartedAt === null || lastSpeechAt === null || lastSpeechAt - speechStartedAt < minimumSpeechMs) return false;
      if (now - lastSpeechAt < silenceMs) return false;
      ended = true;
      return true;
    }
  };
}

export function createSpeechInput({ api, getMode, onText, onStatus = () => {} }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition;
  let stream;
  let recorder;
  let chunks = [];
  let continuous = false;
  let active = false;
  let chunkTimer;
  let soundTimer;
  let heardSound = false;
  let audioContext;
  let stopPcmRecording;

  function monitorSound(mediaStream, onSilence) {
    audioContext ||= new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(mediaStream).connect(analyser);
    const values = new Uint8Array(analyser.fftSize);
    const detector = createSilenceDetector();
    clearInterval(soundTimer);
    soundTimer = setInterval(() => {
      analyser.getByteTimeDomainData(values);
      const speaking = values.some((value) => Math.abs(value - 128) > 8);
      if (speaking) heardSound = true;
      if (detector.push({ now: performance.now(), speaking })) {
        clearInterval(soundTimer);
        onSilence?.();
      }
    }, 100);
  }

  async function transcribe(blob) {
    if (!heardSound || blob.size < 1000) return;
    onStatus('正在提交 ASR 识别…');
    const result = await api('/api/asr/transcribe', { method: 'POST', body: JSON.stringify({ dataUrl: await blobToDataUrl(blob) }) });
    if (result.text) onText(result.text);
  }

  async function startApiChunk() {
    if (!active) return;
    stream ||= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    heardSound = false;
    monitorSound(stream, () => recorder?.state === 'recording' && recorder.stop());
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      clearTimeout(chunkTimer);
      clearInterval(soundTimer);
      const blob = new Blob(chunks, { type: recorder.mimeType });
      try { await transcribe(blob); } catch (error) { onStatus(error.message); }
      if (active && continuous) startApiChunk().catch((error) => onStatus(error.message));
      else if (!continuous) { active = false; onStatus('识别完成'); }
    };
    recorder.start();
    onStatus(continuous ? '自动聆听中…' : '正在录音，点击停止并识别');
    if (continuous) chunkTimer = setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 5000);
  }

  async function startVolcanoChunk() {
    if (!active) return;
    stream ||= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const parts = [];
    const detector = createSilenceDetector();
    heardSound = false;
    let finished = false;
    processor.onaudioprocess = (event) => {
      const values = new Float32Array(event.inputBuffer.getChannelData(0));
      parts.push(values);
      const speaking = values.some((value) => Math.abs(value) > 0.025);
      if (speaking) heardSound = true;
      if (detector.push({ now: performance.now(), speaking })) stopPcmRecording?.();
    };
    source.connect(processor);
    processor.connect(context.destination);
    stopPcmRecording = async () => {
      if (finished) return;
      finished = true;
      clearTimeout(chunkTimer);
      processor.disconnect();
      source.disconnect();
      await context.close();
      const blob = encodeWav(parts, context.sampleRate);
      try { await transcribe(blob); } catch (error) { onStatus(error.message); }
      if (active && continuous) startVolcanoChunk().catch((error) => onStatus(error.message));
      else if (!continuous) { active = false; onStatus('识别完成'); }
    };
    onStatus(continuous ? '火山 ASR 自动聆听中…' : '正在录制 WAV，点击停止并识别');
    if (continuous) chunkTimer = setTimeout(() => stopPcmRecording?.(), 5000);
  }

  function ensureRecognition() {
    if (!Recognition) throw new Error('当前环境不支持浏览器语音识别，请切换到 ASR API');
    if (recognition) return recognition;
    recognition = new Recognition();
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) if (event.results[index].isFinal) finalText += event.results[index][0].transcript;
      if (finalText) onText(finalText);
    };
    recognition.onerror = (event) => onStatus(`语音识别不可用：${event.error}`);
    recognition.onend = () => { if (active && continuous) setTimeout(() => recognition.start(), 350); else active = false; };
    return recognition;
  }

  return {
    get active() { return active; },
    async start(options = {}) {
      if (active) return;
      active = true;
      continuous = options.continuous === true;
      if (getMode() === 'api') return startApiChunk();
      if (getMode() === 'volcano') return startVolcanoChunk();
      const engine = ensureRecognition();
      engine.continuous = continuous;
      engine.lang = options.language || 'zh-CN';
      engine.start();
      onStatus(continuous ? '自动聆听中…' : '请开始说话…');
    },
    stop() {
      active = false;
      clearTimeout(chunkTimer);
      clearInterval(soundTimer);
      if (recognition) try { recognition.stop(); } catch {}
      if (recorder?.state === 'recording') recorder.stop();
      if (stopPcmRecording) stopPcmRecording();
    },
    close() {
      this.stop();
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  };
}
