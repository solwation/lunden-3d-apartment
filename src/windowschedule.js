// #2120: evening routines for the neighbours' lit windows (surroundings.js buildWindowLights). Pure helpers, no three.js:
// each window (or a detailed window's panes, sharing one routine key) gets a deterministic habit from a hash of its key —
// some light up early, most between 18 and 22, most go dark before or around midnight and a few night owls stay up —
// a slightly different light colour (warm bulb, neutral, cool LED, an occasional flickering blue TV) and a soft fade
// instead of a hard switch. All numbers come from WINDOW_SCHEDULE in config.js.
import { WINDOW_SCHEDULE as W } from './config.js';

/** 32-bit FNV-1a hash of a string, then a mulberry32 stream: the same key always gives the same numbers. */
export function keyRandom(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const span = (r, [a, b]) => a + r() * (b - a);
const pick = (r, list) => { let x = r() * list.reduce((s, k) => s + k.share, 0); for (const k of list) if ((x -= k.share) < 0) return k; return list.at(-1); };

/** A window's habit from its stable key (position or detailed-window routine). */
export function windowHabit(key, cfg = W) {
  const r = keyRandom(key), kind = pick(r, cfg.kinds), colour = pick(r, cfg.colours);
  const home = r() >= cfg.empty;
  const on = span(r, kind.on), off = Math.max(on + cfg.minLit, span(r, kind.off));
  const morning = r() < cfg.morning, wake = span(r, cfg.wake), leave = Math.max(wake + cfg.minLit, span(r, cfg.leave));
  const jitter = (r() - 0.5) * 2 * cfg.jitter, tv = colour.tv ? { phase: r() * 100, rate: span(r, cfg.tv.rate) } : null;
  return { home, kind: kind.name, on, off, morning, wake, leave, rgb: colour.rgb.map((c, i) => Math.min(1, c * (1 + (i === 2 ? -jitter : jitter)))), tv };
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0…1 for being inside [a, b] (hours, b may pass 24) at `hour`, ramped over `fade` h at both ends. */
function inside(hour, a, b, fade) {
  let best = 0;
  for (const h of [hour, hour + 24, hour - 24]) best = Math.max(best, Math.min(smooth((h - a) / fade + 0.5), smooth((b - h) / fade + 0.5)));
  return best;
}

/** How lit the window is at `hour` (0–24): 0 dark … 1 on, with soft edges. */
export function windowLevel(h, hour, cfg = W) {
  if (!h.home) return 0;
  return Math.max(inside(hour, h.on, h.off, cfg.fade), h.morning ? inside(hour, h.wake, h.leave, cfg.fade) : 0);
}

/** Is a TV window showing its blue flicker at `hour` (only in the evening while it is lit)? */
export const tvOn = (h, hour, cfg = W) => !!h.tv && (hour >= cfg.tv.from || hour < cfg.tv.until - 24) && windowLevel(h, hour, cfg) > 0.5;

/** TV brightness factor at real time `t` (s): between 1 − depth and 1, a slow wave plus abrupt scene cuts. */
export function tvFlicker(h, t, cfg = W) {
  const p = h.tv.phase, x = t * h.tv.rate + p, cut = keyRandom(`${Math.floor(x)}:${p.toFixed(3)}`)();
  const wave = 0.5 + 0.5 * Math.sin(t * 7.3 + p) * Math.sin(t * 2.1 + p * 1.7);
  return 1 - cfg.tv.depth * (0.65 * cut + 0.35 * wave);
}

/** RGB 0…1 of a lit window's light (the TV's blue while its show is on). */
export const windowRgb = (h, hour, cfg = W) => (tvOn(h, hour, cfg) ? cfg.tv.rgb : h.rgb);
