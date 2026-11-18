// #2109: the head leads into a turn, the torso follows, the body leans slightly inwards in fast curves and the head is steadied against the
// running bounce. Pure helpers (no three.js, headless-testable; numbers AVATAR_LEAN in config.js). Everything comes from what the figure
// already renders locally: the body's yaw (the rendered root / motion frame), its ground speed and the gait's own hip bounce and side sway.
// No network field, no bone beyond the existing rig: the result is a few angles added to poseOlof's hips / torso / head.
import { AVATAR_LEAN as L } from './config.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (v, [a, b]) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const follow = (cur, to, dt, tau) => cur + (to - cur) * (1 - Math.exp(-dt / tau));

/** A fresh state for one avatar. */
export const newLean = () => ({ yaw: null, rate: 0, head: 0, torso: 0, lean: 0, mean: 0, pitch: 0,
  out: { headYaw: 0, headPitch: 0, headRoll: 0, torsoYaw: 0, torsoRoll: 0, hipX: 0, hipRoll: 0, rate: 0, lean: 0 } });

/** The physical inward lean (rad, + towards the figure's left = a left turn) for ground speed `v` m/s and yaw rate `rate` rad/s, before the share. */
export const physicalLean = (v, rate) => Math.atan(v * rate / 9.81);

/** Advances the state by `dt` s. `yaw` rad: the body's rendered heading (+ turns towards the figure's left, +x); `speed` m/s along the ground;
 * `on`: the ordinary standing / walking ground pose (false in the air, swimming, dancing, crouching, …: everything decays to zero);
 * `bounce` m: the gait's hip drop this frame (+ lower), `sway` m: the gait's hip shift (+ to the left).
 * Returns poseOlof additions: headYaw (rad, the head against the BODY's front, already including the torso's share: subtract torsoYaw for the
 * head bone), headPitch (+ back), headRoll (Euler z, + tips the top to the right), torsoYaw, torsoRoll (+ tips the top to the right), hipX (m, + left),
 * hipRoll (+ lifts the left side). Every output is bounded; a teleport / long gap restarts the rate at zero; straight walking gives zero turn terms. */
export function stepLean(s, dt, { yaw, speed = 0, on = true, bounce = 0, sway = 0 } = {}) {
  const o = s.out;
  if (!(dt > 0)) return o;
  const w = on ? smooth(speed, L.speed) : 0;
  let raw = 0;
  if (Number.isFinite(yaw) && s.yaw != null) {
    const d = wrap(yaw - s.yaw);
    if (Math.abs(d) > L.resetTurn || dt > L.resetTime) s.rate = 0;
    else raw = clamp(d / dt, -L.maxRate, L.maxRate);
  }
  if (Number.isFinite(yaw)) s.yaw = yaw;
  s.rate = follow(s.rate, raw, Math.min(dt, L.resetTime), L.rateTau);
  const r = s.rate * w, h = Math.min(dt, L.resetTime);
  // the head looks ahead into the turn quickly; the torso turns less and later (it follows the head); both relative to the hips / feet
  s.head = follow(s.head, clamp(L.head.share * r, -L.head.max, L.head.max), h, L.head.tau);
  s.torso = follow(s.torso, clamp(L.torso.share * r, -L.torso.max, L.torso.max), h, L.torso.tau);
  // the inward lean of a curve: a share of what the centripetal acceleration v·ω asks for, so only fast curves lean visibly
  s.lean = follow(s.lean, clamp(L.lean.share * physicalLean(on ? speed : 0, r), -L.lean.max, L.lean.max), h, L.lean.tau);
  // the head is held on a point `distance` ahead against the hip bounce: lower than its running mean → it pitches up a little
  const sb = on ? bounce : 0;
  s.mean = follow(s.mean, sb, h, L.stab.meanTau);
  s.pitch = clamp(Math.atan((sb - s.mean) / L.stab.distance), -L.stab.max, L.stab.max) * w;
  const counter = on ? L.stab.sway * Math.atan(sway / L.stab.torso) * w : 0; // the shoulders tilt back over the line as the hips sway out
  const lean = s.lean;
  o.headYaw = s.head; o.torsoYaw = s.torso;
  o.hipX = L.lean.hipShare * L.lean.hipHeight * Math.sin(lean);
  o.hipRoll = -L.lean.hipRoll * lean;
  o.torsoRoll = -lean + counter;
  o.headRoll = L.lean.headRight * lean - counter;
  o.headPitch = s.pitch;
  o.rate = s.rate; o.lean = lean;
  return o;
}
