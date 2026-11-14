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
 * hook for #1944's dive). */
export function swimEye(t, depth = 0, C = SWIM) {
  return C.eye + C.bob * Math.sin(t * Math.PI * 2 * C.bobHz) - depth;
}
