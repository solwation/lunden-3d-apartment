// #2109: the head leads into a turn, the torso follows, the body leans slightly inwards in fast curves and the head is steadied against the
// running bounce. Pure helpers (no three.js, headless-testable; numbers AVATAR_LEAN in config.js). Everything comes from what the figure
// already renders locally: the body's yaw (the rendered root / motion frame), its ground speed and the gait's own hip bounce and side sway.
// No network field, no bone beyond the existing rig: the result is a few angles added to poseOlof's hips / torso / head.
// #2159: a third term from the forward speed's derivative (`stepAccel`): the torso pitches into a start and back against a sudden stop,
// through a damped spring (a light over-swing), with a braking counterweight for the free arms.
import { AVATAR_LEAN as L, AVATAR_ACCEL_LEAN as AC } from './config.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (v, [a, b]) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const follow = (cur, to, dt, tau) => cur + (to - cur) * (1 - Math.exp(-dt / tau));

/** A fresh state for one avatar. */
export const newLean = () => ({ yaw: null, rate: 0, head: 0, torso: 0, lean: 0, mean: 0, pitch: 0, acc: newAccel(),
  out: { headYaw: 0, headPitch: 0, headRoll: 0, torsoYaw: 0, torsoRoll: 0, hipX: 0, hipRoll: 0, rate: 0, lean: 0, accel: 0, brace: 0 } });

/** #2159: a fresh acceleration-lean state: `v` the slew-limited input speed (null: not started), `f` its low-pass, `a` the filtered
 * acceleration (m/s²), `x` / `xv` the spring's pitch (rad, + forward) and its rate, `target` the pitch the spring pulls towards. */
export const newAccel = () => ({ v: null, f: 0, a: 0, x: 0, xv: 0, target: 0 });

/** #2159: advances the acceleration lean by `dt` s for the forward speed `fwd` m/s (signed, along the body's heading); `on` as in stepLean
 * (off: the speed is only tracked, the pitch springs back to zero). Returns the pitch (rad, + forward): its target stays within
 * [−AC.back, AC.forward], the spring's own swing within AC.overshoot × those. Noise immunity: the input may change by at most AC.slew·dt per frame (a one-frame glitch is cut down to that),
 * is low-passed before and after differentiating and a dead band takes out the playback's ripple; a gap over AC.resetTime restarts the
 * tracking at the current speed. */
export function stepAccel(s, dt, fwd, on = true) {
  if (!(dt > 0)) return s.x;
  const v = Number.isFinite(fwd) ? fwd : 0;
  if (s.v == null || !on || dt > AC.resetTime) { s.v = v; s.f = v; s.a = 0; }
  else {
    const lim = AC.slew * dt;
    s.v += clamp(v - s.v, -lim, lim);
    const f0 = s.f;
    s.f = follow(s.f, s.v, dt, AC.speedTau);
    s.a = follow(s.a, clamp((s.f - f0) / dt, -AC.maxAccel, AC.maxAccel), dt, AC.accelTau);
  }
  const ae = Math.sign(s.a) * Math.max(0, Math.abs(s.a) - AC.dead);
  s.target = on ? clamp(AC.share * Math.atan(ae / 9.81), -AC.back, AC.forward) : 0;
  // the upper body as a damped spring towards the target (semi-implicit Euler in steps of at most 1/120 s: stable for any frame time)
  const h = Math.min(dt, AC.resetTime), n = Math.ceil(h * 120), k = h / n, w = AC.omega;
  for (let i = 0; i < n; i++) {
    s.xv += (w * w * (s.target - s.x) - 2 * AC.zeta * w * s.xv) * k;
    s.x += s.xv * k;
  }
  const fMax = AC.forward * AC.overshoot, bMax = AC.back * AC.overshoot;
  if (s.x > fMax) { s.x = fMax; s.xv = Math.min(0, s.xv); }
  if (s.x < -bMax) { s.x = -bMax; s.xv = Math.max(0, s.xv); }
  return s.x;
}

/** The physical inward lean (rad, + towards the figure's left = a left turn) for ground speed `v` m/s and yaw rate `rate` rad/s, before the share. */
export const physicalLean = (v, rate) => Math.atan(v * rate / 9.81);

/** Advances the state by `dt` s. `yaw` rad: the body's rendered heading (+ turns towards the figure's left, +x); `speed` m/s along the ground;
 * `on`: the ordinary standing / walking ground pose (false in the air, swimming, dancing, crouching, …: everything decays to zero);
 * `bounce` m: the gait's hip drop this frame (+ lower), `sway` m: the gait's hip shift (+ to the left).
 * Returns poseOlof additions: headYaw (rad, the head against the BODY's front, already including the torso's share: subtract torsoYaw for the
 * head bone), headPitch (+ back), headRoll (Euler z, + tips the top to the right), torsoYaw, torsoRoll (+ tips the top to the right), hipX (m, + left),
 * hipRoll (+ lifts the left side). Every output is bounded; a teleport / long gap restarts the rate at zero; straight walking gives zero turn terms.
 * #2159 `fwd` m/s: the forward speed (signed; default `speed`) whose change gives `accel` (rad torso pitch, + forward: subtract it from
 * poseOlof's lean) and `brace` (0 … 1 while braking: the free arms forward as a counterweight, the hips down / back so both knees bend). */
export function stepLean(s, dt, { yaw, speed = 0, on = true, bounce = 0, sway = 0, fwd = speed } = {}) {
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
  o.accel = stepAccel(s.acc ??= newAccel(), dt, fwd, on); // #2159
  o.brace = clamp(-o.accel / AC.back, 0, 1); // (follows the spring: the arms and the knees sink in and come back with the lean)
  return o;
}
