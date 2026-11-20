// #2161: the remote figure's reach for a door handle or a loose thing, as pure functions (no three.js): a world target becomes a wrist target in
// the figure's frame, a bend (crouch, forward lean, head down) from its height, and a ~0.35 s timeline that returns to rest. Ghost.animate blends
// the hand like the mouth moves (src/avatarmouth.js). Tunables: REACH in config.js. Targets farther than REACH.range or behind are ignored.
import { REACH, AVATAR_CROUCH } from './config.js';

/** Seconds the whole reach lasts. */
export const REACH_TOTAL = REACH.up + REACH.hold + REACH.down;

const smooth = (x) => x * x * (3 - 2 * x);

/** The reach's strength 0 … 1 `age` s after it began: up over REACH.up, held, back down over REACH.down; 0 before and after. */
export function reachWeight(age) {
  const R = REACH, total = REACH_TOTAL;
  if (!Number.isFinite(age) || age <= 0 || age >= total) return 0;
  return age < R.up ? smooth(age / R.up) : age > R.up + R.hold ? smooth((total - age) / R.down) : 1;
}

/** World point [x, y, z] → the figure's frame (+z forward, +x its left, y up from `floorY`) for a figure at (px, pz) facing `yaw` (the root's rotation.y). */
export function toFigureFrame(world, px, pz, yaw, floorY = 0, out = [0, 0, 0]) {
  const dx = world[0] - px, dz = world[2] - pz, c = Math.cos(yaw), s = Math.sin(yaw);
  out[0] = dx * c - dz * s; out[1] = world[1] - floorY; out[2] = dx * s + dz * c;
  return out;
}

/** The bend for a target `h` m above the floor: 0 above REACH.bendFrom, 1 at or below REACH.bendTo. */
export const bendFor = (h) => Math.min(1, Math.max(0, (REACH.bendFrom - h) / (REACH.bendFrom - REACH.bendTo)));

/**
 * The reach at `age` towards the figure-frame point `local`. Returns null when it is not running or the target is out of range / behind;
 * else fills `out` { w, side (-1 right, +1 left), hand: { at, pole }, crouch, lean (forward is negative, like the mouth's lean back), head (pitch, down is negative) }.
 * The wrist goes along the line shoulder → target, at most REACH.arm from the shoulder (the crouch brings the shoulder down to the target).
 */
export function reachPose(local, age, out = { w: 0, side: -1, hand: { at: [0, 0, 0], pole: [0, 0, 0] }, crouch: 0, lean: 0, head: 0 }) {
  const w = reachWeight(age), R = REACH;
  if (!w || !local || local.some((v) => !Number.isFinite(v))) return null;
  const [x, y, z] = local;
  if (z < -0.2 || Math.hypot(x, z) > R.range) return null;
  const bend = bendFor(y), side = x > R.sideX ? 1 : -1; // x < 0 is the right hand
  // the shoulder where the squat and the forward lean put it: hips at 0.86 − hipDrop·c, the torso (R.shoulder − 0.86 long) tipped by lean·c + the reach's own lean
  const c = R.crouch * bend * w, tilt = -AVATAR_CROUCH.lean * c + R.lean * bend * w, torso = R.shoulder - 0.86;
  const sy = 0.86 - AVATAR_CROUCH.hipDrop * c + torso * Math.cos(tilt), sz = AVATAR_CROUCH.hipForward * c + torso * Math.sin(tilt) + 0.02;
  const sx = side * 0.2, dx = x - sx, dy = y - sy, dz = z - sz, d = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, R.arm / d);
  out.w = w; out.side = side; out.crouch = R.crouch * bend * w; out.lean = -R.lean * bend * w; out.head = -R.head * bend * w;
  out.hand.at[0] = sx + dx * k; out.hand.at[1] = sy + dy * k; out.hand.at[2] = sz + dz * k;
  out.hand.pole[0] = side * 0.8; out.hand.pole[1] = -0.5; out.hand.pole[2] = -0.2;
  return out;
}
