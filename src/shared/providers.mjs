export const PROVIDERS = Object.freeze({
  volcano: {
    id: 'volcano',
    name: '火山方舟 / Doubao',
    recommended: true,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    modelHint: '填写推理接入点 ID 或模型 ID',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    docsUrl: 'https://www.volcengine.com/docs/82379/1263482'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    recommended: false,
    baseUrl: 'https://api.openai.com/v1',
    modelHint: '例如 gpt-4.1-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/models'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    recommended: false,
    baseUrl: 'https://api.deepseek.com',
    modelHint: '例如 deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/'
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot / Kimi',
    recommended: false,
    baseUrl: 'https://api.moonshot.cn/v1',
    modelHint: '例如 kimi-k2-0711-preview',
    fixedTemperature: 1,
    temperatureHint: 'Kimi 模型有固定温度要求，应用会按模型自动处理。',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    docsUrl: 'https://platform.moonshot.cn/docs/'
  },
  custom: {
    id: 'custom',
    name: '自定义 OpenAI 兼容接口',
    recommended: false,
    baseUrl: '',
    modelHint: '填写服务支持的模型 ID',
    keyUrl: '',
    docsUrl: ''
  }
});

export function providerList() {
  return Object.values(PROVIDERS).map((provider) => ({ ...provider }));
}

export function resolveProvider(id) {
  return PROVIDERS[id] || PROVIDERS.custom;
}

export function resolveTemperature(providerId, model, temperature = 0.9) {
  const provider = resolveProvider(providerId);
  if (/^kimi-k2\.5(?:$|-)/i.test(String(model || ''))) return 0.6;
  if (Number.isFinite(provider.fixedTemperature)) return provider.fixedTemperature;
  const value = Number(temperature);
  return Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 0.9;
}
