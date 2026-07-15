export class OpenAICompatibleAdapter {
  async complete({ baseUrl, model, apiKey, messages, temperature = 0.9 }) {
    if (!apiKey) throw new Error('请先配置模型 API Key');
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) throw new Error('模型接口地址无效');
    if (!model) throw new Error('请填写模型 ID');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, messages, temperature, stream: false }),
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
}
