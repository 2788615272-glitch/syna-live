const host = location.hostname;
const owner = host.endsWith('.github.io') ? host.split('.')[0] : '2788615272-glitch';
const repo = host.endsWith('.github.io') ? (location.pathname.split('/').filter(Boolean)[0] || 'syna-live') : 'syna-live';
const github = `https://github.com/${owner}/${repo}`;

for (const id of ['sourceLink', 'headerGithub']) document.getElementById(id).href = github;
document.getElementById('downloadLink').href = `${github}/releases/latest`;

const expressionData = {
  normal: { image: 'assets/syna-normal.png', lines: ['我在呢，今天想聊点什么？', '你负责开播，我负责让直播间热闹起来。'] },
  wink: { image: 'assets/syna-wink.png', lines: ['放心，今天的场子我帮你撑着。', '这个想法不错，勉强夸你一下。'] },
  angry: { image: 'assets/syna-angry.png', lines: ['你又偷偷改配置了是不是？', '等一下，这个弹幕我必须回。'] },
  confused: { image: 'assets/syna-confused.png', lines: ['嗯？这个逻辑是不是绕远了？', '你先别急，让我重新想一下。'] },
  observe: { image: 'assets/syna-observe.png', lines: ['我看着呢，画面刚才有点变化。', '直播间安静了，要不要主动聊个话题？'] },
  speechless: { image: 'assets/syna-speechless.png', lines: ['……行，你开心就好。', '这我是真没想到。'] }
};

for (const data of Object.values(expressionData)) data.image = data.image.replace('.png', '.webp');

const expressionImages = new Map();
for (const { image: source } of Object.values(expressionData)) {
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  expressionImages.set(source, image);
}

const heroImage = document.querySelector('.hero > img');
const heroStack = document.createElement('div');
heroStack.className = 'hero-expression-stack';
for (const expression of ['speechless', 'confused', 'angry', 'normal', 'wink', 'observe']) {
  const image = document.createElement('img');
  image.src = expressionData[expression].image;
  image.alt = `Syna ${expression}`;
  image.decoding = 'async';
  heroStack.append(image);
}
heroImage.replaceWith(heroStack);
document.getElementById('demoAvatar').src = expressionData.normal.image;

let currentExpression = 'normal';
let lineIndex = 0;
let uploadedAvatarUrl = '';

function syncPersona() {
  const name = document.getElementById('demoName').value.trim() || '未命名角色';
  const relation = document.getElementById('demoRelation').value.trim() || '陪伴搭档';
  const persona = document.getElementById('demoPersona').value.trim() || '等待设置核心人设';
  document.getElementById('stageName').textContent = name;
  document.getElementById('stageRelation').textContent = relation;
  document.getElementById('stagePersona').textContent = persona;
  document.getElementById('stageCharacterName').textContent = `${name.toUpperCase()} · COMPANION`;
}

function selectExpression(expression) {
  currentExpression = expression;
  lineIndex = 0;
  const data = expressionData[expression];
  document.getElementById('demoAvatar').src = data.image;
  document.getElementById('customLine').value = data.lines[0];
  document.getElementById('demoLine').textContent = data.lines[0];
  document.querySelectorAll('[data-expression]').forEach((button) => button.classList.toggle('active', button.dataset.expression === expression));
}

document.querySelectorAll('[data-expression]').forEach((button) => button.addEventListener('click', () => selectExpression(button.dataset.expression)));
for (const id of ['demoName', 'demoRelation', 'demoPersona']) document.getElementById(id).addEventListener('input', syncPersona);

document.getElementById('personaForm').addEventListener('submit', (event) => {
  event.preventDefault();
  syncPersona();
  const line = document.getElementById('customLine').value.trim();
  if (line) document.getElementById('demoLine').textContent = line;
});

document.getElementById('nextLine').addEventListener('click', () => {
  const lines = expressionData[currentExpression].lines;
  lineIndex = (lineIndex + 1) % lines.length;
  document.getElementById('customLine').value = lines[lineIndex];
  document.getElementById('demoLine').textContent = lines[lineIndex];
});

document.getElementById('demoAvatarUpload').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (uploadedAvatarUrl) URL.revokeObjectURL(uploadedAvatarUrl);
  uploadedAvatarUrl = URL.createObjectURL(file);
  document.getElementById('demoAvatar').src = uploadedAvatarUrl;
  document.getElementById('demoLine').textContent = '新形象已载入，接下来写下属于这个角色的人设吧。';
  document.querySelectorAll('[data-expression]').forEach((button) => button.classList.remove('active'));
});

document.getElementById('resetAvatar').addEventListener('click', () => {
  if (uploadedAvatarUrl) URL.revokeObjectURL(uploadedAvatarUrl);
  uploadedAvatarUrl = '';
  selectExpression('normal');
});

syncPersona();
