// #2148: bicycle riding motion from what every peer already sees: speed, yaw rate and slope. Pure (no three.js): a cadence from
// the speed and an auto-shifting gear, the freewheel when coasting / slowing, lean into a curve, pitch on a slope, standing on a
// steep climb, the fork's steering angle and where the hands sit on the turned handlebar. Also classifies the bicycle model's
// vertices (wheels, crank, pedals, steered parts) so that one vertex shader (ghostprops.js) or the own bike's CPU rewrite
// (courtyard.js) can turn them without any extra draw call.
import { BIKE_RIDE as R } from './config.js';

const TAU = Math.PI * 2, G = 9.81;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const newBikeRide = () => ({ wheel: 0, crank: 0, crankRate: 0, roll: 0, pitch: 0, steer: 0, stand: 0, accel: 0, yawRate: 0, slope: 0, speed: 0, freewheel: false, ready: false });

/** Wheel revolutions per crank revolution at `speed` m/s (an auto-shifting gear). */
export const gearRatio = (speed) => clamp(R.gear.low + Math.abs(fin(speed)) * R.gear.perSpeed, R.gear.low, R.gear.high);
/** Crank angular speed (rad/s) when pedalling at `speed` m/s. */
export const cadenceRate = (speed) => Math.abs(fin(speed)) / R.wheelRadius / gearRatio(speed);

/**
 * One frame. `speed` m/s (forward positive), `yawRate` rad/s (turning left positive, the camera-yaw convention), `slope` rad (uphill positive).
 * Mutates and returns `s`: wheel / crank angles (rad; the wheel's is negative going forward, about the bike's z), roll (rad, top toward
 * the right positive, about the bike's forward axis), pitch (nose up positive), steer (rad, left positive, about the vertical), stand (0 … 1).
 */
export function stepBikeRide(s, dt, speed, yawRate, slope) {
  dt = clamp(fin(dt), 0, 0.1);
  speed = clamp(fin(speed), -3, 14); yawRate = clamp(fin(yawRate), -6, 6); slope = clamp(fin(slope), -R.pitchMax, R.pitchMax);
  if (!s.ready) { s.ready = true; s.speed = speed; s.yawRate = yawRate; s.slope = slope; }
  if (dt === 0) return s;
  const accel = (speed - s.speed) / dt;
  s.accel += (clamp(accel, -15, 15) - s.accel) * ease(1 / R.accelTau, dt);
  s.yawRate += (yawRate - s.yawRate) * ease(1 / R.yawTau, dt);
  s.slope += (slope - s.slope) * ease(1 / R.slopeTau, dt);
  s.speed = speed;
  s.wheel = (s.wheel - speed / R.wheelRadius * dt) % TAU;
  s.freewheel = speed < 0.3 || s.accel < -R.freewheelDecel || s.slope < -R.freewheelSlope;
  const want = s.freewheel ? 0 : cadenceRate(speed);
  s.crankRate += (want - s.crankRate) * ease(R.crankEase, dt);
  if (s.crankRate < 0.02 && want === 0) s.crankRate = 0;
  s.crank = (s.crank + s.crankRate * dt) % TAU;
  const v = Math.abs(speed);
  const lean = clamp(Math.atan(v * s.yawRate / G) * R.leanGain, -R.leanMax, R.leanMax);
  s.stand += (smooth(R.stand.from, R.stand.to, s.slope) * (s.freewheel ? 0 : 1) - s.stand) * ease(R.stand.ease, dt);
  const rock = R.stand.rock * s.stand * Math.sin(s.crank);
  s.roll += (-lean + rock - s.roll) * ease(R.leanEase, dt);
  s.pitch += (s.slope - s.pitch) * ease(R.leanEase, dt);
  const steer = clamp(Math.atan(R.wheelbase * s.yawRate / Math.max(1.5, v)), -R.steerMax, R.steerMax);
  s.steer += (steer - s.steer) * ease(R.steerEase, dt);
  return s;
}

/** The hand on `side` (+1 left, -1 right, the figure's frame: x left, z forward) on the grip of a handlebar steered by `steer` rad. */
export function bikeGrip(side, steer, out = [0, 0, 0]) {
  const dx = R.gripX - R.steerPivotX, dz = -side * R.gripZ, c = Math.cos(steer), n = Math.sin(steer); // (the bike's z is right)
  out[0] = -(-dx * n + dz * c); out[1] = R.gripY; out[2] = R.steerPivotX + dx * c + dz * n;
  return out;
}

/** The rider's seat: the hip [y, z] and torso lean, the standing climb blended in by `stand`. */
export function bikeSeat(stand, hip = [0, 0], base = { hip: [0.86, -0.12], lean: -0.45 }) {
  hip[0] = base.hip[0] + (R.stand.hip[0] - base.hip[0]) * stand; hip[1] = base.hip[1] + (R.stand.hip[1] - base.hip[1]) * stand;
  return { hip, lean: base.lean + (R.stand.lean - base.lean) * stand };
}

// Vertex parts: 0 fixed, 1 rear wheel, 2 front wheel, 3 crank (arms, chainring), 4 pedal; `steered` marks what turns with the handlebar.
const HUB_R = -0.5, HUB_F = 0.42, HUB_Y = 0.34, CRANK = [-0.05, 0.36];
/** Classify the vertices of one of bikeGeometry()'s parts ('frame' | 'tyres' | 'metal' | 'spokes', or 'any' by position alone): `parts` (Uint8) and `steered` (Uint8). */
export function bikeVertexParts(positions, kind, count = positions.length / 3, parts = new Uint8Array(count), steered = new Uint8Array(count)) {
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    let part = 0, steer = 0;
    if (kind === 'frame') steer = x > 0.28 ? 1 : 0;
    else if (kind === 'tyres') { if (y > 0.7) steer = 1; else { part = x > 0 ? 2 : 1; steer = part === 2 ? 1 : 0; } }
    else if (kind === 'spokes') { part = x > 0 ? 2 : 1; steer = part === 2 ? 1 : 0; }
    else if (kind === 'any') { // a part of unknown kind (the garage's detached bikes): by position only
      if (Math.abs(z) < 0.03 && Math.hypot(x - HUB_F, y - HUB_Y) < 0.36) { part = 2; steer = 1; }
      else if (Math.abs(z) < 0.03 && Math.hypot(x - HUB_R, y - HUB_Y) < 0.36) part = 1;
      else if (z > 0.075 && Math.hypot(x - CRANK[0], y - CRANK[1]) < 0.2) part = Math.abs(x - CRANK[0]) > 0.03 ? 4 : 3;
      else if (x > 0.28) steer = 1;
    } else if (kind === 'metal') {
      if (Math.abs(z) < 0.056 && Math.hypot(x - HUB_F, y - HUB_Y) < 0.36) { part = 2; steer = 1; }
      else if (Math.abs(z) < 0.056 && Math.hypot(x - HUB_R, y - HUB_Y) < 0.36) part = 1;
      else if (z > 0.05 && Math.hypot(x - CRANK[0], y - CRANK[1]) < 0.2) part = z > 0.0885 && Math.abs(x - CRANK[0]) > 0.03 ? 4 : 3;
    }
    parts[i] = part; steered[i] = steer;
  }
  return { parts, steered };
}

/** Turn one vertex (bike frame) by `wheel` / `crank` / `steer` as the vertex shader does; `out` may alias `v`. Used by the own bike's CPU rewrite and the tests. */
export function bikeVertexAt(v, part, steered, wheel, crank, steer, out = [0, 0, 0]) {
  let [x, y, z] = v;
  const rot = (cx, cy, a) => { const c = Math.cos(a), n = Math.sin(a), dx = x - cx, dy = y - cy; x = cx + dx * c - dy * n; y = cy + dx * n + dy * c; };
  if (part === 1) rot(HUB_R, HUB_Y, wheel);
  else if (part === 2) rot(HUB_F, HUB_Y, wheel);
  else if (part === 3) rot(CRANK[0], CRANK[1], crank);
  else if (part === 4) { // the pedal's centre travels with the crank, the box itself stays level
    const c0y = v[1] > CRANK[1] ? 0.53 : 0.19, c = Math.cos(crank), n = Math.sin(crank), dy = c0y - CRANK[1];
    x = CRANK[0] - dy * n + (v[0] - CRANK[0]); y = CRANK[1] + dy * c + (v[1] - c0y);
  }
  if (steered) { const c = Math.cos(steer), n = Math.sin(steer), dx = x - R.steerPivotX; x = R.steerPivotX + dx * c + z * n; z = -dx * n + z * c; }
  out[0] = x; out[1] = y; out[2] = z; return out;
}
