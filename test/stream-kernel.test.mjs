import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlStream, expressionPrompt, pickAutoExpression, takeSpeechSegment } from '../src/runtime/stream-kernel.mjs';

const stage = {
  expressions: { normal: '/normal.png', wink: '/wink.png', angry: '/angry.png' },
  expressionLabels: { normal: '平静', wink: '坏笑', angry: '炸毛' }
};

test('stream kernel handles expression tags split across model chunks', () => {
  const parser = createControlStream(stage);
  const events = [...parser.push('[坏'), ...parser.push('笑]你好'), ...parser.flush()];
  assert.deepEqual(events, [{ type: 'expression', expression: 'wink' }, { type: 'text', text: '你好' }]);
});

test('expression prompt uses user-editable labels and fallback picks an available expression', () => {
  assert.match(expressionPrompt(stage), /\[坏笑\]/);
  assert.equal(pickAutoExpression('哈哈，真不错', stage), 'wink');
});

test('first speech segment flushes early like the legacy runtime', () => {
  const result = takeSpeechSegment('我一直在这里陪着你呢，接下来慢慢说。', true);
  assert.equal(result.segment, '我一直在这里陪着你呢，');
});
