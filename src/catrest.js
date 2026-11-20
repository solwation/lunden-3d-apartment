import { CAT_REST as R } from './config.js';

// #2192: where a cat that turns up behind a door chooses to sleep, as pure helpers (no three.js; node test tools/catresttest.mjs).
// cat.js roomSpot asks `restPlan` what the moment favours, `sunOnFloor` / `inWarmZone` score floor points against the window
// openings (world.levels[l].openings: x0, x1, y0, y1, glass z, inner z), and sleeps the cat curled up where it lands.

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The windows (not glazed entrance doors) of one level's openings as plain rectangles. */
export function windowsOf(openings) {
  const out = [];
  for (const facade of ['north', 'south']) for (const w of openings?.[facade] ?? []) {
    if (!w.win || w.glass === undefined || w.inner === undefined) continue;
    out.push({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, glass: w.glass, inner: w.inner, room: facade === 'north' ? 1 : -1 });
  }
  return out;
}

/** How strongly the sun shines in (0 … 1): its height over the horizon, less what clouds take (`overcast` 0 … 1). */
export function sunStrength(sunDir, overcast = 0) {
  return smooth(R.lowSun, 0.35, fin(sunDir?.y, -1)) * (1 - clamp(fin(overcast), 0, 1));
}

/** Is the floor point (x, y, z) in the sun that comes through one of `wins`? The ray towards the sun must pass the window's inner
 * face and its glass, both inside the opening shrunk by CAT_REST.margin. */
export function sunOnFloor(sunDir, wins, x, y, z) {
  const sx = fin(sunDir?.x), sy = fin(sunDir?.y, -1), sz = fin(sunDir?.z);
  if (sy < R.lowSun) return false;
  const m = R.margin;
  for (const w of wins) {
    if (Math.abs(sz) < 1e-6) continue;
    let ok = true;
    for (const pz of [w.inner, w.glass]) {
      const t = (pz - z) / sz;
      if (!(t > 0)) { ok = false; break; }
      const hx = x + sx * t, hy = y + sy * t;
      if (hx < w.x0 + m || hx > w.x1 - m || hy < w.y0 + m || hy > w.y1 - m) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/** Is (x, z) on the floor in front of a window, where its radiator stands (CAT_REST.warmDepth / warmMargin)? */
export function inWarmZone(wins, x, z) {
  for (const w of wins) {
    const d = (z - w.inner) * w.room;
    if (d > 0.12 && d < R.warmDepth && x > w.x0 - R.warmMargin && x < w.x1 + R.warmMargin) return true;
  }
  return false;
}

/** Is `hour` evening or night (from CAT_REST.evening[0] to evening[1] next morning)? */
export const isEvening = (hour) => { const h = fin(hour, 12); return h >= R.evening[0] || h < R.evening[1]; };

/** What the moment favours: { mode: 'sun' | 'bed' | 'warm', sun }. Sun while it shines in; the bed / sofa in the evening; a radiator otherwise. */
export function restPlan({ sunDir, overcast = 0, hour = 12 } = {}) {
  const sun = sunStrength(sunDir, overcast);
  return { sun, mode: sun >= R.minSun ? 'sun' : isEvening(hour) ? 'bed' : 'warm' };
}

/** Pick one of `list` with a uniform draw u (0 … 1); undefined when empty. */
export const pickOne = (list, u) => list[Math.min(list.length - 1, Math.floor(clamp(fin(u), 0, 0.999999) * list.length))];
