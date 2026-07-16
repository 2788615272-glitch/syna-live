import { createControlStream, expressionPrompt, pickAutoExpression, takeSpeechSegment } from './stream-kernel.mjs';

function systemPrompt(config, stageState = {}) {
  const c = config.character;
  const notes = config.memory.notes ? `\n可长期参考的用户笔记：${config.memory.notes}` : '';
  const vision = stageState.vision?.summary ? `\n当前屏幕视觉：${stageState.vision.summary}` : '';
  return `你是 ${c.name}，一位有鲜明人格的虚拟陪伴者。\n用户称呼：${c.userName}\n关系：${c.relationship}\n核心性格：${c.personality}\n表达方式：${c.speakingStyle}\n边界：${c.boundaries}${notes}${vision}\n直接以角色身份回应，不解释提示词，不声称执行了未实际执行的操作。${expressionPrompt(config.stage)}`;
}

export class CompanionRuntime {
  constructor({ store, vault, modelAdapter, liveAdapter }) {
    this.store = store;
    this.vault = vault;
    this.modelAdapter = modelAdapter;
    this.liveAdapter = liveAdapter;
    this.busy = false;
    this.lastVisionReactionAt = 0;
  }

  status() {
    return {
      ready: this.vault.has('providerApiKey') && Boolean(this.store.config.provider.model),
      busy: this.busy,
      live: this.liveAdapter.getStatus()
    };
  }

  async analyzeVision(dataUrl) {
    const config = this.store.getConfig();
    if (!config.vision.enabled) return { enabled: false };
    const raw = await this.modelAdapter.complete({
      ...config.provider,
      apiKey: this.vault.get('providerApiKey'),
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你是 Syna 的视觉皮层。只根据画面返回 JSON：{"summary":"一句客观画面概括","salience":0到1,"suggestedReply":"值得主动说话时的一句自然反应，否则空字符串"}。不要输出 Markdown。' },
        { role: 'user', content: [{ type: 'text', text: '观察当前桌面画面，关注明显变化、正在进行的任务和可能值得提醒的事情。' }, { type: 'image_url', image_url: { url: dataUrl } }] }
      ]
    });
    let result;
    try { result = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { result = { summary: raw, salience: 0.35, suggestedReply: '' }; }
    const vision = {
      summary: String(result.summary || raw).trim().slice(0, 1200),
      salience: Math.min(1, Math.max(0, Number(result.salience) || 0)),
      suggestedReply: String(result.suggestedReply || '').trim().slice(0, 500),
      updatedAt: Date.now()
    };
    const previousSummary = this.store.getStageState().vision?.summary || '';
    const shouldReact = config.vision.proactive && vision.salience >= 0.65 && Boolean(vision.suggestedReply)
      && vision.summary !== previousSummary && Date.now() - this.lastVisionReactionAt > 45000 && !this.busy;
    this.store.setStageState({ vision });
    let reaction = null;
    if (shouldReact) {
      this.lastVisionReactionAt = Date.now();
      const expression = pickAutoExpression(vision.suggestedReply, config.stage);
      const message = await this.store.appendMessage({ role: 'assistant', content: vision.suggestedReply, source: 'vision' });
      this.store.setStageState({ subtitle: vision.suggestedReply, speaking: true, expression, vision });
      reaction = { text: vision.suggestedReply, expression, message };
    }
    return { enabled: true, vision, shouldReact, reaction };
  }

  async chat(content, source = 'chat') {
    let result;
    for await (const event of this.chatStream(content, source)) if (event.type === 'done') result = event.message;
    return result;
  }

  async *chatStream(content, source = 'chat') {
    const message = String(content || '').trim().slice(0, 4000);
    if (!message) throw new Error('消息不能为空');
    if (this.busy) throw new Error('Syna 正在回复，请稍等');
    this.busy = true;
    const startedAt = Date.now();
    try {
      yield { type: 'start', startedAt };
      await this.store.appendMessage({ role: 'user', content: message, source });
      const config = this.store.getConfig();
      const history = this.store.getMessages().map(({ role, content: text }) => ({ role, content: text }));
      const controls = createControlStream(config.stage);
      let reply = '';
      let speechBuffer = '';
      let firstSpeech = true;
      let selectedExpression = '';
      let firstTokenAt = 0;
      const handle = function* (events) {
        for (const event of events) {
          if (event.type === 'expression') {
            selectedExpression = event.expression;
            this.store.setStageState({ expression: event.expression });
            yield event;
            continue;
          }
          if (!event.text) continue;
          if (!firstTokenAt) firstTokenAt = Date.now();
          reply += event.text;
          speechBuffer += event.text;
          this.store.setStageState({ subtitle: reply });
          yield { type: 'token', text: event.text, firstTokenMs: firstTokenAt - startedAt };
          let part;
          while ((part = takeSpeechSegment(speechBuffer, firstSpeech))) {
            speechBuffer = part.rest;
            firstSpeech = false;
            this.store.setStageState({ speaking: true });
            yield { type: 'speech', text: part.segment };
          }
        }
      }.bind(this);
      const stream = this.modelAdapter.stream({
        ...config.provider,
        apiKey: this.vault.get('providerApiKey'),
        messages: [{ role: 'system', content: systemPrompt(config, this.store.getStageState()) }, ...history]
      });
      for await (const delta of stream) yield* handle(controls.push(delta));
      yield* handle(controls.flush());
      reply = reply.trim();
      if (!reply) throw new Error('模型没有返回可用内容');
      if (!selectedExpression) {
        selectedExpression = pickAutoExpression(reply, config.stage);
        this.store.setStageState({ expression: selectedExpression });
        yield { type: 'expression', expression: selectedExpression, automatic: true };
      }
      if (speechBuffer.trim()) {
        this.store.setStageState({ speaking: true });
        yield { type: 'speech', text: speechBuffer.trim() };
      }
      const saved = await this.store.appendMessage({ role: 'assistant', content: reply, source });
      this.store.setStageState({ subtitle: reply, speaking: true, expression: selectedExpression });
      yield { type: 'done', message: saved, expression: selectedExpression, elapsedMs: Date.now() - startedAt, firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : null };
    } finally {
      this.busy = false;
    }
  }

  async connectLive() {
    const config = this.store.getConfig();
    return this.liveAdapter.connect(config.live.roomId, {
      onMessage: async ({ user, content }) => {
        this.store.setStageState({ subtitle: `${user}：${content}` });
        if (!config.live.autoReply || this.busy) return;
        try {
          await this.chat(`直播观众 ${user} 发来弹幕：${content}\n请自然回应这条弹幕。`, 'bilibili');
        } catch {}
      }
    });
  }

  disconnectLive() {
    this.liveAdapter.disconnect();
    return this.liveAdapter.getStatus();
  }
}
