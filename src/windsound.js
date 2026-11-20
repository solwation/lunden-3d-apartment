// #2177: what the outdoor wind sounds like, from the simulated / real wind (#2117: windsim.js `windPower`). Pure and config-only
// (WIND_SOUND): `windSoundParams` turns wind power, gust sweep, leaf cover, nearness of trees and "indoors" into the settings of the
// one noise loop with two filters that `sfx.windBed()` (audio.js) plays — a low-pass body (whoosh, howling at a high Q in strong
// wind) and a band-pass (rustle in leaves near trees in summer, bare whistling in branches in winter). tools/windsoundtest.mjs.
import { WIND_SOUND as S } from './config.js';
import { windPower } from './windsim.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Gust sweep 0…1 at `t` s: two slow sines, deeper the stronger the wind `power` 0…1 (a calm hardly gusts). Pure in t. */
export function gustAt(t, power) {
  const G = S.gust, w = 0.5 + 0.5 * Math.sin(t * G.f1 * 6.2832) * Math.sin(t * G.f2 * 6.2832 + 1.3) ;
  return clamp01(0.5 + (w - 0.5) * 2 * G.depth * (0.4 + 0.6 * clamp01(power)));
}

/** Effective strength 0…1 of the wind now: its power, swelled and thinned by the gust sweep (gust 0…1, 0.5 = neutral). */
export function windStrength(speed, gust = 0.5) { return clamp01(windPower(speed) * (0.7 + 0.6 * gust)); }

/**
 * { gain, lpHz, lpQ, bandGain, bandHz, bandQ } for one moment. `speed` m/s, `gust` 0…1 (gustAt), `leaves` 0…1 (SEASON.trees[month][3]),
 * `near` 0…1 (how close the nearest tree is: 1 = under it), `indoors` (heard through the walls).
 */
export function windSoundParams({ speed = 0, gust = 0.5, leaves = 1, near = 0, indoors = false } = {}) {
  const s = windStrength(speed, gust), B = S.body, R = S.band;
  let gain = lerp(B.gain[0], B.gain[1], s ** B.gamma) * (s > 0 ? 1 : 0.5);
  let lpHz = lerp(B.hz[0], B.hz[1], s);
  const lpQ = lerp(B.q[0], B.q[1], smooth(B.howl[0], B.howl[1], s));
  const rustle = leaves * near * smooth(0.05, 0.4, s), whistle = (1 - leaves) * smooth(R.from[0], R.from[1], s) * (0.5 + 0.5 * near);
  const tot = rustle + whistle, k = tot > 0 ? whistle / tot : 0;
  let bandGain = (R.rustle.gain * rustle + R.whistle.gain * whistle) * (0.5 + s);
  const bandHz = lerp(lerp(R.rustle.hz[0], R.rustle.hz[1], s), lerp(R.whistle.hz[0], R.whistle.hz[1], s), k);
  const bandQ = lerp(R.rustle.q, lerp(R.whistle.q[0], R.whistle.q[1], s), k);
  if (indoors) { gain *= S.indoor.gain; bandGain *= S.indoor.band; lpHz = Math.min(lpHz, S.indoor.hz); }
  return { gain, lpHz, lpQ, bandGain, bandHz, bandQ };
}

/** The open window's wind (the old `sfx.wind`, now by strength 0…1): { gain, lpHz }. */
export function windowWindParams(power) {
  const W = S.window, p = clamp01(power);
  return { gain: lerp(W.gain[0], W.gain[1], p), lpHz: lerp(W.hz[0], W.hz[1], p) };
}

/** How near the closest tree is, 0…1 (1 = at it, 0 = `WIND_SOUND.near` m or more); `feet` = [{ x, z }]. */
export function treeNearness(feet, x, z) {
  let best = S.near;
  for (const f of feet) { const dx = f.x - x; if (dx > best || -dx > best) continue; const d = Math.hypot(dx, f.z - z); if (d < best) best = d; }
  return 1 - best / S.near;
}
