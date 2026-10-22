import { drawAvatarPreview } from './customizer.js';
import { decodeAvatarLook } from './config.js';

/** Reuse the avatar editor's preview; redraw only when appearance or seed changes. */
export function drawPlayerPortrait(canvas, code, name = '') {
  if (!canvas) return;
  const key = JSON.stringify([code || '', name]);
  if (canvas.dataset.avatar === key) return;
  drawAvatarPreview(canvas, decodeAvatarLook(code, name));
  canvas.dataset.avatar = key;
}

export function renderPlayingNow(container, list) {
  if (!container) return;
  const players = list?.players?.length ? list.players : (list?.names ?? []).map(name => ({ name, score: 0 }));
  container.hidden = !players.length;
  const target = container.querySelector('#menu-presence-list');
  if (!target) return;
  target.replaceChildren();
  for (const player of players) {
    const row = document.createElement('div'); row.className = 'online-player';
    const portrait = document.createElement('canvas'); portrait.className = 'player-portrait'; portrait.setAttribute('aria-hidden', 'true');
    drawPlayerPortrait(portrait, player.avatar, player.name === 'Anonym' ? '' : player.name);
    const label = document.createElement('span'); label.textContent = `${player.name || 'Anonym'} (${Number(player.score) | 0}p)`;
    row.append(portrait, label); target.append(row);
  }
}
