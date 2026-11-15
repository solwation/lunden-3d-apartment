// #1952: things drifting downstream in Höje å (flecks of foam, bubbles, a leaf now and then), the pure rules: no three.js, no terrain, no
// swimming state (a node test runs them, src/riverdrift.test.mjs; src/riverdriftview.js draws them).
//
// The river's centre line (riverbridge.js `riverPath`, with the east edge's join in front) runs from upstream (east) to downstream (west),
// so downstream is the path's own direction (as swim.js `currentDir`). `driftPath` rounds its corners and resamples it by its own length;
// a drifting thing is then a parcel of water: a fixed coordinate along the path that moves with `speed` x time, plus a lane across the
// channel. `DriftField.particle` gives parcel i's place at time t as a pure function, for the window of `range` m either side of the
// station nearest the camera: nothing is stored, stepped or synchronised, and a parcel keeps its lane, size and kind wherever the camera is.

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** A hash of (i, j, k) in [0, 1): integers only, so it is the same in every engine. */
export function driftHash(i, j = 0, k = 0) {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(j + 0x632be5ab, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The smoothed centre line. `points` [[x, z], …] from upstream to downstream, `widths` the open channel's width (m) at each point.
 * Corners are rounded with a box filter of +-`smooth` m along the raw path (a right-angle bend is cut by about a third of that), then the
 * line is resampled every `step` m of its OWN length, so a thing moving `v` m/s along it moves `v` m/s over the ground.
 * Returns { length, step, n, x, z, tx, tz (unit tangent, downstream), hw (half the channel's width), at(s, o), nearest(x, z, o) }. */
export function driftPath(points, widths, { step = 1, smooth = 3 } = {}) {
  const m = points.length, cum = [0];
  for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const L0 = cum[m - 1], raw = (s, o) => {
    s = Math.max(0, Math.min(L0, s)); let i = 1; while (i < m - 1 && cum[i] < s) i++;
    const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    o.x = points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f; o.z = points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f;
    o.w = widths[i - 1] + (widths[i] - widths[i - 1]) * f; return o;
  };
  // 1. the rounded line at `step / 2` of the raw chainage
  const fine = step / 2, k0 = Math.ceil(L0 / fine), sx = [], sz = [], sw = [], sl = [0], o = {}, taps = Math.max(1, Math.round(smooth / fine));
  for (let k = 0; k <= k0; k++) {
    const s = Math.min(L0, k * fine); let x = 0, z = 0;
    // (the filter shrinks towards the path's ends, so the line still starts and ends on them)
    const reach = Math.min(taps, Math.floor(Math.min(s, L0 - s) / fine));
    for (let j = -reach; j <= reach; j++) { raw(s + j * fine, o); x += o.x; z += o.z; }
    sx.push(x / (2 * reach + 1)); sz.push(z / (2 * reach + 1)); sw.push(raw(s, o).w);
    if (k) sl.push(sl[k - 1] + Math.hypot(sx[k] - sx[k - 1], sz[k] - sz[k - 1]));
  }
  // 2. resampled by its own length
  const length = sl[k0], n = Math.floor(length / step), P = { length: n * step, step, n,
    x: new Float64Array(n + 1), z: new Float64Array(n + 1), tx: new Float64Array(n + 1), tz: new Float64Array(n + 1), hw: new Float64Array(n + 1) };
  for (let k = 0, i = 1; k <= n; k++) {
    const s = k * step; while (i < k0 && sl[i] < s) i++;
    const f = (s - sl[i - 1]) / (sl[i] - sl[i - 1] || 1);
    P.x[k] = sx[i - 1] + (sx[i] - sx[i - 1]) * f; P.z[k] = sz[i - 1] + (sz[i] - sz[i - 1]) * f; P.hw[k] = (sw[i - 1] + (sw[i] - sw[i - 1]) * f) / 2;
  }
  for (let k = 0; k <= n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n, k + 1), dx = P.x[b] - P.x[a], dz = P.z[b] - P.z[a], l = Math.hypot(dx, dz) || 1;
    P.tx[k] = dx / l; P.tz[k] = dz / l;
  }
  /** The line at chainage `s` (m, clamped): o.x, o.z, o.tx, o.tz (unit tangent), o.hw. Allocates nothing. */
  P.at = (s, o) => {
    const q = Math.max(0, Math.min(P.length, s)) / step, i = Math.min(n - 1, Math.floor(q)), f = q - i, g = 1 - f;
    o.x = P.x[i] * g + P.x[i + 1] * f; o.z = P.z[i] * g + P.z[i + 1] * f; o.hw = P.hw[i] * g + P.hw[i + 1] * f;
    const tx = P.tx[i] * g + P.tx[i + 1] * f, tz = P.tz[i] * g + P.tz[i + 1] * f, l = Math.hypot(tx, tz) || 1;
    o.tx = tx / l; o.tz = tz / l; return o;
  };
  /** The line's nearest point to (x, z): o.s (chainage), o.u (signed offset across, + to the left bank's side (-tz, tx)), o.d (distance). */
  P.nearest = (x, z, o) => {
    let bi = 0, bd = Infinity;
    for (let k = 0; k <= n; k++) { const dx = x - P.x[k], dz = z - P.z[k], d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = k; } }
    const along = (x - P.x[bi]) * P.tx[bi] + (z - P.z[bi]) * P.tz[bi];
    o.s = Math.max(0, Math.min(P.length, bi * step + Math.max(-step, Math.min(step, along))));
    o.u = -(x - P.x[bi]) * P.tz[bi] + (z - P.z[bi]) * P.tx[bi]; o.d = Math.sqrt(bd); return o;
  };
  return P;
}

/** Obstacles in the channel (bridge piers) in the line's own frame: `boxes` [{ x, z, half }] (riverbridge.js `pierBoxes`) ->
 * [{ s, u, r }] for those in or at the channel; `r` = the half width x 1.2 (the box may stand askew) + `clear` m. */
export function driftObstacles(path, boxes, clear = 0.3) {
  const out = [], o = {};
  for (const b of boxes) { path.nearest(b.x, b.z, o); const r = b.half * 1.2 + clear; if (Math.abs(o.u) < path.at(o.s, {}).hw + r) out.push({ s: o.s, u: o.u, r }); }
  return out;
}

export class DriftField {
  /** `path` (driftPath), `count` parcels in the window, `range` m either side of the window's centre, `speed` m/s downstream,
   * `laneMax` (0 … 1 of the usable half width), `margin` m kept clear of the channel's edge, `fade` m over which things fade in / out at the
   * window's ends, `endFade` m at the path's own ends, `obstacles` (driftObstacles) the lanes bend round over `bend` m, `seed`. */
  constructor({ path, count, range, speed, laneMax = 0.8, margin = 0.3, fade = 8, endFade = 10, obstacles = [], bend = 3, seed = 1 }) {
    Object.assign(this, { path, count, range, speed, laneMax, margin, fade, endFade, obstacles, bend, seed, span: 2 * range });
    this.o = {};
  }

  /** The lane offset `u` at chainage `s` (channel half width `hw`) bent round the obstacles: within `bend` m up / downstream of one, a lane
   * nearer than its `r` is moved out to `r` (smoothly, so the thing is seen to steer round it): on its own side, or on the other side where
   * its own side has no room left before the channel's edge (it then crosses over upstream of the obstacle, never through it). */
  around(s, u, hw) {
    for (const p of this.obstacles) {
      const ds = Math.abs(s - p.s); if (ds >= this.bend + p.r) continue;
      const d = u - p.u, a = Math.abs(d); if (a >= p.r) continue;
      let side = d >= 0 ? 1 : -1; if (Math.abs(p.u + side * p.r) > hw - this.margin) side = -side;
      u += (p.u + side * p.r - u) * sm(1 - Math.max(0, ds - p.r) / this.bend);
    }
    return u;
  }

  /** Parcel `i` at time `t` (s) for a window centred on chainage `sc`. Fills and returns `o`: s (chainage), u (offset across), x, z,
   * tx, tz (the flow's unit direction there), alpha (0 … 1: the window's and the path's ends fade), id (which parcel of water this is: the
   * same thing keeps its id while it drifts through the window), and r1, r2, r3 (0 … 1, fixed for the parcel: size, kind, depth …). */
  particle(i, t, sc, o = {}) {
    const { path, span, range } = this, a = (i + driftHash(i, this.seed, 9)) / this.count * span + this.speed * t,
      id = Math.floor((a - sc + range) / span), s = a - id * span, c = this.o;
    path.at(s, c);
    const lane = (driftHash(i, id, this.seed) * 2 - 1) * this.laneMax, u = this.around(s, lane * Math.max(0, c.hw - this.margin), c.hw);
    o.s = s; o.u = u; o.id = id; o.tx = c.tx; o.tz = c.tz; o.x = c.x - c.tz * u; o.z = c.z + c.tx * u;
    o.alpha = s <= 0 || s >= path.length ? 0 : sm(Math.min(s - (sc - range), sc + range - s) / this.fade) * sm(Math.min(s, path.length - s) / this.endFade);
    o.r1 = driftHash(i, id, this.seed + 1); o.r2 = driftHash(i, id, this.seed + 2); o.r3 = driftHash(i, id, this.seed + 3);
    return o;
  }
}

/** How deep the water is (m) `u` m off the centre line of a channel `hw` m half wide: `edge` m at the channel's edge, `pool` m more at
 * the centre line (riverbridge.js `riverGround`'s pool, #1944). */
export const driftDepth = (u, hw, edge, pool) => edge + pool * sm(1 - Math.min(1, Math.abs(u) / hw));
