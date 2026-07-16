import { createControlStream, expressionPrompt, pickAutoExpression, takeSpeechSegment } from './stream-kernel.mjs';

function systemPrompt(config, stageState = {}, directVisionReady = false) {
  const c = config.character;
  const notes = config.memory.notes ? `\n可长期参考的用户笔记：${config.memory.notes}` : '';
  const directVision = directVisionReady ? '\n【视觉输入】本轮用户消息附带当前桌面截图。你可以直接看见并描述截图内容；不要回答“看不见”“没有视觉能力”或要求用户重新描述。' : '';
  const dualVision = stageState.vision?.summary ? `\n【视觉脑结果】你可以看见视觉脑刚刚观察到的桌面信息：${stageState.vision.summary}\n这段视觉结果属于已提供的可靠上下文。用户询问画面时请直接回答，不要回答“看不见”或“没有视觉能力”。` : '';
  const visionRule = config.vision.enabled ? '\n视觉规则：只有在既没有附带截图、也没有视觉脑结果时，才可以说明当前没有可用画面。' : '';
  return `你是 ${c.name}，一位有鲜明人格的虚拟陪伴者。\n用户称呼：${c.userName}\n关系：${c.relationship}\n核心性格：${c.personality}\n表达方式：${c.speakingStyle}\n边界：${c.boundaries}${notes}${directVision}${dualVision}${visionRule}\n直接以角色身份回应，不解释提示词，不声称执行了未实际执行的操作。${expressionPrompt(config.stage)}`;
}

export class CompanionRuntime {
  constructor({ store, vault, modelAdapter, liveAdapter }) {
    this.store = store;
    this.vault = vault;
    this.modelAdapter = modelAdapter;
    this.liveAdapter = liveAdapter;
    this.busy = false;
    this.lastVisionReactionAt = 0;
    this.lastConversationAt = 0;
    this.firstVisionAt = 0;
    this.latestVisionFrame = '';
    this.speechQueue = [];
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
    const now = Date.now();
    this.firstVisionAt ||= now;
    const previousVisionFrame = this.latestVisionFrame;
    this.latestVisionFrame = dataUrl;
    if (config.vision.mode === 'single') {
      const vision = { summary: '最新桌面截图已准备好，将在下一轮对话中直接交给主脑。', salience: 0, suggestedReply: '', updatedAt: Date.now(), mode: 'single' };
      this.store.setStageState({ vision });
      return { enabled: true, vision, shouldReact: false, reaction: null };
    }
    const visionFrames = previousVisionFrame && previousVisionFrame !== dataUrl ? [previousVisionFrame, dataUrl] : [dataUrl];
    const raw = await this.modelAdapter.complete({
      ...config.provider,
      apiKey: this.vault.get('providerApiKey'),
      temperature: 0.2,
      messages: [
        { role: 'system', content: `你是 ${config.character.name} 的视觉皮层。只根据画面返回 JSON：{"summary":"一句客观画面概括","salience":0到1,"suggestedReply":"符合角色性格、可自然说出口的一句短评"}。除非画面无法辨认，否则 suggestedReply 不要留空。角色性格：${config.character.personality}。不要输出 Markdown。` },
        { role: 'user', content: [{ type: 'text', text: '观察这些按时间排列的桌面画面，关注明显变化、正在进行的任务和可能值得提醒的事情。' }, ...visionFrames.map((url) => ({ type: 'image_url', image_url: { url } }))] }
      ]
    });
    let result;
    try { result = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { result = { summary: raw, salience: 0.35, suggestedReply: '' }; }
    const vision = {
      summary: String(result.summary || raw).trim().slice(0, 1200),
      salience: Math.min(1, Math.max(0, Number(result.salience) || 0)),
      suggestedReply: String(result.suggestedReply || '').trim().slice(0, 500),
      updatedAt: now
    };
    const previousSummary = this.store.getStageState().vision?.summary || '';
    const lastActivityAt = Math.max(this.lastVisionReactionAt, this.lastConversationAt) || this.firstVisionAt;
    const eventReaction = vision.salience >= 0.62 && vision.summary !== previousSummary
      && now - this.lastVisionReactionAt > 35000 && now - this.lastConversationAt > 12000;
    const ambientReaction = vision.salience >= 0.25
      && now - lastActivityAt >= config.vision.proactiveIntervalSeconds * 1000;
    const shouldReact = config.vision.proactive && Boolean(vision.suggestedReply)
      && (eventReaction || ambientReaction) && !this.busy;
    this.store.setStageState({ vision });
    let reaction = null;
    if (shouldReact) {
      this.lastVisionReactionAt = now;
      const expression = pickAutoExpression(vision.suggestedReply, config.stage);
      const message = await this.store.appendMessage({ role: 'assistant', content: vision.suggestedReply, source: 'vision' });
      this.store.setStageState({ subtitle: vision.suggestedReply, speaking: true, expression, vision });
      reaction = { text: vision.suggestedReply, expression, message, reason: eventReaction ? 'event' : 'ambient' };
    }
    return { enabled: true, vision, shouldReact, reaction };
  }

  async chat(content, source = 'chat') {
    let result;
    for await (const event of this.chatStream(content, source)) if (event.type === 'done') result = event.message;
    return result;
  }

  enqueueSpeech(text, source, groupId = '') {
    const item = { id: crypto.randomUUID(), text: String(text || '').trim(), source: String(source || 'chat'), groupId, createdAt: Date.now() };
    if (!item.text) return null;
    this.speechQueue.push(item);
    this.speechQueue = this.speechQueue.slice(-50);
    return { ...item };
  }

  takeQueuedSpeech() {
    const item = this.speechQueue.shift();
    return item ? { ...item } : null;
  }

  async *chatStream(content, source = 'chat') {
    const message = String(content || '').trim().slice(0, 4000);
    if (!message) throw new Error('消息不能为空');
    if (this.busy) throw new Error('Syna 正在回复，请稍等');
    this.busy = true;
    this.lastConversationAt = Date.now();
    const startedAt = Date.now();
    try {
      yield { type: 'start', startedAt };
      await this.store.appendMessage({ role: 'user', content: message, source });
      const config = this.store.getConfig();
      const history = this.store.getMessages().map(({ role, content: text }) => ({ role, content: text }));
      const directVisionReady = config.vision.enabled && config.vision.mode === 'single' && Boolean(this.latestVisionFrame);
      if (directVisionReady) {
        const lastUserIndex = history.findLastIndex(({ role }) => role === 'user');
        if (lastUserIndex >= 0) history[lastUserIndex] = {
          role: 'user',
          content: [
            { type: 'text', text: history[lastUserIndex].content },
            { type: 'image_url', image_url: { url: this.latestVisionFrame } }
          ]
        };
      }
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
        messages: [{ role: 'system', content: systemPrompt(config, this.store.getStageState(), directVisionReady) }, ...history]
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
      this.lastConversationAt = Date.now();
    }
  }

  async connectLive() {
    const config = this.store.getConfig();
    return this.liveAdapter.connect(config.live.roomId, {
      onMessage: async ({ user, content }) => {
        this.store.setStageState({ subtitle: `${user}：${content}` });
        if (!config.live.autoReply || this.busy) return;
        try {
          const groupId = `bilibili-${crypto.randomUUID()}`;
          for await (const event of this.chatStream(`直播观众 ${user} 发来弹幕：${content}\n请自然回应这条弹幕。`, 'bilibili')) {
            if (event.type === 'speech') this.enqueueSpeech(event.text, 'bilibili', groupId);
          }
        } catch {}
      }
    });
  }

  disconnectLive() {
    this.liveAdapter.disconnect();
    return this.liveAdapter.getStatus();
  }
}
