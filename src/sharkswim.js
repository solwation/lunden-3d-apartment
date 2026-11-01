import { RIVER_FISH, SHARK as S } from './config.js';
import { rng, riverPoint, swimIntervals, waterAt } from './riverfishswim.js';

// #1769: the rare shark in Höje å as pure functions of (seed, period number, time), with no three.js, like the fish (#1752,
// src/riverfishswim.js): the Worker room (cloudflare/riverfish.js) arbitrates its catch with them, src/shark.js draws it, node tests check them.
// - When: one window per SHARK.schedule.period (a week) of the room's fish clock, `window` s long, placed pseudo-randomly inside its period
//   from the seed and the period's number: the same for everybody, but not at a fixed weekday or hour. In test mode (`&shark=now`, or a room
//   started with SHARK_TEST) the window is the whole of every SHARK.test.period.
// - Where: back and forth along `span` m of one of the fish's swim stretches (riverfishswim.js swimIntervals: inside the river's ends, clear of
//   the road bridge's piers), its fin at the surface, a little sideways.
// - The catch: { w (the window's period number), at (room ms), p: [x, y, z] (where the body landed), r (its yaw) }; the body lies there for
//   SHARK.body s, then the skeleton for SHARK.bones s, then nothing (sharkPhase).

const hash = (...v) => { let h = 2166136261; for (const x of v) { h ^= x >>> 0; h = Math.imul(h, 16777619); h ^= h >>> 13; } return h >>> 0; };
const period = (test) => (test ? S.test.period : S.schedule.period);

/** The shark's window in period `k`: { k, start, end } in fish seconds (RIVER_FISH.epoch). */
export function sharkWindow(k, seed = RIVER_FISH.seed, test = false) {
  const P = period(test);
  if (test) return { k, start: k * P, end: (k + 1) * P };
  const [a, b] = S.schedule.window, r = rng(hash(seed, k + 0x51a7, 0x4a1)), dur = a + (b - a) * r(), start = k * P + r() * (P - dur);
  return { k, start, end: start + dur };
}
/** The window the shark swims in at fish time `t`, or null. */
export function sharkNow(t, seed = RIVER_FISH.seed, test = false) {
  const w = sharkWindow(Math.floor(t / period(test)), seed, test);
  return t >= w.start && t < w.end ? w : null;
}
/** The current or next window (end after `t`). */
export function nextSharkWindow(t, seed = RIVER_FISH.seed, test = false) {
  const k = Math.floor(t / period(test)), w = sharkWindow(k, seed, test);
  return w.end > t ? w : sharkWindow(k + 1, seed, test);
}

const paths = new Map();
/** The path of window `w`: { c (centre along the river), half (half the span), ph, ph2 }. */
function pathOf(w, seed) {
  const key = `${seed}:${w.k}`;
  let p = paths.get(key);
  if (p) return p;
  const r = rng(hash(seed, w.k + 0x2b7, 0x5ea)), keep = S.len / 2 + S.clear;
  const room = swimIntervals.map(([a, b]) => Math.max(0, b - a - 2 * keep)), sum = room.reduce((s, v) => s + v, 0);
  let x = r() * sum, j = 0;
  while (j < room.length - 1 && x > room[j]) x -= room[j++];
  const [a, b] = swimIntervals[j], half = Math.min(S.span, room[j]) / 2, lo = a + keep + half, hi = b - keep - half;
  p = { c: lo + (hi - lo) * r(), half, ph: r() * Math.PI * 2, ph2: r() * Math.PI * 2 };
  if (paths.size > 64) paths.clear();
  paths.set(key, p);
  return p;
}
const base = (w, t, seed, o) => {
  const p = pathOf(w, seed), u = t - w.start, s = p.c + p.half * Math.sin((Math.PI * 2 * u) / S.pass + p.ph);
  riverPoint(s, o);
  const free = Math.max(0, o.hw - RIVER_FISH.edge - 0.35), lat = Math.sin((Math.PI * 2 * u) / (S.pass * 0.37) + p.ph2) * S.side * free;
  o.x += o.nx * lat; o.z += o.nz * lat; o.lat = lat;
  return o;
};
const A = {}, B = {};
/** The shark of window `w` at fish time `t`: { x, z, y (the surface), yaw (heading, three.js Y rotation of +z), speed, show (0..1: rising at the start, sinking at the end), s }. */
export function sharkAt(w, t, o = {}, seed = RIVER_FISH.seed) {
  base(w, t, seed, o); base(w, t - 0.5, seed, A); base(w, t + 0.5, seed, B);
  o.yaw = Math.atan2(B.x - A.x, B.z - A.z); o.speed = Math.hypot(B.x - A.x, B.z - A.z);
  o.y = waterAt(o.s);
  o.show = Math.max(0, Math.min(1, (t - w.start) / 20, (w.end - t) / 20));
  return o;
}

/** The phase of a caught shark at room time `ms`: 'body' (SHARK.body s), then 'bones' (SHARK.bones s), then null (gone). */
export function sharkPhase(rec, ms) {
  if (!rec) return null;
  const age = (ms - rec.at) / 1000;
  return age < 0 ? 'body' : age < S.body ? 'body' : age < S.body + S.bones ? 'bones' : null;
}
/** When the record has no more use (room ms): the skeleton is gone. */
export const sharkUntil = (rec) => rec.at + (S.body + S.bones) * 1000;
const fin = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
/** A catch record as it travels (room → client, and in the room's storage), or null. */
export function cleanSharkRecord(r) {
  if (!r || typeof r !== 'object') return null;
  if (!Number.isInteger(r.w) || !fin(r.at, 1e14) || !Array.isArray(r.p) || r.p.length !== 3 || !r.p.every((v) => fin(v, 1e4)) || !fin(r.r, 10)) return null;
  return { w: r.w, at: r.at, p: r.p.slice(), r: r.r };
}
