// Coloured spill from screens and neon (#2199). Pure helpers (no three.js) shared by furniture.js (TV picture colour), lights.js (the TV as a
// lamp-wash entry) and clubhousematerials.js (static neon terms in the playhouse shader). No real lights.
import { LIGHTING, PLAYROOM as R } from './config.js';
import { posterLayout } from './posterlayout.js';

const S = LIGHTING.screenSpill;

/** Average sRGB colour (0..1) of RGBA bytes `data`. */
export function averageRgb(data) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  return n ? [r / n / 255, g / n / 255, b / n / 255] : [0, 0, 0];
}

/** One easing step of the spill colour `prev` towards `next` after `dt` s (time constant `tau`): exponential, frame-rate independent. */
export function easeRgb(prev, next, dt, tau = S.tau) {
  const k = 1 - Math.exp(-Math.max(0, dt) / tau);
  return prev.map((v, i) => v + (next[i] - v) * k);
}

/** Linear colour × intensity a screen of average sRGB colour `rgb` spills: the chroma keeps at least `floor` of full so a dark picture still
 * tints, and the brightness follows the picture's luminance, so the flicker of a cut or a flash carries into the room. Black = nothing. */
export function spillColour(rgb, gain = S.gain, floor = S.floor) {
  const lin = rgb.map((v) => Math.pow(Math.min(1, Math.max(0, v)), 2.2)), top = Math.max(...lin);
  if (top < 1e-4) return [0, 0, 0];
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2], k = gain * (floor + (1 - floor) * Math.min(1, Math.sqrt(lum) * 1.6));
  return lin.map((v) => (v / top) * k * Math.min(1, 0.55 + top));
}

const hex = (c) => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255].map((v) => Math.pow(v, 2.2));

/**
 * The playhouse's static coloured terms in local metres (the room's centre at x/z 0, y up): [{ x, y, z, range, rgb }]. SPEL's four ceiling
 * neon runs (each a point a little in from its wall's middle), its two hexagon LED clusters (the mean of their lit colours) and the GAME ON
 * sign. The clubhouse shader adds them to its lamp term only inside SPEL.
 */
export function clubGlowTerms(cfg = R.posters.spill) {
  const { runs, signs } = posterLayout(), out = [];
  const mid = (a, b) => (a + b) / 2;
  const C = R.clubhouse, cx = (C.side + C.wall / 2 + R.w / 2) / 2, cz = (-R.d / 2 + C.front - C.wall / 2) / 2; // SPEL's middle
  for (const r of runs) {
    const q = r.rect, alongX = q.x1 - q.x0 > q.z1 - q.z0, x = mid(q.x0, q.x1), z = mid(q.z0, q.z1);
    // a point in from its wall by `inset`, towards the room's middle across the run
    const px = alongX ? x : x + (x < cx ? cfg.inset : -cfg.inset), pz = alongX ? z + (z < cz ? cfg.inset : -cfg.inset) : z;
    out.push({ x: px, y: cfg.runY, z: pz, range: cfg.range, rgb: hex(r.color).map((v) => v * cfg.run) });
  }
  const H = R.posters.leds.hex, wall = R.posters.walls.spelN ? -R.d / 2 : 0;
  for (const c of R.posters.leds.clusters) {
    const lit = c.rows.join('').split('').filter((ch) => H.colors[ch] !== undefined);
    const avg = lit.length ? [0, 1, 2].map((i) => lit.reduce((s, ch) => s + hex(H.colors[ch])[i], 0) / lit.length) : [0, 0, 0];
    out.push({ x: c.x, y: c.y, z: wall + cfg.inset, range: cfg.range, rgb: avg.map((v) => v * cfg.hex) });
  }
  const sp = signs.find((s) => s.name === 'spel');
  if (sp) out.push({ x: mid(sp.rect.x0, sp.rect.x1), y: mid(sp.rect.y0, sp.rect.y1), z: wall + cfg.inset, range: cfg.range, rgb: hex(cfg.signColor).map((v) => v * cfg.sign) });
  return out;
}
