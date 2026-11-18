// #2069: neutral, cached timber surfaces. Geometry and world-metre floor UVs stay with World.
import * as THREE from 'three';
import { PARQUET_SURFACE as S } from './config.js';

const cache = new WeakMap();
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rgb = (base, k) => `rgb(${base.map(v => v * k).join(',')})`;

/** The existing six-board repeat, including its staggered one-/three-stave layout, in texture pixels. */
export function parquetLayout(P) {
  const pw = Math.round(P.width * S.ppm), pl = Math.round(P.length * S.ppm), staves = P.staves ?? 1;
  const sw = pw / staves, sl = staves > 1 ? Math.round(pl / staves) : pl;
  const width = pw * S.boards, height = pl * S.lengths, boards = [], rand = rng(S.seed);
  for (let col = 0; col < S.boards * staves; col++) {
    const offset = Math.round(((col * (staves > 1 ? S.stagger.three : S.stagger.one)) % 1) * sl);
    // The same seed/consumption as the old tint recipe; grain has its own independent seed.
    const strips = staves > 1 ? 5 : 14, tints = [];
    for (let row = 0; row < Math.ceil((height + offset) / sl); row++) {
      tints.push((staves > 1 ? .93 : .95) + rand() * (staves > 1 ? .12 : .08));
      for (let i = 0; i < strips * 3; i++) rand();
    }
    const rows = Math.round(height / sl);
    for (let row = 0; row <= rows; row++) {
      const id = row % rows;
      boards.push({ x: col * sw, y: row * sl - offset, w: sw, h: sl,
        tint: tints[id], seed: S.seed + col * 719 + id * 1013 });
    }
  }
  return { width, height, boards, staves, pw, repeat: [1 / (P.width * S.boards), 1 / (P.length * S.lengths)] };
}

/** Continuous fibre centre across a single stave; duplicated wrap pieces use the identical local path. */
export function fibreAt(t, phase, spread = 1) {
  return spread * (Math.sin(t * S.wave[0] + phase) * S.wave[1]
    + Math.sin(t * S.wave[2] + phase * S.wave[3]) * S.wave[4]);
}

function grain(ctx, b, scale, rough = false) {
  const rand = rng(b.seed), x0 = b.x * scale, y0 = b.y * scale, w = b.w * scale, h = b.h * scale;
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  ctx.fillStyle = rough ? `rgb(${S.roughBase},${S.roughBase},${S.roughBase})` : rgb(b.base, b.tint);
  ctx.fillRect(x0, y0, w, h);
  const fibres = Math.round(b.w / S.ppm * S.fibresPerMetre);
  for (let i = 0; i < fibres; i++) {
    const x = rand() * w, phase = rand() * Math.PI * 2, spread = .55 + rand() * .45;
    const shade = rand();
    ctx.strokeStyle = rough ? `rgba(0,0,0,${S.roughGrain * (.4 + shade * .6)})`
      : `rgba(${shade > .8 ? S.light.join(',') : S.dark.join(',')},${S.alpha * (.45 + shade * .55)})`;
    ctx.lineWidth = (rough ? S.roughWidth : S.lineWidth) * scale;
    ctx.beginPath();
    const steps = Math.ceil(b.h / S.pathStep);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps, dx = fibreAt(t, phase, spread) * S.ppm * scale;
      if (j === 0) ctx.moveTo(x0 + x + dx, y0); else ctx.lineTo(x0 + x + dx, y0 + t * h);
    }
    ctx.stroke();
    // A few faint fibres fork, keeping the same direction rather than striping across the board.
    if (!rough && i % S.forkEvery === 0) {
      const from = .2 + phase / (Math.PI * 2) * .45, side = shade > .5 ? 1 : -1;
      ctx.beginPath();
      for (let j = 0; j <= S.forkSteps; j++) {
        const t = from + j / S.forkSteps * S.forkLength;
        const dx = fibreAt(t, phase, spread) * S.ppm * scale + side * (t - from) ** 2 * S.forkWidth * S.ppm * scale;
        if (j === 0) ctx.moveTo(x0 + x + dx, y0 + t * h); else ctx.lineTo(x0 + x + dx, y0 + t * h);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function texture(canvas, repeat, color = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat); t.anisotropy = S.anisotropy;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One colour map and one half-resolution scalar roughness map per authored finish; no extra draw/pass. */
export function parquetSurface(P) {
  if (cache.has(P)) return cache.get(P);
  const L = parquetLayout(P), color = document.createElement('canvas'), rough = document.createElement('canvas');
  color.width = L.width; color.height = L.height;
  rough.width = Math.round(L.width * S.roughScale); rough.height = Math.round(L.height * S.roughScale);
  const c = color.getContext('2d'), r = rough.getContext('2d');
  for (const b of L.boards) {
    b.base = P.base; grain(c, b, 1); grain(r, b, S.roughScale, true);
    // Keep the old fine joints; only the fibre recipe and matching gloss are new.
    c.strokeStyle = `rgba(90,70,50,${L.staves > 1 ? .22 : .3})`;
    c.lineWidth = 1; c.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
  }
  if (L.staves > 1) for (let col = 0; col < S.boards; col++) {
    c.fillStyle = 'rgba(80,60,40,0.35)'; c.fillRect(col * L.pw, 0, 1, L.height);
  }
  const result = { map: texture(color, L.repeat, true), roughnessMap: texture(rough, L.repeat) };
  cache.set(P, result); return result;
}
