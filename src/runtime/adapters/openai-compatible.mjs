import { resolveTemperature } from '../../shared/providers.mjs';

export class OpenAICompatibleAdapter {
  async complete({ id, baseUrl, model, apiKey, messages, temperature = 0.9 }) {
    if (!apiKey) throw new Error('请先配置模型 API Key');
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) throw new Error('模型接口地址无效');
    if (!model) throw new Error('请填写模型 ID');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const request = { model, messages, temperature: resolveTemperature(id, model, temperature), stream: false };
      if (id === 'moonshot' || /^kimi-/i.test(model)) request.thinking = { type: 'disabled' };
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = String(payload?.error?.message || payload?.message || '').slice(0, 240);
        throw new Error(`模型请求失败 (${response.status})${detail ? `：${detail}` : ''}`);
      }
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回可用内容');
      return content.trim();
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('模型响应超时');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async *stream({ id, baseUrl, model, apiKey, messages, temperature = 0.9 }) {
    if (!apiKey) throw new Error('请先配置模型 API Key');
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) throw new Error('模型接口地址无效');
    if (!model) throw new Error('请填写模型 ID');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const request = { model, messages, temperature: resolveTemperature(id, model, temperature), stream: true };
      if (id === 'moonshot' || /^kimi-/i.test(model)) request.thinking = { type: 'disabled' };
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = String(payload?.error?.message || payload?.message || '').slice(0, 240);
        throw new Error(`模型请求失败 (${response.status})${detail ? `：${detail}` : ''}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = done ? '' : lines.pop() || '';
        for (const line of lines) {
          const raw = line.trim();
          if (!raw.startsWith('data:') || raw === 'data: [DONE]') continue;
          const payload = JSON.parse(raw.slice(5).trim());
          if (payload.error) throw new Error(String(payload.error.message || payload.error));
          const text = payload?.choices?.[0]?.delta?.content;
          if (text) yield text;
        }
        if (done) break;
      }
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('模型响应超时');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
