import { OUTDOOR_CATS } from './config.js';
import { hash01 } from './outdoorcatroute.js';

// #2182: what an outdoor cat does about birds, as pure functions (no three.js; tests in src/outdoorcatprey.test.mjs). The brain
// (outdoorcatbrain.js) calls them; the numbers are OUTDOOR_CATS.hunt. Birds are never hurt: every leap misses.

const B = OUTDOOR_CATS.brain, H = B.hunt;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

/** 'bird' for a ground bird ({ kind: 'bird' }), otherwise a squirrel (the earlier prey). */
export const preyKind = (p) => (p?.kind === 'bird' ? 'bird' : 'squirrel');

/** The prey a stalking cat goes for: the nearest within `range` m (birds count `birdBias` x their distance) that `clear(x, z)` says it
 * can walk to. Returns { x, z, kind } (a snapshot) or null. */
export function pickPrey(cat, list, clear, range = B.preyRange, h = H) {
  let best = null, bs = Infinity;
  for (const p of list) {
    const d = Math.hypot(p.x - cat.x, p.z - cat.z), kind = preyKind(p), score = d * (kind === 'bird' ? h.birdBias : 1);
    if (d >= range || score >= bs || !clear(p.x, p.z)) continue;
    bs = score; best = { x: p.x, z: p.z, kind };
  }
  return best;
}

/** The nearest bird perched in a tree or on a roof that a cat at `cat` ({ x, z, gy: ground height }) can chatter at: within `range` m
 * on the ground plane and at least `up` m above the ground. Returns { bird, d, pitch (rad up from level, 0 … 0.9) } or null. */
export function pickPerched(cat, list, range = H.chatterRange, up = H.chatterUp) {
  let best = null;
  for (const b of list) {
    const d = Math.hypot(b.x - cat.x, b.z - cat.z), rise = b.y - cat.gy;
    if (d > range || d < 1 || rise < up || (best && d >= best.d)) continue;
    best = { bird: b, d, pitch: clamp(Math.atan2(rise - 0.3, d), 0, 0.9) };
  }
  return best;
}

/** Does the cat chatter during stop `m`? A per-cat, per-stop hash against the chance (curious cats more); the same on every visit. */
export const wantsChatter = (id, m, traits, h = H) => hash01(id, m, 77) < clamp(h.chatterChance * (0.4 + (traits?.curious ?? 0.5)), 0, 1);

/** The leap at prey (px, pz) from (x, z): where it lands (at most 85 % of the way to the prey) and the heading. */
export function leapTo(x, z, px, pz, h = H) {
  const d = Math.hypot(px - x, pz - z) || 1, len = Math.min(h.leapLen, d * 0.85); // (it lands short: a miss)
  return { x: x + (px - x) / d * len, z: z + (pz - z) / d * len, yaw: Math.atan2(px - x, pz - z), len };
}

/** `k` (0 … 1) into a leap: the share of the way covered and the height (m) of the arc (the pounce pose's hop). */
export function leapPose(k, h = H) { return { fwd: smooth(k / 0.75), hop: 0.12 * Math.sin(Math.PI * clamp(k / 0.85, 0, 1)) }; }

/** How a leap at a bird ends. Birds always get away: the cat has nothing in its paws (nothing is ever caught). */
export function leapOutcome() { return { caught: false, missed: true }; }

/** Chatter at `t` s into it: { k: 0 … 1 (the jaw's and tail's burst, 0 between bursts), n: number of the burst, start: first call of
 * a burst (the caller plays the click sound once per n) }. */
export function chatterAt(t, h = H) {
  const n = Math.max(0, Math.floor(t / h.burstEvery)), u = t - n * h.burstEvery;
  return { k: u < h.burst ? Math.sin(Math.PI * u / h.burst) : 0, n, start: u < 1 / 30 };
}
