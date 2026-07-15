function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

  function monitorSound(mediaStream) {
    audioContext ||= new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(mediaStream).connect(analyser);
    const values = new Uint8Array(analyser.fftSize);
    clearInterval(soundTimer);
    soundTimer = setInterval(() => {
      analyser.getByteTimeDomainData(values);
      if (values.some((value) => Math.abs(value - 128) > 8)) heardSound = true;
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
    monitorSound(stream);
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
    },
    close() {
      this.stop();
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  };
}
