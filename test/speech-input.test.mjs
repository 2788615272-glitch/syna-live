import test from 'node:test';
import assert from 'node:assert/strict';
import { createSilenceDetector } from '../web/js/speech-input.js';

test('ASR utterance ends after 700 ms of silence following speech', () => {
  const detector = createSilenceDetector({ silenceMs: 700, minimumSpeechMs: 250 });
  assert.equal(detector.push({ now: 0, speaking: false }), false);
  assert.equal(detector.push({ now: 100, speaking: true }), false);
  assert.equal(detector.push({ now: 400, speaking: true }), false);
  assert.equal(detector.push({ now: 900, speaking: false }), false);
  assert.equal(detector.push({ now: 1100, speaking: false }), true);
});
