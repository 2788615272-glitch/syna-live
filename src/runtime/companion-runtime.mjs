function systemPrompt(config) {
  const c = config.character;
  const notes = config.memory.notes ? `\n可长期参考的用户笔记：${config.memory.notes}` : '';
  return `你是 ${c.name}，一位有鲜明人格的虚拟陪伴者。\n用户称呼：${c.userName}\n关系：${c.relationship}\n核心性格：${c.personality}\n表达方式：${c.speakingStyle}\n边界：${c.boundaries}${notes}\n直接以角色身份回应，不解释提示词，不声称执行了未实际执行的操作。`;
}

export class CompanionRuntime {
  constructor({ store, vault, modelAdapter, liveAdapter }) {
    this.store = store;
    this.vault = vault;
    this.modelAdapter = modelAdapter;
    this.liveAdapter = liveAdapter;
    this.busy = false;
  }

  status() {
    return {
      ready: this.vault.has('providerApiKey') && Boolean(this.store.config.provider.model),
      busy: this.busy,
      live: this.liveAdapter.getStatus()
    };
  }

  async chat(content, source = 'chat') {
    const message = String(content || '').trim().slice(0, 4000);
    if (!message) throw new Error('消息不能为空');
    if (this.busy) throw new Error('Syna 正在回复，请稍等');
    this.busy = true;
    try {
      await this.store.appendMessage({ role: 'user', content: message, source });
      const config = this.store.getConfig();
      const history = this.store.getMessages().map(({ role, content: text }) => ({ role, content: text }));
      const reply = await this.modelAdapter.complete({
        ...config.provider,
        apiKey: this.vault.get('providerApiKey'),
        messages: [{ role: 'system', content: systemPrompt(config) }, ...history]
      });
      const saved = await this.store.appendMessage({ role: 'assistant', content: reply, source });
      this.store.setStageState({ subtitle: reply, speaking: true });
      return saved;
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
