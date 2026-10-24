import { drawAvatarPreview } from './customizer.js';
import { decodeAvatarLook, avatarCodeValid } from './config.js';

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

// #1585: small head-and-shoulders thumbnails for the top lists. Each look code is drawn once with the customizer's
// Canvas2D preview into an offscreen canvas (a bounded cache), then cropped with drawImage — 2D UI only, no WebGL.
// A row without a (valid) look gets a neutral silhouette, never a seeded stranger's face or a broken image.
const THUMBS = new Map(), THUMB_CACHE = 48;
const CROP = { x: 40, y: 10, s: 100 }; // in the 180 × 280 preview: the head (centre ≈ 90, 59) with a little shoulder
const LOOK = /^([0-9]+)((?:[a-z][0-9]{1,3})*)$/;
function thumbSource(code) {
  const m = typeof code === 'string' && code.length <= 72 ? LOOK.exec(code) : null;
  if (!m || !avatarCodeValid(m[1]) || typeof document === 'undefined') return null;
  let c = THUMBS.get(code);
  if (c) { THUMBS.delete(code); THUMBS.set(code, c); return c; } // most recently used last
  c = document.createElement('canvas');
  drawAvatarPreview(c, decodeAvatarLook(code, ''));
  THUMBS.set(code, c);
  if (THUMBS.size > THUMB_CACHE) THUMBS.delete(THUMBS.keys().next().value);
  return c;
}

/** Draw a row's thumbnail into a 2D context at (x, y), `size` square; the neutral silhouette without a look. */
export function drawPortraitThumb(ctx, code, x, y, size) {
  const src = thumbSource(code);
  ctx.save();
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, size, size, size * 0.2); else ctx.rect(x, y, size, size); ctx.clip();
  if (src) {
    const k = src.width / 180;
    ctx.drawImage(src, CROP.x * k, CROP.y * k, CROP.s * k, CROP.s * k, x, y, size, size);
  } else {
    ctx.fillStyle = '#3a4a5c'; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#8a9bb0';
    ctx.beginPath(); ctx.arc(x + size / 2, y + size * 0.4, size * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + size / 2, y + size * 1.02, size * 0.36, size * 0.34, 0, Math.PI, 0); ctx.fill();
  }
  ctx.restore();
}

/** A small canvas element with a row's thumbnail (DOM top lists); `px` CSS pixels square. */
export function portraitThumb(code, px = 22) {
  const c = document.createElement('canvas'), dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  c.className = 'lb-face'; c.setAttribute('aria-hidden', 'true');
  c.width = c.height = Math.round(px * dpr);
  drawPortraitThumb(c.getContext('2d'), code, 0, 0, c.width);
  return c;
}
