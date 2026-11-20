import { CAT_LIFE } from './config.js';

// #2125: the cats' everyday life as pure, bounded helpers (no three.js; node test tools/catlifetest.mjs). cat.js (the ordinary cat and the
// puppets) and outdoorcats.js read them every frame:
// - what a sitting cat does with its idle time (`sitChoice`: grooming, the tail wrapped round its paws, looking about) and which grooming
//   (`groomKind`: the face as before, or the flank), in blocks hashed from the cat's seed and its clock: the same clock gives the same choice
//   (outdoors that clock is the shared wall clock, so every client sees the same thing without sync);
// - its tail (`TailMotion`): a damped spring that trails the body's turns, plus mood flicks that are a pure function of the clock;
// - its ears (`earYaw`, `earTwitch`): turned towards a sound or movement, twitching now and then;
// - a stretch as it gets up after a rest (`stretchPose`) and a low stalking crouch (`CAT_LIFE.crouch`).
// Every output is clamped, finite for any input (NaN / huge dt included), and zero at rest when nothing is happening.

const L = CAT_LIFE;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** A deterministic 0 … 1 from an integer seed and an integer n. */
export function hash01(seed, n) {
  let h = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A seed from a name / number (stable across clients). */
export function seedOf(x) {
  const s = String(x);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

/** What a sitting cat does `t` s into its sitting (its own clock): 'groom' | 'wrap' | 'look'. The first block is always grooming. */
export function sitChoice(seed, t) {
  const b = Math.floor(fin(t) / L.sit.block);
  if (b <= 0) return 'groom';
  const w = L.sit.weights, r = hash01(seed, b) * (w.groom + w.wrap + w.look);
  return r < w.groom ? 'groom' : r < w.groom + w.wrap ? 'wrap' : 'look';
}

/** Which grooming in the 6 s washing cycle at `t`: 'face' (the paw licked and wiped over the face, as before) or 'flank'. */
export function groomKind(seed, t) {
  const c = Math.floor(fin(t) / 6);
  return c > 0 && hash01(seed ^ 0x51ed, c) < L.sit.flank ? 'flank' : 'face';
}

/** The flank lick `c` s into its 6 s cycle: head turned back to the shoulder, licking. { turn (0 … 1), lick (0 … 1) }. */
export function flankLick(c, t) {
  const turn = smooth(0, 0.6, c) * (1 - smooth(3.6, 4.2, c));
  return { turn, lick: turn * (0.5 + 0.5 * Math.sin(fin(t) * 11)) };
}

/** A smooth bump once in a while: windows of 1/rate s, most with one bump of `len` s at a hashed moment, signed. Pure in (seed, t). */
export function bumps(seed, t, rate, len) {
  t = fin(t);
  if (!(rate > 0) || !(len > 0) || t <= 0) return 0;
  const W = Math.max(len * 1.6, 1 / rate), w = Math.floor(t / W);
  if (hash01(seed, w * 2) > 0.75) return 0;
  const start = w * W + hash01(seed, w * 2 + 1) * (W - len), x = (t - start) / len;
  if (x <= 0 || x >= 1) return 0;
  return (hash01(seed ^ 0x2f, w) < 0.5 ? -1 : 1) * Math.sin(Math.PI * x);
}

/** The mood a cat's tail and ears show for an activity / state. */
export function moodOf(activity) {
  switch (activity) {
    case 'sleep': return 'sleep';
    case 'creep': case 'crouch': case 'chatter': return 'stalk';
    case 'pounce': case 'chase': case 'play': return 'play';
    case 'notice': case 'fish': case 'eat': case 'sniff': case 'climb': case 'alert': return 'alert';
    case 'pet': case 'held': case 'nuzzle': case 'happy': return 'happy';
    case 'hurt': case 'scared': case 'flee': case 'cross': return 'cross';
    default: return 'calm';
  }
}

/**
 * The tail's secondary motion (#2125): a damped spring trails the body's turn rate (the tail swings out the other way and settles),
 * mood flicks and a slow sway are pure functions of the clock, and the sum is low-passed so a change of mood never jumps. `bend` (yaw at
 * the tip, rad) and `lift` (rad) stay within CAT_LIFE.tail.max / maxLift for any input.
 */
export class TailMotion {
  constructor(seed = 0) { this.seed = seed | 0; this.x = 0; this.v = 0; this.bend = 0; this.lift = 0; }
  step(dt, { turn = 0, mood = 'calm', t = 0 } = {}) {
    const T = L.tail, M = T.moods[mood] ?? T.moods.calm;
    dt = clamp(fin(dt), 0, 0.25);
    const target = clamp(-fin(turn) * T.follow, -T.max, T.max);
    for (let left = dt; left > 1e-6; left -= 1 / 60) { // (semi-implicit, small steps: stable for any frame time)
      const h = Math.min(left, 1 / 60);
      this.v += (T.stiff * (target - this.x) - T.damp * this.v) * h;
      this.x = clamp(this.x + this.v * h, -T.max, T.max);
    }
    const raw = this.x + M.amp * bumps(this.seed, t, M.rate, M.len) + M.sway * Math.sin(fin(t) * M.hz * 2 * Math.PI + (this.seed & 7));
    const lift = mood === 'alert' || mood === 'stalk' ? T.lift : mood === 'cross' ? -T.lift * 0.5 : 0;
    const k = Math.min(1, dt * 12);
    this.bend = clamp(this.bend + (clamp(raw, -T.max, T.max) - this.bend) * k, -T.max, T.max);
    this.lift = clamp(this.lift + (lift - this.lift) * k, -T.maxLift, T.maxLift);
    return this;
  }
}

/** The yaw (rad) an ear on `side` (−1 / +1 = the cat's −x / +x) turns to for a stimulus at `rel` rad in the head's frame (atan2 of its
 * local x, z; null = none): outwards up to `max`, inwards less. */
export function earYaw(rel, side) {
  if (rel == null || !Number.isFinite(rel)) return 0;
  const a = Math.atan2(Math.sin(rel), Math.cos(rel)), M = L.ears.max;
  // behind the cat: the ear on that side swivels round as far as it goes
  const out = side > 0 ? clamp(a, -0.35 * M, M) : clamp(a, -M, 0.35 * M);
  return out;
}

/** A small ear twitch now and then (rad), pure in (seed, side, t). */
export function earTwitch(seed, side, t) {
  return L.ears.twitchAmp * Math.abs(bumps(seed ^ (side > 0 ? 0x1ea7 : 0x7e11), t, L.ears.twitch, 0.18)) * side;
}

/** Move `cur` towards `to` by at most `step`. */
export const approach = (cur, to, step) => fin(cur) + clamp(fin(to) - fin(cur), -Math.abs(fin(step)), Math.abs(fin(step)));

/** The stretch `u` (0 … 1) of the way through: front legs reaching out, chest down, bottom up; 0 at both ends. */
export function stretchPose(u) {
  u = clamp(fin(u), 0, 1);
  const k = smooth(0, 0.3, u) * (1 - smooth(0.7, 1, u)), S = L.stretch;
  return { k, bow: S.bow * k, chest: S.chest * k, reach: S.reach * k };
}
