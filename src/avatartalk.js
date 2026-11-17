// #2038 (part of #2030): small conversational gestures while a figure talks. Derived locally from the talking mouth (#1122,
// `avatar.talking`): no network field. Now and then a free hand lifts a little towards the listener and opens, the head nods with it,
// and the head tilts slowly; everything is weighted by a talking amount that eases in and back to exactly 0 once the talk ends.
// Additive offsets on the pose avatar.js already builds (a hand target held by something else — an item, a weapon, a wave — is never
// moved). Pure logic so tools/avatartalktest.mjs can check it under node.
import { AVATAR_TALK as T } from './config.js';

function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const between = (r, [a, b]) => a + (b - a) * r;

/** A figure's talk state. `out`: `amt` (0 … 1), `head` (rad added to the head's pitch: negative nods down), `tilt` (rad, the head's roll),
 * `hand` [L, R] offsets [x, y, z] in the figure's frame (+x its left, +z forward), `open` [L, R] the share of each hand's curl that opens. */
export function newTalk(seed = Math.floor(Math.random() * 2 ** 32)) {
  const rnd = seeded(seed);
  return { rnd, amt: 0, time: 0, phase: rnd() * Math.PI * 2, wait: 0.5, g: null, nodT: 9, nodAmp: 0,
    out: { amt: 0, head: 0, tilt: 0, hand: [[0, 0, 0], [0, 0, 0]], open: [0, 0] } };
}

/** One step of `dt` s. `talking`: the figure is talking now; `mouth` its mouth opening (0 … 1); `free` [L, R] whether each hand may
 * gesture; `quiet` 0 … 1 mutes the gestures (running, crouching; 1 for poses that own the body: dancing, swimming, a kiss …). */
export function stepTalk(s, dt, { talking = false, mouth = 0, free = [true, true], quiet = 0 } = {}) {
  dt = Math.max(0, Math.min(dt, 0.25));
  const goal = talking ? Math.max(0, 1 - quiet) : 0, rate = goal > s.amt ? T.rise : T.fall;
  s.amt += (goal - s.amt) * (1 - Math.exp(-rate * dt));
  if (goal === 0 && s.amt < 0.004) s.amt = 0;
  s.time += dt;
  const o = s.out;
  if (!s.amt) { // quiet again: no offsets at all, the next talk starts afresh
    s.g = null; s.wait = 0.5; s.nodT = 9;
    o.amt = o.head = o.tilt = 0; o.open[0] = o.open[1] = 0;
    for (const h of o.hand) h[0] = h[1] = h[2] = 0;
    return o;
  }
  if (s.g) { s.g.t += dt; if (s.g.t >= s.g.dur) { s.g = null; s.wait = between(s.rnd(), T.gap); } }
  else if (goal > 0 && (s.wait -= dt) <= 0) { // a new gesture: mostly the right hand, sometimes the left or both
    const r = s.rnd(), sides = r < T.both ? [1, 1] : r < T.both + T.left ? [1, 0] : [0, 1];
    s.g = { t: 0, dur: between(s.rnd(), T.dur), amp: between(s.rnd(), T.amp), sides };
    s.nodT = 0; s.nodAmp = between(s.rnd(), T.amp);
  }
  s.nodT += dt;
  const g = s.g, env = g ? 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, g.t / g.dur)) : 0;
  const nod = s.nodT < T.nodDur ? Math.sin(Math.PI * s.nodT / T.nodDur) * s.nodAmp : 0;
  o.amt = s.amt;
  o.head = -T.nod * nod * s.amt;
  o.tilt = T.tilt * s.amt * Math.sin(2 * Math.PI * T.tiltHz * s.time + s.phase);
  for (let i = 0; i < 2; i++) {
    const h = o.hand[i];
    if (!free[i]) { h[0] = h[1] = h[2] = 0; o.open[i] = 0; continue; }
    const sx = i ? -1 : 1, w = (g ? env * g.amp * g.sides[i] : 0) + T.rest * (i ? 1 : T.restLeft), k = w * s.amt;
    h[0] = -sx * T.lift[0] * k; // towards the middle
    h[1] = T.lift[1] * k + T.beat * mouth * env * s.amt * (g?.sides[i] ?? 0);
    h[2] = T.lift[2] * k;
    o.open[i] = Math.min(1, T.open * k);
  }
  return o;
}

/** A hand target `{ at, pole }` moved by offset `d` (a new object; `hand` is left as it is). */
export function talkHand(hand, d) {
  if (!d[0] && !d[1] && !d[2]) return hand;
  return { at: [hand.at[0] + d[0], hand.at[1] + d[1], hand.at[2] + d[2]], pole: hand.pole };
}
