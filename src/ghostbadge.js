import * as THREE from 'three';
import { GHOSTS as G } from './config.js';

// #672: only live name/score combinations are cached. Refcounts release GPU resources immediately
// when the last ghost changes score or leaves; history cannot accumulate on low-memory phones.
const badges = new Map();
export const badgeScore = value => Number.isFinite(value) ? Math.min(G.scoreMax, Math.max(0, Math.floor(value))) : 0;
export const badgeLives = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function acquireBadge(name, value, remaining = null) {
  const score = badgeScore(value), lives = badgeLives(remaining), key = JSON.stringify([name, score, lives]);
  let badge = badges.get(key);
  if (!badge) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = lives === null ? 64 : 96;
    const extra = canvas.height - 64; // life row above; original name/score pixel spacing stays intact
    const ctx = canvas.getContext('2d');
    ctx.font = `600 ${G.tagNamePx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const nameWidth = ctx.measureText(name).width;
    const scoreText = `${score.toLocaleString('sv-SE')} p`;
    ctx.font = `600 ${G.tagScorePx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const lifeText = lives === null ? '' : `❤ ${lives.toLocaleString('sv-SE')}`;
    const width = Math.min(248, Math.max(96, nameWidth, ctx.measureText(scoreText).width, ctx.measureText(lifeText).width) + 24), x = (256 - width) / 2;
    ctx.fillStyle = 'rgba(18,22,30,.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, 3, width, canvas.height - 6, 12); else ctx.rect(x, 3, width, canvas.height - 6);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${G.tagNamePx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText(name, 128, 20 + extra, 230);
    ctx.font = `600 ${G.tagScorePx}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = '#ffd76a'; ctx.fillText(scoreText, 128, 45 + extra, 230);
    if (lives !== null) { ctx.fillStyle = '#ffb6be'; ctx.fillText(lifeText, 128, 20, 230); }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    badge = { key, score, lives, height: canvas.height, material: new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }), users: 0 };
    badges.set(key, badge);
  }
  badge.users++;
  return badge;
}
export function releaseBadge(badge) {
  if (badge && --badge.users === 0) {
    badge.material.map.dispose(); badge.material.dispose(); badges.delete(badge.key);
  }
}
