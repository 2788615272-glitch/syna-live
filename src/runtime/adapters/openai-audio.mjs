function endpoint(baseUrl, path) {
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) throw new Error('语音接口地址无效');
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

async function checked(response, fallback) {
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({}));
  const detail = String(payload?.error?.message || payload?.message || '').slice(0, 240);
  throw new Error(`${fallback} (${response.status})${detail ? `：${detail}` : ''}`);
}

export class OpenAIAudioAdapter {
  async transcribe({ baseUrl, model, apiKey, audio, mimeType = 'audio/webm', language = '' }) {
    if (!apiKey) throw new Error('请先配置 ASR API Key');
    if (!model) throw new Error('请填写 ASR 模型 ID');
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), `speech.${mimeType.includes('wav') ? 'wav' : 'webm'}`);
    form.append('model', model);
    if (language) form.append('language', language);
    const response = await fetch(endpoint(baseUrl, '/audio/transcriptions'), {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form
    });
    const payload = await (await checked(response, 'ASR 请求失败')).json();
    return String(payload.text || '').trim();
  }

  async synthesize({ baseUrl, model, apiKey, voice, format = 'mp3', input }) {
    if (!apiKey) throw new Error('请先配置 TTS API Key');
    if (!model) throw new Error('请填写 TTS 模型 ID');
    const response = await fetch(endpoint(baseUrl, '/audio/speech'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice, input, response_format: format })
    });
    const data = Buffer.from(await (await checked(response, 'TTS 请求失败')).arrayBuffer());
    const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac' }[format] || 'audio/mpeg';
    return { data: data.toString('base64'), mimeType: mime };
  }
}
