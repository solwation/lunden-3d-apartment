import { SQUIRREL_CLIMB as K } from './config.js';

// The squirrels' climbing on the trees' real skeletons (#2132), with no three.js so a node test can drive it. squirrels.js turns each
// tree's world skeleton (treeform.js treeSkeleton(matrix, bark, { orders: 2 }), #2131) into a plain `climbFrame`: the trunk's axis (it
// leans and tapers) and its main limbs, each carried on by its first second-order limb to the crown's edge. Every point here lies on the
// bark: round the trunk at `cling` m from its surface (the body pressed to it), on top of a limb. squirrelbrain.js walks the polylines
// these build (`climbRoute` up the trunk in a loose spiral and out along a limb, its reverse down head first, `crownRoute` from limb to
// limb through the crown) and jumps only between branch points at most `hop` m apart (`bestHop`). SQUIRREL_CLIMB in config.js (*guess*).

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const xyz = (p) => ({ x: p.x, y: p.y, z: p.z });

/**
 * The cross-section of one cylinder of the shared trunk geometry as the visitor sees it (foliage.js trunkGeometry: a `sides`-gon built
 * round in a space stretched `aspect` x in y and squeezed back, then the tree's instance matrix `m`, 16 numbers): { pts (its corners for a
 * local radius of 1, world vectors), W (the world axis) }. A limb's 3-gon and a stem's 5-gon squeezed by the instance are much flatter
 * or narrower than the skeleton's round radius in places: the squirrel's point is put on this, not on that.
 */
export function section(m, aspect, l) {
  let vx = l.b[0] - l.a[0], vy = (l.b[1] - l.a[1]) * aspect, vz = l.b[2] - l.a[2]; const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
  // three's Quaternion.setFromUnitVectors((0, 1, 0), v) and CylinderGeometry's ring (x = sin θ, z = cos θ)
  let qx = vz, qy = 0, qz = -vx, qw = vy + 1; if (qw < 1e-6) { qx = 1; qy = 0; qz = 0; qw = 0; } const ql = Math.hypot(qx, qy, qz, qw); qx /= ql; qy /= ql; qz /= ql; qw /= ql;
  const rot = (x, y, z) => { // v' = v + 2w (q x v) + 2 q x (q x v)
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
  };
  const world = ([x, y, z]) => { y /= aspect; return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; };
  const W = world([vx, vy, vz]), wl = Math.hypot(...W);
  const pts = Array.from({ length: l.sides }, (_, k) => world(rot(Math.sin(k * TAU / l.sides), 0, Math.cos(k * TAU / l.sides))));
  return { pts, W: W.map((v) => v / wl) };
}
/** How far from the axis section `sec`'s boundary lies in world direction `n` (unit, square to its axis), for a local radius of 1. */
export function sectionReach(sec, n) {
  const W = sec.W, bx = W[1] * n.z - W[2] * n.y, by = W[2] * n.x - W[0] * n.z, bz = W[0] * n.y - W[1] * n.x; // (W x n: the section plane's other axis)
  const P = sec.pts.map((p) => [p[0] * n.x + p[1] * n.y + p[2] * n.z, p[0] * bx + p[1] * by + p[2] * bz]);
  let best = 0;
  for (let k = 0; k < P.length; k++) {
    const [x1, y1] = P[k], [x2, y2] = P[(k + 1) % P.length];
    if ((y1 > 0) === (y2 > 0) && y1 !== 0) continue;
    const x = Math.abs(y2 - y1) < 1e-12 ? Math.max(x1, x2) : x1 + (0 - y1) * (x2 - x1) / (y2 - y1); if (x > best) best = x;
  }
  return best;
}

/** A tree's climbing frame from its world skeleton `sk` (treeSkeleton with orders >= 2; {x, y, z} points): { foot, top, u (unit axis),
 * len, r0, r1, limbs: [{ pts (attachment on the axis, main limb's end, its continuation's end), r (radii there), cum (m along it), len,
 * h (the attachment's height on the stem, 0 … 1; `hs` level with its first bark point), s0 (m out to the bark's surface), ang (its direction round the trunk), tip }] }.
 * `shape` { m (the trunk instance matrix, 16 numbers), aspect (TREE_FORM.branch[bark].aspect), layout (treeform.js trunkLayout(bark, phone)) }:
 * the bark is the drawn geometry's own (`section`); without it the skeleton's round radii. */
export function climbFrame(sk, shape = null) {
  const foot = xyz(sk.axis.from), top = xyz(sk.axis.to), len = dist(foot, top);
  const u = { x: (top.x - foot.x) / len, y: (top.y - foot.y) / len, z: (top.z - foot.z) / len }, r0 = sk.axis.r0, r1 = sk.axis.r1;
  const w = shape ? Math.hypot(shape.m[0], shape.m[1], shape.m[2]) : 1, lay = shape ? shape.layout.filter((l) => l.order >= 1 && l.order <= 2) : null;
  const sec = (b) => (shape ? section(shape.m, shape.aspect, lay[sk.branches.indexOf(b)]) : null);
  const limbs = sk.branches.filter((l) => l.order === 1).map((m) => {
    const c = sk.branches.find((l) => l.order === 2 && dist(l.from, m.to) < 1e-4); // (the second limb that carries the main one on)
    const pts = [xyz(m.from), xyz(m.to)], r = [m.r0, c ? Math.max(m.r1, c.r0) : m.r1], secs = [sec(m)];
    if (c) { pts.push(xyz(c.to)); r.push(c.r1); secs.push(sec(c)); }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1], h = Math.min(1, Math.max(0, ((pts[0].x - foot.x) * u.x + (pts[0].y - foot.y) * u.y + (pts[0].z - foot.z) * u.z) / len));
    const out = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) / (cum[1] || 1); // (how sideways the limb leaves the stem)
    const s0 = Math.min(total * 0.3, (lerp(r0, r1, h) + K.cling) / Math.max(0.35, out));
    return { pts, r, cum, len: total, h, s0, ang: Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x), tip: pts[pts.length - 1], secs };
  });
  const cf = { foot, top, u, len, r0, r1, limbs, w, sec: shape ? section(shape.m, shape.aspect, shape.layout[0]) : null };
  for (let i = 0; i < limbs.length; i++) { // `hs`: the stem height level with the limb's first bark point (the spiral ends there, no step through the crotch)
    const p = limbAt(cf, i, 0); limbs[i].hs = Math.min(1, Math.max(0, ((p.x - foot.x) * u.x + (p.y - foot.y) * u.y + (p.z - foot.z) * u.z) / len));
  }
  return cf;
}

/** The point on the trunk's bark at height `h` (0 … 1 of the stem) and angle `a` round it (x = cos a, z = sin a, as the brain's `ang`). */
export function trunkAt(cf, h, a, o = {}) {
  const { foot, u, len } = cf, cx = foot.x + u.x * len * h, cy = foot.y + u.y * len * h, cz = foot.z + u.z * len * h;
  let nx = Math.cos(a), nz = Math.sin(a); const d = nx * u.x + nz * u.z; let ny = -d * u.y; nx -= d * u.x; nz -= d * u.z;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const r = lerp(cf.r0, cf.r1, h) * (cf.sec ? sectionReach(cf.sec, { x: nx, y: ny, z: nz }) / cf.w : 1) + K.cling;
  o.x = cx + nx * r; o.y = cy + ny * r; o.z = cz + nz * r; o.nx = nx; o.ny = ny; o.nz = nz; o.a = a; o.h = h; o.trunk = true; o.li = -1; o.f = 0; return o;
}

/** The point on top of limb `li` at `f` (0: where it leaves the trunk's bark, 1: its tip), with the limb's direction there (`yaw` outward,
 * `pitch` its slope). */
export function limbAt(cf, li, f, o = {}) {
  const L = cf.limbs[li], s = L.s0 + Math.min(1, Math.max(0, f)) * (L.len - L.s0);
  let k = 0; while (k < L.pts.length - 2 && s > L.cum[k + 1]) k++;
  const a = L.pts[k], b = L.pts[k + 1], seg = L.cum[k + 1] - L.cum[k] || 1, t = Math.min(1, Math.max(0, (s - L.cum[k]) / seg));
  const dx = (b.x - a.x) / seg, dy = (b.y - a.y) / seg, dz = (b.z - a.z) / seg;
  let ux = -dy * dx, uy = 1 - dy * dy, uz = -dy * dz; const ul = Math.hypot(ux, uy, uz); // (world up made square to the limb: its top)
  if (ul < 1e-3) { ux = 1; uy = 0; uz = 0; } else { ux /= ul; uy /= ul; uz /= ul; }
  const sec = L.secs[k], r = lerp(L.r[k], L.r[k + 1], t) * (sec ? sectionReach(sec, { x: ux, y: uy, z: uz }) / cf.w : 1) + K.cling;
  o.nx = ux; o.ny = uy; o.nz = uz; o.x = lerp(a.x, b.x, t) + ux * r; o.y = lerp(a.y, b.y, t) + uy * r; o.z = lerp(a.z, b.z, t) + uz * r;
  o.yaw = Math.atan2(dx, dz); o.pitch = Math.asin(Math.max(-1, Math.min(1, dy))); o.a = L.ang; o.trunk = false; o.li = li; o.f = f; return o;
}

/** The limb pointing most nearly towards angle `ang` round the trunk. */
export function limbFor(cf, ang) {
  let best = 0, bd = Infinity;
  cf.limbs.forEach((L, i) => { const d = Math.abs(wrap(L.ang - ang)); if (d < bd) { bd = d; best = i; } });
  return best;
}
/** How far out along its limb a squirrel perched at angle `ang` sits (deterministic from the angle). */
export function perchF(ang) {
  const h = Math.sin(ang * 12.9898 + 4.1414) * 43758.5453;
  return lerp(K.perch[0], K.perch[1], h - Math.floor(h));
}

const limbRun = (cf, li, f0, f1, out) => { // limb li from f0 to f1, through its bends
  const L = cf.limbs[li], fr = (s) => (s - L.s0) / (L.len - L.s0 || 1), lo = Math.min(f0, f1), hi = Math.max(f0, f1);
  const mid = L.cum.slice(1, -1).map(fr).filter((f) => f > lo && f < hi).sort((a, b) => (f1 > f0 ? a - b : b - a));
  for (const f of [f0, ...mid, f1]) out.push(limbAt(cf, li, f));
};
const helix = (cf, h0, a0, h1, a1, out) => { // round the trunk from (h0, a0) to (h1, a1), a1 already unwrapped
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 8)), Math.ceil(Math.abs(h1 - h0) * cf.len / 0.4));
  for (let i = 0; i <= n; i++) out.push(trunkAt(cf, lerp(h0, h1, i / n), lerp(a0, a1, i / n)));
};

/** Up from `from` (where it stands at the trunk's foot) round the trunk in a loose spiral (`turns` per m, ending at the limb's side) to
 * limb `li`'s attachment, then out along it to `f`: a polyline of bark points ({ x, y, z, trunk, a, li, f }). Reverse it to come down. */
export function climbRoute(cf, from, li, f) {
  const L = cf.limbs[li], a0 = Math.atan2(from.z - cf.foot.z, from.x - cf.foot.x), turns = K.turns * L.hs * cf.len;
  const d0 = (((L.ang - a0) % TAU) + TAU) % TAU - TAU; // (-1 … 0 turns: it winds one way round)
  const d = d0 - TAU * Math.max(0, Math.round(turns + d0 / TAU));
  const out = [{ x: from.x, y: from.y, z: from.z, trunk: true, a: a0, li: -1, f: 0 }];
  helix(cf, Math.min(0.03, L.hs), a0, L.hs, a0 + d, out);
  limbRun(cf, li, 0, f, out);
  return out;
}
/** Through the crown from limb `li` at `f0` to limb `lj` at `f1`: in along the first, round the trunk (the short way), out along the other. */
export function crownRoute(cf, li, f0, lj, f1) {
  const out = [];
  if (li === lj) { limbRun(cf, li, f0, f1, out); return out; }
  const A = cf.limbs[li], B = cf.limbs[lj];
  limbRun(cf, li, f0, 0, out);
  helix(cf, A.hs, A.ang, B.hs, A.ang + wrap(B.ang - A.ang), out);
  limbRun(cf, lj, 0, f1, out);
  return out;
}

/** A polyline as a path: { pts, cum, total }. */
export function pathOf(pts) {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return { pts, cum, total: cum[cum.length - 1], k: 0 };
}
/** The point `s` m along path `p`, with the direction of travel (dx, dy, dz, unit), `trunk` (on the stem), `a` (round it), `li` / `f`. */
export function pathAt(p, s, o = {}) {
  const { pts, cum } = p; s = Math.min(p.total, Math.max(0, s));
  let k = Math.min(p.k, pts.length - 2); while (k > 0 && s < cum[k]) k--; while (k < pts.length - 2 && s > cum[k + 1]) k++; p.k = k;
  const a = pts[k], b = pts[k + 1] ?? a, seg = cum[k + 1] - cum[k] || 1, t = Math.min(1, Math.max(0, (s - cum[k]) / seg));
  o.x = lerp(a.x, b.x, t); o.y = lerp(a.y, b.y, t); o.z = lerp(a.z, b.z, t);
  o.dx = (b.x - a.x) / seg; o.dy = (b.y - a.y) / seg; o.dz = (b.z - a.z) / seg;
  o.trunk = a.trunk && b.trunk; o.a = lerp(a.a, b.a, t); o.li = b.li >= 0 ? b.li : a.li; o.f = lerp(a.f, b.f, t);
  return o;
}

/** The pose for a point on a path: on the stem it is upright (head up climbing, head first coming down) with its belly to the bark, on
 * a limb it follows the limb's slope. { yaw, pitch } in squirrels.js' convention (forward = (sin yaw, ·, cos yaw); pitch > 0 nose up). */
export function climbPose(o, out = {}) {
  if (o.trunk) {
    const up = o.dy >= 0, c = Math.cos(o.a), s = Math.sin(o.a);
    out.pitch = up ? Math.PI / 2 : -Math.PI / 2; out.yaw = up ? Math.atan2(-c, -s) : Math.atan2(c, s);
  } else { out.yaw = Math.atan2(o.dx, o.dz); out.pitch = Math.atan2(o.dy, Math.hypot(o.dx, o.dz)); }
  return out;
}

const OUTER = Array.from({ length: 5 }, (_, i) => lerp(K.outer[0], K.outer[1], i / 4)), hopCache = new WeakMap();
/** The branch points a jump may leave from or land on (the limbs' outer parts), once per frame. */
const hopPoints = (cf) => { let p = hopCache.get(cf); if (!p) hopCache.set(cf, p = cf.limbs.flatMap((_, i) => OUTER.map((f) => limbAt(cf, i, f)))); return p; };
/** The nearest pair of branch points (the limbs' outer parts) of frames `a` and `b` (the same frame: two different limbs of one crown):
 * { li, f, lj, fj, d } or null. A jump is only taken when `d` <= SQUIRREL_CLIMB.hop. */
export function bestHop(a, b) {
  const pa = hopPoints(a), pb = a === b ? pa : hopPoints(b); let best = null, bd = Infinity;
  for (const p of pa) for (const q of pb) {
    if (a === b && p.li === q.li) continue;
    const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2; if (d < bd) { bd = d; best = { li: p.li, f: p.f, lj: q.li, fj: q.f, d: 0 }; }
  }
  if (best) best.d = Math.sqrt(bd);
  return best;
}
/** How far a limb reaches out from the trunk's foot at most (m, horizontal): a cheap bound before `bestHop`. */
export const reachOf = (cf) => Math.max(...cf.limbs.map((L) => Math.hypot(L.tip.x - cf.foot.x, L.tip.z - cf.foot.z)));
/** The weight of the crown's wind sway on a squirrel at `f` out along a limb (0 near the trunk, 1 at the tip). */
export const swayWeight = (f) => { const k = Math.max(0, Math.min(1, (f - K.swayFrom) / (1 - K.swayFrom))); return k * k; };
