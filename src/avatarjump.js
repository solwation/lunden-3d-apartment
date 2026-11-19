// #2140: the ordinary jump on a figure. Pure helpers (no three.js): from the vertical speed and the height over the ground they give a jump
// phase and the amounts Avatar.update poses with (crouch before take-off, legs tucked on the way up and stretched on the way down, arms out
// for balance, flailing arms after a long fall, hips compressing and springing back on landing by the fall height). No wire field: a remote figure's snapshots
// are drawn 200 ms late, so `aheadSample` can see the take-off coming. Tunables: AVATAR_JUMP (src/config.js).
import { AVATAR_JUMP as J } from './config.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Fresh state for `stepJump`. */
export const newJump = () => ({ phase: 'ground', air: 0, h: 0, peak: 0, antic: 0, landT: -1, landDepth: 0, out: { phase: 'ground', air: 0, tuck: 0, extend: 0, arms: 0, flail: 0, dip: 0, lean: 0 } });

/** The hips' compression (m) after a fall from `fall` m over the ground (a small jump .. a long drop). */
export const landDepth = (fall) => J.land.min + (J.land.max - J.land.min) * clamp01(fall / J.land.full);

/** Airborne now? `height` m over the ground below (NaN: unknown) and `vy` m/s. */
export function airborne(vy, height) {
  if (Number.isFinite(height)) return height > J.airHeight || vy > J.takeoffVy;
  return vy > J.takeoffVy || vy < -J.fallVy;
}

/** The jump phase from `vy` and `height` alone: 'ground', 'rise' or 'fall' ('crouch' when `ahead` ({ vy, height }, the figure a moment on)
 * leaves the ground, 'land' is time in `stepJump`). */
export function jumpPhase(vy, height, ahead = null) {
  if (airborne(vy, height)) return vy > 0.3 ? 'rise' : 'fall';
  return ahead && airborne(ahead.vy, ahead.height) && ahead.vy > J.anticipateVy ? 'crouch' : 'ground';
}

/** The figure `lead` s after `at` ms in `snaps` ([{ t, p: { x, y, z } }] oldest first): { x, y, z, vy } or null when the snapshots do not reach it. */
export function aheadSample(snaps, at, lead = J.lead) {
  const t = at + lead * 1000;
  for (let i = snaps.length - 1; i > 0; i--) {
    const a = snaps[i - 1], b = snaps[i];
    if (a.t <= t && t <= b.t) {
      const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t), sec = (b.t - a.t) / 1000;
      return { x: a.p.x + (b.p.x - a.p.x) * k, y: a.p.y + (b.p.y - a.p.y) * k, z: a.p.z + (b.p.z - a.p.z) * k, vy: sec ? (b.p.y - a.p.y) / sec : 0 };
    }
  }
  return null;
}

/** Advance the state `s` by `dt` s. `inp`: { vy, height (NaN: unknown), ahead ({ vy, height } or null), off (jetpack / swimming / climbing / flying / sitting: no jump pose) }.
 * Returns `s.out` (reused): phase, `air` 0..1 (the legs leave the gait), `tuck`, `extend`, `arms`, `flail` 0..1, `dip` (hips down, m) and `lean` (rad). */
export function stepJump(s, dt, inp) {
  const { vy = 0, height = NaN, ahead = null, off = false } = inp, o = s.out;
  const up = !off && airborne(vy, height);
  if (up) {
    s.h = Number.isFinite(height) ? Math.max(0, height) : Math.max(0, s.h + vy * dt);
    s.peak = Math.max(s.peak, s.h);
    s.landT = -1;
  } else if (s.phase === 'rise' || s.phase === 'fall') { // touched down
    if (!off && s.peak > J.land.min) { s.landT = 0; s.landDepth = landDepth(s.peak); }
    s.peak = s.h = 0;
  } else s.h = 0;
  if (s.landT >= 0) { s.landT += dt; if (s.landT > 1.2) s.landT = -1; }
  s.phase = off ? 'ground' : jumpPhase(vy, height, ahead);
  if (s.phase === 'crouch' && s.landT >= 0) s.phase = 'ground';
  const e = 1 - Math.exp(-J.ease * dt), ec = 1 - Math.exp(-J.crouchEase * dt);
  s.air += ((up ? 1 : 0) - s.air) * e;
  s.antic += ((s.phase === 'crouch' ? 1 : 0) - s.antic) * ec;
  const rising = vy > 0, fallK = rising ? 0 : clamp01(-vy / J.extendVy);
  o.phase = s.landT >= 0 ? 'land' : s.phase;
  o.air = s.air;
  o.tuck = s.air * (rising ? 1 : 1 - clamp01(fallK / 0.6));
  o.extend = s.air * fallK;
  o.arms = s.air * J.arms.amount;
  o.flail = up && !rising && -vy > J.flail.minVy ? s.air * clamp01((s.peak - J.flail.fall) / (J.flail.full - J.flail.fall)) * clamp01(-vy / J.flail.minVy - 0.5) : 0;
  const L = J.land, spring = s.landT >= 0 ? s.landDepth * (1 - Math.exp(-L.attack * s.landT)) * Math.exp(-L.damp * s.landT) : 0;
  o.dip = s.antic * J.crouch.dip + spring;
  o.lean = s.antic * J.crouch.lean + (s.landT >= 0 ? L.lean * spring / L.max : 0);
  return o;
}
