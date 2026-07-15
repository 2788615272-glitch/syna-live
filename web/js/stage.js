const params = new URLSearchParams(location.search);
const stageToken = params.get('stageToken') || '';
const avatar = document.getElementById('avatar');
const subtitle = document.getElementById('subtitle');
const stage = document.getElementById('stage');
let lastAvatar = '';

async function refresh() {
  try {
    const response = await fetch(`/api/stage/state?stageToken=${encodeURIComponent(stageToken)}`, { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    const expression = payload.state.expression || payload.stage.activeExpression || 'normal';
    const expressionAvatar = payload.stage.expressions?.[expression] || payload.stage.avatar;
    const source = payload.state.speaking && payload.stage.talkingAvatar ? payload.stage.talkingAvatar : expressionAvatar;
    if (source && source !== lastAvatar) {
      avatar.src = source;
      lastAvatar = source;
    }
    avatar.style.transform = `scale(${payload.stage.avatarScale})`;
    stage.classList.toggle('speaking', payload.state.speaking);
    subtitle.textContent = payload.state.subtitle || '';
    subtitle.classList.toggle('visible', payload.stage.subtitleEnabled && Boolean(payload.state.subtitle));
  } catch {}
}

refresh();
setInterval(refresh, 350);
