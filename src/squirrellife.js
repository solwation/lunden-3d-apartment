import { SQUIRREL_LIFE as L } from './config.js';

// #2128: the squirrels' life details, with no three.js so a node test can drive them (tools/squirrellifetest.mjs). Everything here is a
// pure, deterministic function of its inputs (month, time, phase, a per-animal seed), so a follower that only knows the shared pose (state,
// rise, run, pitch: squirrelsync.js) derives the same look without a new network field:
//   - `squirrelSeason` / `seasonLife`: what the month means for caching (bury a found nut in autumn, dig old caches up in winter/early spring)
//     and how often a squirrel on the ground stops to sit up and scan.
//   - `tailWave`: per-joint pitch/yaw offsets for the seven tail joints (Joint_Tail_0 … Joint_Tail_Tip): an S-shaped travelling wave,
//     a counter-swing that balances each hop and a leap, a tighter curl when sitting up and a little wind flutter (siteWind). Bounded.
//   - `scanHead`: the jerky head of a scanning squirrel: still holds with a near-instant snap between them.
//   - `eatPaws`: forearms folded to the mouth and the nut turned in the paws while it nibbles.

const hash = (a, b = 0) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x27d4eb2f, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const clamp = (v, m) => Math.max(-m, Math.min(m, v));
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** The season name of `month` (1 … 12) under SQUIRREL_LIFE.seasons. */
export function squirrelSeason(month) {
  for (const [name, months] of Object.entries(L.seasons)) if (months.includes(month)) return name;
  return 'summer';
}
/** { bury, dig, scan } for `month` (no month: summer, the old all-year numbers). */
export const seasonLife = (month) => L.life[month ? squirrelSeason(month) : 'summer'];

/** The number of tail joints `tailWave` fills (Joint_Tail_0 … 5 and Joint_Tail_Tip). */
export const TAIL_JOINTS = 7;
/** Tail joint offsets (radians, added to whatever the clip does): out[j] = { x: pitch (+ curls forward over the back), y: yaw (sideways) }.
 * `t` s, `phase` per animal; `run` 0 … 1; `hop` the body's hop phase (radians, the same one squirrels.js bounces with); `leap` 0 … 1 through
 * a leap (null: not leaping); `rise` 0 … 1 sitting up; `wind` -1 … 1 the cross wind on the tail (siteWind across the animal, × power).
 * Every value is within ± SQUIRREL_LIFE.tail.max. */
export function tailWave(out, { t = 0, phase = 0, run = 0, hop = 0, leap = null, rise = 0, wind = 0 } = {}) {
  const T = L.tail, still = 1 - Math.min(1, run);
  for (let j = 0; j < TAIL_JOINTS; j++) {
    const u = j / (TAIL_JOINTS - 1), lag = j * T.lag;
    // the S: a slow wave running from the root to the tip, neighbouring joints bending opposite ways (stronger at rest, smaller running)
    let x = T.amp * (0.45 + 0.55 * still) * Math.sin(2 * Math.PI * T.wave * t + phase - lag) * (0.6 + 0.4 * u);
    let y = T.yawAmp * Math.sin(2 * Math.PI * T.wave * 0.63 * t + phase * 1.7 - lag * 0.8) * u;
    // hops: the tail swings against the body's bounce, the swing travelling out to the tip (a counterweight)
    if (run > 0) x -= T.hopAmp * run * Math.sin(hop - lag * 0.9) * (j < 2 ? 1 : 0.7);
    // a leap: the plume opens out behind (a rudder) and counters the body's pitch on the way up/down
    if (leap !== null) { const k = Math.max(0, Math.min(1, leap)); x -= T.leapOpen * Math.sin(Math.PI * k) * (0.4 + 0.6 * u) - T.leapOpen * 0.5 * (0.5 - k) * (1 - u); }
    // sitting up: the plume curls tight against the back
    x += T.sitCurl * rise * Math.sin(Math.PI * u);
    y += T.wind * wind * (0.3 + 0.7 * u) * (1 + 0.35 * Math.sin(9 * t + j));
    out[j] = { x: clamp(x, T.max), y: clamp(y, T.max) };
  }
  return out;
}

/** The scanning head at `t` s into a scan (`seed` per animal): { yaw, pitch } radians. Holds of `scan.hold` s, each snapping (within
 * `scan.snap` s) to a new look round about, the first one straight ahead. */
export function scanHead(t, seed = 0) {
  const S = L.scan; let k = 0, t0 = 0, len = 0;
  for (;; k++) { len = S.hold[0] + (S.hold[1] - S.hold[0]) * hash(seed, k * 3); if (t < t0 + len || k > 200) break; t0 += len; }
  const at = (n) => (n <= 0 ? { yaw: 0, pitch: 0 } : { yaw: (hash(seed, n * 3 + 1) * 2 - 1) * S.yaw, pitch: (hash(seed, n * 3 + 2) * 2 - 1) * S.pitch });
  const a = at(k - 1), b = at(k), m = k ? smooth((t - t0) / S.snap) : 1;
  return { yaw: a.yaw + (b.yaw - a.yaw) * m, pitch: a.pitch + (b.pitch - a.pitch) * m };
}

/** Eating sitting up: { fore (forearm fold), paw (wrist), head (nod), spin (the nut turned in the paws) } radians at `t` s. */
export function eatPaws(t, seed = 0) {
  const E = L.eat, w = 2 * Math.PI * E.nibble * t, turn = Math.sin(2 * Math.PI * 0.45 * t + seed);
  return { fore: E.fore + 0.08 * Math.sin(w), paw: E.paw + 0.12 * Math.sin(w + 1), head: E.head + 0.06 * Math.max(0, Math.sin(w)), spin: E.turn * turn };
}
