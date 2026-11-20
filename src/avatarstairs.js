// #2172: the stair gait of the avatars: forward lean and a higher knee lift going up, shorter, more careful and slightly backward-leaning steps going
// down, and a hand that slides along the handrail when one is within reach. Pure helpers (no three.js, headless-testable; numbers AVATAR_STAIRS in
// config.js). Everything is derived locally: the stair's slope from the ground under the figure (the same `ground(x, z, feetY)` hook as the foot IK #2015),
// the rail from the polylines the stair builders register here (corehouse.js for Hus A/B/C/L, stairs.js for the flat's own stair): no network field.
import { AVATAR_STAIRS as K } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (v, [a, b]) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const follow = (cur, to, dt, tau) => cur + (to - cur) * (1 - Math.exp(-dt / tau));

// ---- the rails ----
const rails = []; // { pts: [[x, y, z]], box: [x0, x1, z0, z1] }

/** Registers a handrail's axis (world [x, y, z] points, at most ~0.3 m apart). Returns the number of registered rails. */
export function registerRail(pts) {
  if (!pts || pts.length < 2) return rails.length;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  const key = `${pts[0]}|${pts.at(-1)}|${pts.length}`;
  if (rails.some((r) => r.key === key)) return rails.length; // (a rebuilt stair registers the same rail again)
  rails.push({ pts, box: [x0, x1, z0, z1], key });
  return rails.length;
}
/** Thins a dense rail polyline (the flat's stair has a sample per cm) to points at least `gap` m apart (the ends kept). */
export function thinRail(pts, gap = 0.2) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) if (i === pts.length - 1 || Math.hypot(pts[i][0] - out.at(-1)[0], pts[i][2] - out.at(-1)[2]) >= gap) out.push(pts[i]);
  return out;
}
export const railCount = () => rails.length;
export const clearRails = () => { rails.length = 0; };

/** The figure-frame point (x to its left, z forward) of the world offset (dx, dz) for a figure at yaw `yaw`, scale `sc`. */
export const toFigure = (dx, dz, yaw, sc, out = [0, 0]) => { const c = Math.cos(yaw), s = Math.sin(yaw); out[0] = (dx * c - dz * s) / sc; out[1] = (dx * s + dz * c) / sc; return out; };

/** The rail's closest point (world [x, y, z]) to the world point (px, pz), among `list` (default: the registered rails) whose height over `floorY` lies in `K.height`.
 * Returns null without one within `maxD` m. Segments are tested exactly (the rail's height is interpolated along them). */
export function nearestRail(px, pz, floorY, maxD, list = rails, out = [0, 0, 0]) {
  let best = maxD * maxD, hit = false;
  for (const r of list) {
    const b = r.box;
    if (px < b[0] - maxD || px > b[1] + maxD || pz < b[2] - maxD || pz > b[3] + maxD) continue;
    const P = r.pts;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], c = P[i], ex = c[0] - a[0], ez = c[2] - a[2], L2 = ex * ex + ez * ez;
      const t = L2 > 1e-9 ? clamp(((px - a[0]) * ex + (pz - a[2]) * ez) / L2, 0, 1) : 0;
      const y = a[1] + (c[1] - a[1]) * t, h = y - floorY;
      if (h < K.height[0] || h > K.height[1]) continue;
      const x = a[0] + ex * t, z = a[2] + ez * t, d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < best) { best = d; out[0] = x; out[1] = y; out[2] = z; hit = true; }
    }
  }
  return hit ? out : null;
}

/** The hand's rail target for a figure at the world frame [x, z, yaw] (scale `sc`, root height `floorY`): the rail point nearest to the spot `K.ahead` m in front of the
 * hips, if it lies within reach to the figure's side (|x| <= K.reach). Returns { side: +1 left / -1 right, at: [x, y, z] in the figure frame (y over the root) } or null. */
export function railTarget(frame, floorY, sc, list = rails, out = { side: 1, at: [0, 0, 0], world: [0, 0, 0] }) {
  if (!frame || !Number.isFinite(floorY)) return null;
  const s = Math.sin(frame[2]), c = Math.cos(frame[2]), a = K.ahead * sc;
  const hit = nearestRail(frame[0] + s * a, frame[1] + c * a, floorY, K.maxDist * sc + K.ahead * sc, list, out.world);
  if (!hit) return null;
  const f = toFigure(hit[0] - frame[0], hit[2] - frame[1], frame[2], sc);
  if (Math.abs(f[0]) > K.reach) return null;
  if (Math.abs(f[0]) < 0.12 || f[1] < -0.3) return null; // a rail through the body / far behind it is not one to hold
  out.side = f[0] > 0 ? 1 : -1; out.at[0] = f[0]; out.at[1] = (hit[1] - floorY) / sc; out.at[2] = clamp(f[1], -0.1, K.front);
  return out;
}

// ---- the stair state ----
/** The ground's slope (tan, + uphill) along the heading from the ground heights `front` / `back` m `d` ahead of / behind the body. NaN without ground. */
export const slopeAlong = (front, back, d) => (Number.isFinite(front) && Number.isFinite(back) ? (front - back) / (2 * d) : NaN);

/** A fresh stair-gait state. */
export const newStair = () => ({ c: 0, up: 0, down: 0, w: 0, out: { lean: 0, lift: 0, shrink: 1, hip: 0, up: 0, down: 0 } });

/** The stair gait's terms for a climb gradient `c` (the ground's slope along the direction of travel: + going up, - going down, from `slopeAlong` and the sign of the
 * forward speed) and walking speed `speed` m/s; pure, no state. lean (rad, + forward), lift (m, extra swing-foot clearance), shrink (stride length scale), hip (m the hips sink). */
export function stairTerms(c, speed, out = { lean: 0, lift: 0, shrink: 1, hip: 0, up: 0, down: 0 }) {
  const sp = smooth(speed, K.speed), up = smooth(c, K.slope) * sp, down = smooth(-c, K.slope) * sp;
  out.up = up; out.down = down;
  out.lean = K.upLean * up - K.downLean * down;
  out.lift = K.upLift * up + K.downLift * down;
  out.shrink = 1 - (1 - K.upShrink) * up - (1 - K.downShrink) * down;
  out.hip = K.upHip * up + K.downHip * down;
  return out;
}

/** Advances the state by `dt` s: `slope` the ground slope along the heading (NaN: unknown = flat), `dir` the sign of the motion along the heading (+1 forward, -1 backward),
 * `speed` the ground speed, `on` false: the terms fade out. Returns the smoothed stairTerms (reused object). */
export function stepStair(s, dt, { slope = NaN, dir = 1, speed = 0, on = true } = {}) {
  if (!(dt > 0)) return s.out;
  const goal = on && Number.isFinite(slope) ? slope * (dir < 0 ? -1 : 1) : 0;
  s.c = follow(s.c, goal, Math.min(dt, 0.1), K.tau);
  return stairTerms(s.c, on ? speed : 0, s.out);
}
