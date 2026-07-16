export function expressionCatalog(stage = {}) {
  const images = stage.expressions || {};
  const labels = stage.expressionLabels || {};
  return Object.keys(images).map((key) => ({ key, label: String(labels[key] || key).trim().slice(0, 32) || key }));
}

export function expressionPrompt(stage) {
  const list = expressionCatalog(stage).map(({ label }) => `[${label}]`).join('、');
  return `\n【当前可用表情】${list}。请根据本轮语气自行选择一个，并在回复开头或末尾输出对应方括号标签。标签只用于切换立绘，不要解释或朗读。`;
}

function resolveExpression(tag, catalog) {
  const clean = String(tag || '').trim().toLowerCase();
  return catalog.find(({ key, label }) => key.toLowerCase() === clean || label.toLowerCase() === clean)?.key || '';
}

export function createControlStream(stage) {
  const catalog = expressionCatalog(stage);
  let pending = '';
  return {
    push(delta) {
      pending += String(delta || '');
      const events = [];
      while (pending) {
        const start = pending.indexOf('[');
        if (start < 0) { events.push({ type: 'text', text: pending }); pending = ''; break; }
        if (start > 0) { events.push({ type: 'text', text: pending.slice(0, start) }); pending = pending.slice(start); }
        const end = pending.indexOf(']');
        if (end < 0) break;
        const raw = pending.slice(0, end + 1);
        const key = resolveExpression(pending.slice(1, end), catalog);
        if (key) events.push({ type: 'expression', expression: key });
        else events.push({ type: 'text', text: raw });
        pending = pending.slice(end + 1);
      }
      return events;
    },
    flush() {
      const text = pending;
      pending = '';
      return text ? [{ type: 'text', text }] : [];
    }
  };
}

export function pickAutoExpression(text, stage) {
  const available = new Set(expressionCatalog(stage).map(({ key }) => key));
  const choose = (...keys) => keys.find((key) => available.has(key));
  const value = String(text || '');
  if (/无语|服了|\.\.\.|……/.test(value)) return choose('speechless', 'confused', 'normal');
  if (/生气|讨厌|不许|过分|！{2,}/.test(value)) return choose('angry', 'speechless', 'normal');
  if (/\?|？|怎么|为什么|疑惑|奇怪/.test(value)) return choose('confused', 'observe', 'normal');
  if (/哈哈|嘿嘿|不错|真棒|喜欢|开心|~|～/.test(value)) return choose('wink', 'normal');
  if (/看见|画面|屏幕|正在看|观察/.test(value)) return choose('observe', 'normal');
  return choose('normal') || expressionCatalog(stage)[0]?.key || 'normal';
}

function effectiveLength(text) {
  return String(text || '').replace(/[\s，。！？、,.!?；;：:“”‘’…~～—-]/g, '').length;
}

export function takeSpeechSegment(buffer, firstSegment = false) {
  const text = String(buffer || '');
  const minimum = firstSegment ? 8 : 20;
  const hardEnd = firstSegment ? /[。！？!?，,；;：:]/g : /[。！？!?；;]/g;
  let match;
  while ((match = hardEnd.exec(text))) {
    const candidate = text.slice(0, match.index + match[0].length);
    if (effectiveLength(candidate) >= minimum) return { segment: candidate.trim(), rest: text.slice(match.index + match[0].length) };
  }
  const maximum = firstSegment ? 28 : 72;
  if (effectiveLength(text) >= maximum) return { segment: text.trim(), rest: '' };
  return null;
}
