const host = location.hostname;
const owner = host.endsWith('.github.io') ? host.split('.')[0] : 'OWNER';
const repo = location.pathname.split('/').filter(Boolean)[0] || 'syna-live';
const github = `https://github.com/${owner}/${repo}`;
for (const id of ['sourceLink', 'headerGithub']) document.getElementById(id).href = github;
document.getElementById('downloadLink').href = `${github}/releases/latest`;

const lines = ['我在呢，今天想聊点什么？', '你负责开播，我负责让直播间热闹起来。', '形象换好了。嗯，这次很有品。', '别发呆了，观众都看着呢。'];
let index = 0;
document.getElementById('nextLine').addEventListener('click', () => {
  index = (index + 1) % lines.length;
  document.getElementById('demoLine').textContent = lines[index];
});
