import * as THREE from 'three';
import { SITE } from './config.js';

// The roads round Kv. Lunden (SITE.roads, #257): a road is a rectangle (`x0 x1 z0 z1`), a centre line (`path`: [x, z, r]
// points, the corner at a point rounded to an arc of radius r; `w` = the width at each point, interpolated along the
// road) or a set of `fillets` (asphalt filling a square corner between two road edges up to a quarter circle).
// Pure geometry: surroundings.js and street.js build the meshes, with their own ground height.

const STEP = 1.5; // m between the samples of a straight stretch (arcs: ~1 m)

/** Dense samples of a path road: { x, z, w, nx, nz, s } — (nx, nz) = the right-hand normal (+ = right of the
 * direction of travel along the path), s = distance along the centre line. Cached on the road object. */
export function samples(road) {
  if (road._samples) return road._samples;
  const P = road.path, W = Array.isArray(road.w) ? road.w : P.map(() => road.w);
  const pts = []; // { x, z, anchor: index of the control point it stands for (its arc's middle) }
  const dir = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
  let cur = [P[0][0], P[0][1]];
  pts.push({ x: cur[0], z: cur[1], anchor: 0 });
  const line = (to) => {
    const l = Math.hypot(to[0] - cur[0], to[1] - cur[1]), n = Math.max(1, Math.ceil(l / STEP));
    for (let k = 1; k <= n; k++) pts.push({ x: cur[0] + ((to[0] - cur[0]) * k) / n, z: cur[1] + ((to[1] - cur[1]) * k) / n });
    cur = to;
  };
  for (let i = 1; i < P.length; i++) {
    const r = P[i][2] || 0;
    if (i === P.length - 1 || !r) { line([P[i][0], P[i][1]]); pts[pts.length - 1].anchor = i; continue; }
    const d1 = dir(P[i - 1], P[i]), d2 = dir(P[i], P[i + 1]);
    const turn = d1[0] * d2[1] - d1[1] * d2[0], ang = Math.acos(THREE.MathUtils.clamp(d1[0] * d2[0] + d1[1] * d2[1], -1, 1));
    const t = r * Math.tan(ang / 2), side = Math.sign(turn) || 1;
    const A = [P[i][0] - d1[0] * t, P[i][1] - d1[1] * t];
    const C = [A[0] - d1[1] * side * r, A[1] + d1[0] * side * r]; // the right normal of d1 is (−dz, dx)
    line(A);
    const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), n = Math.max(2, Math.ceil(ang * r));
    for (let k = 1; k <= n; k++) {
      const a = a0 + side * ang * (k / n);
      pts.push({ x: C[0] + Math.cos(a) * r, z: C[1] + Math.sin(a) * r });
      if (k === Math.round(n / 2)) pts[pts.length - 1].anchor = i;
    }
    cur = [pts[pts.length - 1].x, pts[pts.length - 1].z];
  }
  let s = 0;
  pts.forEach((p, k) => { if (k) s += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z); p.s = s; });
  // widths: linear in s between the anchors
  const anchors = pts.filter((p) => p.anchor !== undefined);
  for (const p of pts) {
    let j = 0;
    while (j < anchors.length - 2 && anchors[j + 1].s < p.s) j++;
    const a = anchors[j], b = anchors[Math.min(j + 1, anchors.length - 1)];
    const f = b.s > a.s ? THREE.MathUtils.clamp((p.s - a.s) / (b.s - a.s), 0, 1) : 0;
    p.w = W[a.anchor] + (W[b.anchor] - W[a.anchor]) * f;
  }
  pts.forEach((p, k) => {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    p.nx = -dz / l; p.nz = dx / l;
  });
  road._samples = pts;
  return pts;
}

/** The fillet's outline: the corner, then the quarter circle from one road edge to the other. */
export function filletOutline(f) {
  const out = [[f.x, f.z]];
  const cx = f.x + f.sx * f.r, cz = f.z + f.sz * f.r, n = Math.max(4, Math.ceil(f.r * 1.5));
  for (let k = 0; k <= n; k++) { const a = (Math.PI / 2) * (k / n); out.push([cx - f.sx * f.r * Math.sin(a), cz - f.sz * f.r * Math.cos(a)]); }
  return out;
}

const inFillet = (f, x, z, m) => {
  const u = (x - f.x) * f.sx, v = (z - f.z) * f.sz;
  if (u < -m || v < -m || u > f.r + m || v > f.r + m) return false;
  return Math.hypot(f.r - u, f.r - v) >= f.r - m || u < 0 || v < 0;
};

/** Is plan point (x, z) on asphalt (within `margin` m of it)? `skip` = a road to leave out. */
export function onRoad(x, z, margin = 0, skip = null) {
  for (const r of SITE.roads) {
    if (r === skip) continue;
    if (r.path) {
      const S = samples(r);
      for (let k = 1; k < S.length; k++) {
        const a = S[k - 1], b = S[k], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
        const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
        if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < (a.w + (b.w - a.w) * t) / 2 + margin) return true;
      }
    } else if (r.fillets) {
      if (r.fillets.some((f) => inFillet(f, x, z, margin))) return true;
    } else if (x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin) return true;
  }
  return false;
}

/** The point on a path road nearest (x, z): its distance along the road. */
export function nearestS(road, x, z) {
  let best = Infinity, s = 0;
  for (const p of samples(road)) { const d = Math.hypot(p.x - x, p.z - z); if (d < best) { best = d; s = p.s; } }
  return s;
}

/** Points along a path road every `step` m between two plan points, `off(w)` m right of the centre line (negative =
 * left): [{ x, z, nx, nz }]. */
export function along(road, from, to, step, off) {
  const S = samples(road), s0 = nearestS(road, ...from), s1 = nearestS(road, ...to), out = [];
  for (let s = Math.min(s0, s1); s <= Math.max(s0, s1) + 1e-6; s += step) {
    let k = 1;
    while (k < S.length - 1 && S[k].s < s) k++;
    const a = S[k - 1], b = S[k], f = b.s > a.s ? THREE.MathUtils.clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
    const w = a.w + (b.w - a.w) * f, nx = a.nx + (b.nx - a.nx) * f, nz = a.nz + (b.nz - a.nz) * f, l = Math.hypot(nx, nz);
    const o = off(w);
    out.push({ x: a.x + (b.x - a.x) * f + (nx / l) * o, z: a.z + (b.z - a.z) * f + (nz / l) * o, nx: nx / l, nz: nz / l });
  }
  return out;
}

/** A strip along a path road between offsets `a(w)` and `b(w)` (right of the centre line), lying `lift` m over the
 * ground (`groundY`); a quad whose corners all lie on another road is left out (`clip`). Non-indexed, with uvs. */
export function pathStrip(road, a, b, lift, groundY, clip = false) {
  const S = samples(road), pos = [];
  const at = (p, o) => [p.x + p.nx * o, p.z + p.nz * o];
  for (let k = 1; k < S.length; k++) {
    const p = S[k - 1], q = S[k];
    const c = [at(p, a(p.w)), at(p, b(p.w)), at(q, a(q.w)), at(q, b(q.w))];
    if (clip && c.every(([x, z]) => onRoad(x, z, -0.05, road))) continue;
    // where the ground slopes, 10 cm pieces, so the strip stays on it through the slope's kinks
    const sloped = c.some(([x, z]) => Math.abs(groundY(x, z) - groundY(...c[0])) > 1e-4);
    const n = sloped ? Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 0.1) : 1;
    const lerp = (u, v, f) => [u[0] + (v[0] - u[0]) * f, u[1] + (v[1] - u[1]) * f];
    for (let j = 0; j < n; j++) {
      const v = [lerp(c[0], c[2], j / n), lerp(c[1], c[3], j / n), lerp(c[0], c[2], (j + 1) / n), lerp(c[1], c[3], (j + 1) / n)]
        .map(([x, z]) => [x, groundY(x, z) + lift, z]);
      pos.push(...v[0], ...v[2], ...v[1], ...v[1], ...v[2], ...v[3]);
    }
  }
  return finish(pos);
}

/** A fillet's asphalt (a fan from its corner), `lift` m over the ground. */
export function filletGeometry(f, lift, groundY) {
  const o = filletOutline(f), pos = [];
  // the region is star-shaped from its corner: a fan from there
  for (let k = 1; k < o.length - 1; k++) for (const [x, z] of [o[0], o[k], o[k + 1]]) pos.push(x, groundY(x, z) + lift, z);
  return finish(pos);
}

function finish(pos) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.computeVertexNormals();
  // the winding depends on the path's direction: make every face point up
  const n = geo.attributes.normal, p = geo.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    if (n.getY(i) >= 0) continue;
    const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}
