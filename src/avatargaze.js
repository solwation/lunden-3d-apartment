// #2011: pure helpers for the avatars' blinking and living gaze (no three.js, headless-testable; numbers AVATAR_BLINK / AVATAR_GAZE in config.js).
import { AVATAR_BLINK as B, AVATAR_GAZE as G } from './config.js';

const between = (r, [a, b]) => a + (b - a) * r;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** A fresh blink state; `rnd` is Math.random or a seeded stand-in. The first blink comes at a random time so the avatars do not blink in step. */
export const newBlink = (rnd = Math.random) => ({ wait: rnd() * B.interval[1], t: -1, again: false, second: false });

/** Advances the blink by `dt` s; returns how shut the lids are, 0 open … 1 shut (before `depth`). Random 2-6 s apart, sometimes twice. */
export function stepBlink(s, dt, rnd = Math.random) {
  if (s.t < 0) {
    s.wait -= dt;
    if (s.wait > 0) return 0;
    s.t = 0; if (!s.second) s.again = rnd() < B.double; // (the second blink of a double one does not itself start a third)
  } else s.t += dt;
  const total = B.close + B.hold + B.open;
  if (s.t >= total) {
    s.t = -1;
    if (s.again && !s.second) { s.wait = between(rnd(), B.doubleGap); s.second = true; } else { s.wait = between(rnd(), B.interval); s.second = false; s.again = false; }
    return 0;
  }
  return s.t < B.close ? smooth(s.t / B.close) : s.t < B.close + B.hold ? 1 : 1 - smooth((s.t - B.close - B.hold) / B.open);
}

/** The head's extra yaw / pitch (rad) and the eyes' shift (−1 … 1 of AVATAR_GAZE.eye) for a target `yaw` / `pitch` away from the body's
 * front / the level, given the head's own `turn` / `headPitch`. Always within the limits; null target or one too far off the head: all 0. */
export function solveGaze(yaw, pitch, turn, headPitch) {
  const dy = wrap(yaw - turn), dp = pitch - headPitch;
  if (!Number.isFinite(dy + dp) || Math.abs(dy) > G.cone) return { yaw: 0, pitch: 0, ex: 0, ey: 0 };
  const hy = clamp(dy * G.headShare, -G.maxYaw, G.maxYaw), hp = clamp(dp * G.headShare, -G.maxPitch, G.maxPitch);
  return { yaw: hy, pitch: hp, ex: clamp((dy - hy) / G.eyeYaw, -1, 1), ey: clamp((dp - hp) / G.eyePitch, -1, 1) };
}

/** Small random jumps of the irises at rest: `s.x` / `s.y` (m) are the current offset, new ones every AVATAR_GAZE.saccade.interval s. */
export function stepSaccade(s, dt, rnd = Math.random) {
  s.wait = (s.wait ?? 0) - dt;
  if (s.wait <= 0) {
    s.wait = between(rnd(), G.saccade.interval);
    s.x = (rnd() * 2 - 1) * G.saccade.amp[0]; s.y = (rnd() * 2 - 1) * G.saccade.amp[1];
  }
  return s;
}

/** Whom to look at: of `cands` ({ x, y, z, talking, skip }) within AVATAR_GAZE.range m (flat distance) of `from` ({ x, z }), the nearest talking one, else the nearest. -1: none. */
export function chooseGazeTarget(from, cands) {
  let best = -1, bestTalk = false, bestD = G.range * G.range;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (c.skip) continue;
    const d = (c.x - from.x) ** 2 + (c.z - from.z) ** 2;
    if (d > G.range * G.range || d < 1e-4) continue;
    const talk = !!c.talking;
    if (best < 0 || (talk && !bestTalk) || (talk === bestTalk && d < bestD)) { best = i; bestTalk = talk; bestD = d; }
  }
  return best;
}
