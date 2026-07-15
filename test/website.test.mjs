import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const website = new URL('../website/', import.meta.url);

test('character workshop updates persona, expression, and stage line', async () => {
  const html = await readFile(new URL('index.html', website), 'utf8');
  const script = await readFile(new URL('app.js', website), 'utf8');
  const dom = new JSDOM(html, { url: 'https://2788615272-glitch.github.io/syna-live/', runScripts: 'outside-only' });
  dom.window.URL.createObjectURL = () => 'blob:test-avatar';
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.eval(script);

  const document = dom.window.document;
  const name = document.getElementById('demoName');
  const persona = document.getElementById('demoPersona');
  name.value = 'Nova';
  persona.value = '冷静、敏锐，喜欢在直播时观察细节。';
  name.dispatchEvent(new dom.window.Event('input'));
  persona.dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.getElementById('stageName').textContent, 'Nova');
  assert.equal(document.getElementById('stagePersona').textContent, persona.value);

  document.querySelector('[data-expression="angry"]').click();
  assert.match(document.getElementById('demoAvatar').src, /syna-angry\.png$/);
  assert.match(document.getElementById('demoLine').textContent, /偷偷改配置/);

  document.getElementById('customLine').value = '新的舞台台词';
  document.getElementById('personaForm').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  assert.equal(document.getElementById('demoLine').textContent, '新的舞台台词');
});

test('all public Syna expressions are present', async () => {
  for (const expression of ['normal', 'wink', 'angry', 'confused', 'observe', 'speechless']) {
    await access(new URL(`assets/syna-${expression}.png`, website));
  }
});
