import { SWIM } from './config.js';

// #1943: swimming in Höje å, the pure rules (no three.js, no terrain: a node test runs them, src/swim.test.mjs).
// The river frame comes from riverbridge.js `riverAt(x, z)`: { x, z (nearest centre-line point), nx, nz (the segment's normal), distance,
// along (m from the path's east end) }. The path (SITE.river.path + downstream.path) runs from the east edge (upstream, towards Malmövägen)
// to the west edge, and the water level falls with `along` (riverbridge.js `waterYAt`), so DOWNSTREAM is the path's own direction:
// the tangent (nz, -nx). `current(r)` is the one place that says so; #1944-#1947 (diving, fish, sharks) read the flow from here.
// player.js `swimStep` moves the swimmer with these and owns the collision / terrain side.

/** The unit direction the water flows at river frame `r` (downstream along the centre line). */
export function currentDir(r, o = {}) {
  o.x = r.nz; o.z = -r.nx;
  return o;
}

/** The water's velocity (m/s) at river frame `r`. */
export function current(r, o = {}, C = SWIM) {
  currentDir(r, o); o.x *= C.current; o.z *= C.current;
  return o;
}

/** A swimmer's ground velocity (m/s): the own stroke towards the unit input direction (ix, iz) at `amount` 0 … 1 of SWIM.speed, plus the
 * current. Sprinting and crouching change nothing in the water. `o.sx, o.sz` the stroke's part, `o.cx, o.cz` the current's, `o.x, o.z` the sum. */
export function swimVelocity(ix, iz, amount, r, o = {}, C = SWIM) {
  const a = Math.max(0, Math.min(1, amount)), m = Math.hypot(ix, iz), k = m > 0 ? (C.speed * a) / m : 0;
  o.sx = ix * k; o.sz = iz * k;
  current(r, o, C); o.cx = o.x; o.cz = o.z;
  o.x += o.sx; o.z += o.sz;
  return o;
}

/** What a swimmer at the water's edge does this frame. `st` = { stuck } (s, kept by the caller between frames), `blocked`: the stroke was
 * stopped by the edge of the water (a bank, shallows), `pushing`: there is input, `bank`: a walkable bank spot was found within reach.
 * Returns 'swim' (nothing), 'climb' (go up to `bank`) or 'rescue' (SWIM.rescueAfter s against an edge with no way up: the old #1281 rescue,
 * so nobody stays stuck in the water). */
export function exitDecision(st, { blocked, pushing, bank, dt }, C = SWIM) {
  if (!blocked || !pushing) { st.stuck = 0; return 'swim'; }
  if (bank) { st.stuck = 0; return 'climb'; }
  st.stuck = (st.stuck ?? 0) + dt;
  if (st.stuck >= C.rescueAfter) { st.stuck = 0; return 'rescue'; }
  return 'swim';
}

/** The eye's height over the water line at swim time `t` (s): SWIM.eye with a small bob, less `depth` m under it (0 at the surface; the
 * dive, #1944 `diveStep`). */
export function swimEye(t, depth = 0, C = SWIM) {
  return C.eye + C.bob * Math.sin(t * Math.PI * 2 * C.bobHz) - depth;
}

/** #1944: how far under its floating height the eye may go where the water is `water` m deep (surface to bed): down to SWIM.dive.eyeOverBed
 * over the bed, never under it; 0 in the shallows. */
export function diveMax(water, C = SWIM) {
  return Math.max(0, C.eye + water - C.dive.eyeOverBed);
}

/** #1944: the dive depth one frame on. `want`: the crouch input is held (down towards the bed), else up to the surface, at SWIM.dive.rate
 * m/s. The bed's limit applies at once, so a rising bed lifts the diver and nothing holds them down: letting go always ends at depth 0. */
export function diveStep(depth, want, water, dt, C = SWIM) {
  const max = diveMax(water, C), step = C.dive.rate * dt;
  return Math.max(0, Math.min(max, want ? depth + step : depth - step));
}

/** #1944: is an eye `depth` m under its floating height under the surface (the mask's view, `Player.diving`)? */
export const isDiving = (depth, C = SWIM) => depth > C.eye + C.dive.under;

/** #1949: how much of the stroke goes against the current, 0 … 1: 1 straight upstream, 0 across or downstream (and without a stroke).
 * (sx, sz) the stroke's velocity, (cx, cz) the current's (`swimVelocity`'s `o.sx, o.sz, o.cx, o.cz`). */
export function upstreamPart(sx, sz, cx, cz) {
  const s = Math.hypot(sx, sz), c = Math.hypot(cx, cz);
  return s > 0 && c > 0 ? Math.max(0, -(sx * cx + sz * cz) / (s * c)) : 0;
}

/** #1949: how fast a diver uses air, in seconds of still air per second: 1 holding still, SWIM.air.swim while stroking, rising to
 * SWIM.air.upstream with the part of the stroke that goes against the current (`up` 0 … 1, `upstreamPart`). */
export function airRate(moving, up = 0, C = SWIM) {
  const A = C.air;
  return moving ? A.swim + (A.upstream - A.swim) * Math.max(0, Math.min(1, up)) : 1;
}

/** #1949: the air (s of still diving left, 0 … SWIM.air.seconds) one frame on: under the surface it goes down at `airRate`, anywhere else it
 * comes back at SWIM.air.recover. 0 = out of air (the caller's drowning). */
export function airStep(air, under, moving, up, dt, C = SWIM) {
  const A = C.air;
  return Math.max(0, Math.min(A.seconds, under ? air - airRate(moving, up, C) * dt : air + A.recover * dt));
}

/** #1949: how far into the suffocation warning a diver is, 0 (none) … 1 (out of air): the last SWIM.air.warn seconds at the rate the air
 * is being used right now (so a diver swimming hard is warned at a fuller meter). */
export function airWarning(air, rate, C = SWIM) {
  return Math.max(0, Math.min(1, 1 - air / (Math.max(rate, 1e-6) * C.air.warn)));
}

// ---- #1951: a swim stroke with the jump button ----
// One press gives one push the way the eye looks: SWIM.kick.speed m/s fading linearly to nothing over SWIM.kick.time s, and no new one until
// SWIM.kick.pause s after the last one started. Under the surface (`isDiving`) the push has the look's vertical part; at the surface it goes
// level along the heading at full strength, so a stroke never lifts anyone out of the water and looking down at the water does not weaken it
// (going under is the crouch input's job, `diveStep`). The state `k` = { x, y, z (the push's unit direction, y up), t (s into the push),
// left (s until the next may start), on } lives in `player.swim.kick`.

/** A fresh stroke state: nothing going on, ready for a press. */
export const kickState = () => ({ x: 0, y: 0, z: 0, t: 0, left: 0, on: false });

/** The unit direction of a stroke for an eye at `yaw` / `pitch` (rad, the camera's: yaw 0 looks towards -z, pitch + up): the look itself
 * `under` the surface, the level heading at it. */
export function kickDir(yaw, pitch, under, o = {}) {
  const c = under ? Math.cos(pitch) : 1;
  o.x = -Math.sin(yaw) * c; o.y = under ? Math.sin(pitch) : 0; o.z = -Math.cos(yaw) * c;
  return o;
}

/** A press of the jump button: starts a stroke unless the pause since the last one is still running. True when it started. */
export function kickStart(k, yaw, pitch, under, C = SWIM) {
  if (k.left > 0) return false;
  kickDir(yaw, pitch, under, k);
  k.t = 0; k.left = C.kick.pause; k.on = true;
  return true;
}

/** The push's speed (m/s) `t` s into a stroke. */
export const kickSpeed = (t, C = SWIM) => (t >= 0 && t < C.kick.time ? C.kick.speed * (1 - t / C.kick.time) : 0);

/** One frame of the stroke: `o.x, o.y, o.z` its velocity (m/s, the average over the frame; all 0 without a stroke), and the state moved on. */
export function kickStep(k, dt, o = {}, C = SWIM) {
  const K = C.kick, t1 = Math.min(K.time, k.t + dt);
  // the fade is linear, so the frame's average speed is the speed at its middle (over the part of the frame the push still lasts)
  const v = k.on && dt > 0 ? kickSpeed((k.t + t1) / 2, C) * (t1 - k.t) / dt : 0;
  o.x = k.x * v; o.y = k.y * v; o.z = k.z * v;
  if (k.on) { k.t += dt; if (k.t >= K.time) k.on = false; }
  k.left = Math.max(0, k.left - dt);
  return o;
}

/** The dive depth one frame on with a stroke's vertical speed `vy` (m/s, + up) in it. Under the surface the stroke moves the eye. Where it
 * goes the same way as the ordinary rule (`diveStep`: crouch held sinks, released floats up, both at SWIM.dive.rate) the two add up; where it
 * goes against it, it takes over by its share of that rate: a stroke straight up is felt in full with crouch held (and one straight down
 * with crouch released), and the sinking / floating comes back as the push fades. At the surface (not `isDiving`) the vertical part is not
 * used at all. The limits are `diveStep`'s: never over the floating height (depth 0), never nearer the bed than SWIM.dive.eyeOverBed. */
export function kickDepth(depth, want, vy, water, dt, C = SWIM) {
  const v = isDiving(depth, C) ? vy : 0, rate = C.dive.rate, against = want ? v > 0 : v < 0, w = against ? Math.min(1, Math.abs(v) / rate) : 0;
  return Math.max(0, Math.min(diveMax(water, C), depth + ((want ? rate : -rate) * (1 - w) - v) * dt));
}
