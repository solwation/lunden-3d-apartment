// #2035: a standing avatar's living rest. Pure helpers (no three.js, headless-testable; numbers AVATAR_IDLE in config.js).
// While a figure stands still its weight moves from leg to leg (the hips shift and tilt, the free knee bends), it glances around now and
// then, and after a while it crosses its arms, puts its hands in its pockets or stretches. Everything comes from the time standing still
// and a random stream seeded per player, so two avatars never move in step and no network field is needed. The feet are not touched:
// the planted ground targets (#2003 / #2015) stay where they are and the leg IK follows the hips.
import { AVATAR_IDLE as I } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const follow = (cur, goal, dt, rate) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));

/** A 32-bit seed from any text (FNV-1a): the same player always gets the same rest, different players different ones. */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** The seeded random stream (mulberry32), its state kept in `s.r`. */
function rnd(s) {
  let t = (s.r = (s.r + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (s, [a, b]) => a + (b - a) * rnd(s);

export const GESTURES = ['cross', 'pockets', 'stretch'];

/** A fresh rest state for one avatar. `seed`: a number or any text (the player's id). */
export function newIdle(seed) {
  const s = { r: typeof seed === 'number' ? seed >>> 0 : seedOf(seed), live: 0, still: 0, quiet: 0, prev: null,
    w: 0, wFrom: 0, wTo: 0, wT: 1, wDur: 1, wWait: 0,
    glance: null, glanceWait: 0, side: 1, lookOn: 0,
    act: null, actWait: 0, after: 0, bag: [], last: '', armsOn: 1,
    seen: new Set(), // which variations have happened (tests / verification): 'weight', 'look', and the gestures
    out: { hipX: 0, hipY: 0, roll: 0, torsoRoll: 0, turn: 0, head: 0, lean: 0, amt: 0, kind: '', w: 0 } };
  restart(s);
  return s;
}

/** Standing still starts again: the first shift, glance and gesture come after their own seeded waits. */
function restart(s) {
  s.still = 0; s.wWait = between(s, I.weight.first); s.glanceWait = between(s, I.look.first);
  s.after = between(s, I.gesture.after); s.actWait = 0;
}

/** The next gesture: each of the three once in a seeded order before any repeats, never the same twice in a row. */
function nextGesture(s) {
  if (!s.bag.length) {
    s.bag = GESTURES.slice();
    for (let i = s.bag.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [s.bag[i], s.bag[j]] = [s.bag[j], s.bag[i]]; }
    if (s.bag[s.bag.length - 1] === s.last) s.bag.unshift(s.bag.pop());
  }
  return s.bag.pop();
}

/** How far a gesture is in (0 … 1) at its age `t`. */
function gestureAmount(a) {
  if (a.kind === 'stretch') { const S = I.stretch; return a.t < S.up ? smooth(a.t / S.up) : a.t < S.up + S.top ? 1 : 1 - smooth((a.t - S.up - S.top) / S.down); }
  const b = I.gesture.blend; return Math.min(smooth(a.t / b), 1 - smooth((a.t - a.dur + b) / b));
}

/**
 * Advances the rest by `dt` s and returns `s.out`: hipX (m, toward the figure's left), hipY (m), roll (rad, the hips: + lifts the left
 * side), torsoRoll (rad, the shoulders), turn / head / lean (rad, added to the head's yaw, the head's pitch back and the torso's lean back),
 * amt (0 … 1, how far the hands follow `idleHands`) and kind (the current gesture, '' none).
 * `on`: the figure stands still on its feet (no walk, crouch, seat, dance, swim …); `weight` 0 … 1 scales it all (the gait / crouch blend);
 * `arms`: both hands are free (nothing held, no wave); `look`: it may glance around (nobody looked at, #2011); `turn` / `pitch`: the
 * player's own view (rad), whose turning postpones a glance.
 */
export function stepIdle(s, dt, { on = false, weight = 1, arms = true, look = true, turn = 0, pitch = 0 } = {}) {
  const o = s.out;
  s.live = follow(s.live, on ? 1 : 0, dt, I.live);
  // the player's own view: turning it is not standing idle for the head
  if (s.prev && dt > 0 && (Math.abs(turn - s.prev[0]) + Math.abs(pitch - s.prev[1])) / dt > I.look.input) s.quiet = 0; else s.quiet += dt;
  (s.prev ??= [0, 0])[0] = turn; s.prev[1] = pitch;
  if (!on) {
    if (s.still > 0) restart(s);
    s.w *= Math.exp(-I.live * dt); s.wFrom = s.wTo = 0; s.wT = s.wDur = 1;
    if (s.live < 0.01) { s.glance = null; s.act = null; }
  } else {
    s.still += dt;
    // weight shift: ease to the new side, rest there, then move on (mostly to the other leg, sometimes back onto both)
    if (s.wT < s.wDur) { s.wT = Math.min(s.wDur, s.wT + dt); s.w = s.wFrom + (s.wTo - s.wFrom) * smooth(s.wT / s.wDur); }
    else if ((s.wWait -= dt) <= 0) {
      const side = s.wTo ? -Math.sign(s.wTo) : rnd(s) < 0.5 ? 1 : -1;
      s.wFrom = s.w; s.wTo = s.wTo && rnd(s) < I.weight.centre ? 0 : side * between(s, I.weight.amount);
      s.wT = 0; s.wDur = between(s, I.weight.move); s.wWait = between(s, I.weight.hold);
      if (s.wTo) s.seen.add('weight');
    }
  }
  // a glance around, only while the player leaves the view alone and nobody is looked at
  const free = look && s.quiet > I.look.quiet;
  s.lookOn = follow(s.lookOn, free ? 1 : 0, dt, I.look.fade);
  if (on && free && !s.glance && (s.glanceWait -= dt) <= 0) {
    s.side = rnd(s) < 0.7 ? -s.side : s.side;
    s.glance = { yaw: s.side * between(s, I.look.yaw), pitch: between(s, I.look.pitch), hold: between(s, I.look.hold), t: 0 };
    s.seen.add('look');
  }
  let ge = 0;
  if (s.glance) {
    const g = s.glance; g.t += dt;
    ge = g.t < I.look.inT ? smooth(g.t / I.look.inT) : g.t < I.look.inT + g.hold ? 1 : 1 - smooth((g.t - I.look.inT - g.hold) / I.look.outT);
    if (g.t >= I.look.inT + g.hold + I.look.outT || (!free && s.lookOn < 0.01)) { s.glance = null; ge = 0; s.glanceWait = between(s, I.look.wait); }
  }
  // the arms: crossed, in the pockets or a stretch, after a while of standing still
  s.armsOn = follow(s.armsOn, arms ? 1 : 0, dt, I.gesture.cancel);
  if (!arms && s.armsOn < 0.01) s.act = null;
  if (s.act) {
    s.act.t += dt;
    if (s.act.t >= s.act.dur) { s.last = s.act.kind; s.act = null; s.actWait = between(s, I.gesture.gap); }
  } else if (on && arms && s.still > s.after && (s.actWait -= dt) <= 0) {
    const kind = nextGesture(s), S = I.stretch;
    s.act = { kind, t: 0, dur: kind === 'stretch' ? S.up + S.top + S.down : between(s, I.gesture.hold) };
    s.seen.add(kind);
  }
  const k = s.live * clamp(weight, 0, 1), ga = s.act ? gestureAmount(s.act) * s.armsOn : 0;
  const stretch = s.act?.kind === 'stretch' ? ga : 0, W = I.weight;
  o.w = s.w;
  o.hipX = W.shift * s.w * k; o.roll = W.roll * s.w * k; o.hipY = -W.drop * Math.abs(s.w) * k; o.torsoRoll = -W.counter * o.roll;
  o.turn = s.glance ? s.glance.yaw * ge * s.lookOn * k : 0;
  o.head = (s.glance ? s.glance.pitch * ge * s.lookOn : 0) * k + I.stretch.head * stretch * k;
  o.lean = I.stretch.lean * stretch * k;
  o.amt = ga * k; o.kind = s.act?.kind ?? '';
  return o;
}

/** The two wrist targets ({ at, pole } in the figure's frame, L = +x first) of the current gesture, for hips at `hipY` m (the shoulders
 * are `shoulder` m above them). `out` is reused. */
export function idleHands(kind, hipY, shoulder, out = [{ at: [0, 0, 0], pole: [0, 0, 0] }, { at: [0, 0, 0], pole: [0, 0, 0] }]) {
  const set = (h, x, y, z, px, py, pz) => { h.at[0] = x; h.at[1] = y; h.at[2] = z; h.pole[0] = px; h.pole[1] = py; h.pole[2] = pz; };
  const sy = hipY + shoulder;
  if (kind === 'cross') { // the forearms folded across the chest, the right one over the left, each hand at the other upper arm
    set(out[0], -0.1, sy - 0.2, 0.17, 1, -0.6, 0.15);
    set(out[1], 0.11, sy - 0.18, 0.2, -1, -0.6, 0.15);
  } else if (kind === 'pockets') { // the hands in the front pockets, the elbows out and back
    set(out[0], 0.155, hipY + 0.05, 0.075, 0.6, -0.1, -1);
    set(out[1], -0.155, hipY + 0.05, 0.075, -0.6, -0.1, -1);
  } else { // 'stretch': the hands meet overhead, the elbows out
    set(out[0], 0.05, sy + 0.5, -0.02, 1, 0.1, -0.2);
    set(out[1], -0.05, sy + 0.5, -0.02, -1, 0.1, -0.2);
  }
  return out;
}
