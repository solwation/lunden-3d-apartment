import { SEAT_LEGS as L } from './config.js';
import { THIGH, SHIN } from './olof.js';

// #2158: a seated figure's legs from the real seat height. The root and hips stay where restState puts them (REST.avatarSeat
// under the seat's surface); only the feet move: onto the real floor under a low or high seat, knees bent accordingly,
// hanging free under a seat too high to reach the floor, and pumping on a swing. All in the figure's frame (metres before
// avatar scaling, floor of the nominal pose at y 0, facing +z), like olof.js seatedPose.

const lerp = (a, b, t) => a + (b - a) * t;

/** Ankle [y, z] for thigh pitch `th` (down) and shin tilt `ph` (forward) from the hip joint at [hy, hz]. */
function ankle(hy, hz, th, ph, out) {
  out[0] = hy - THIGH * Math.sin(th) - SHIN * Math.cos(ph);
  out[1] = hz + THIGH * Math.cos(th) + SHIN * Math.sin(ph);
  return out;
}

/** The share s (0 … 1) of the way from `L.base` to `lim` whose ankle drops `drop` below the hip (the drop is monotonic in s). */
function solve(drop, lim) {
  const d = (s) => THIGH * Math.sin(lerp(L.base[0], lim[0], s)) + SHIN * Math.cos(lerp(L.base[1], lim[1], s));
  const d0 = d(0), d1 = d(1);
  if ((drop - d0) * (d1 - d0) <= 0) return 0;
  if ((drop - d1) * (d1 - d0) >= 0) return 1;
  let a = 0, b = 1;
  for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if ((d(m) - drop) * (d1 - d0) < 0) a = m; else b = m; }
  return (a + b) / 2;
}

const tmp = [0, 0];

/**
 * The seated feet for a seat of nominal height `seat` (REST.avatarSeat: the hips sit at seat + 0.075) when the real floor is
 * at local y `floor` (0: the nominal floor; > 0 a low seat, < 0 a high one). `pump` (−1 … 1): a swing's forward / backward
 * swing, tilting the shins out / tucking them under. Returns `out` = { feet: [[x, y, z] ×2] (L = +x), dangle (0 on the floor
 * … 1 hanging free), thigh, shin (the angles used, rad) }.
 */
export function seatedLegs(seat, floor = 0, pump = 0, out = { feet: [[0.11, 0, 0], [-0.11, 0, 0]], dangle: 0, thigh: 0, shin: 0 }) {
  const hy = seat + 0.075, hz = L.hipZ, ground = floor + L.ankle, drop = hy - ground;
  const dBase = THIGH * Math.sin(L.base[0]) + SHIN * Math.cos(L.base[1]);
  const dReach = THIGH * Math.sin(L.reach[0]) + SHIN * Math.cos(L.reach[1]);
  let th, ph, dangle = 0;
  if (drop <= dBase) { const s = solve(drop, L.low); th = lerp(L.base[0], L.low[0], s); ph = lerp(L.base[1], L.low[1], s); }
  else if (drop <= dReach) { const s = solve(drop, L.reach); th = lerp(L.base[0], L.reach[0], s); ph = lerp(L.base[1], L.reach[1], s); }
  else { dangle = Math.min(1, (drop - dReach) / L.band); th = lerp(L.reach[0], L.dangle[0], dangle); ph = lerp(L.reach[1], L.dangle[1], dangle); }
  const p = Math.max(-1, Math.min(1, pump));
  if (p) ph += p > 0 ? p * L.pump[0] : -p * L.pump[1];
  ankle(hy, hz, th, ph, tmp);
  // on the floor (not hanging free, no pump): exactly on it; never through it (a tucked pump stops at the floor)
  const y = dangle === 0 && !p ? ground : Math.max(ground, tmp[0]);
  out.feet[0][0] = 0.11; out.feet[1][0] = -0.11;
  out.feet[0][1] = out.feet[1][1] = y;
  out.feet[0][2] = out.feet[1][2] = tmp[1];
  out.dangle = dangle; out.thigh = th; out.shin = ph;
  return out;
}

/** Floor height (local, see seatedLegs) from world heights: the figure rooted at `rootY` with body scale `scale`. Non-finite
 * floors (nothing under the seat) and floors above the hips give the nominal 0. */
export function localFloor(floorY, rootY, scale = 1, seat = 0.45) {
  const f = (floorY - rootY) / (scale || 1);
  return Number.isFinite(f) && f < seat ? f : 0;
}

/** The swing pump (−1 … 1) from the seat's forward speed (m/s); 0 when moving faster than a swing does (a vehicle). */
export function seatPump(forward, speed) {
  return speed > L.pumpMax ? 0 : Math.max(-1, Math.min(1, forward / L.pumpSpeed));
}
