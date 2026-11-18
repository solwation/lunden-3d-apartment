// #2121: cast-iron covers on the local streets and in the courtyard: round manhole covers down the middle of the carriageway,
// gully grates in the gutter against the kerb and a few small square drain grates on the courtyard walks. Flat geometry that
// lies on the existing surfaces (a few mm up, following the ground per vertex), merged into ONE vertex-coloured mesh: one draw,
// no texture, no collision (it does not change walking or driving). On phones the material is a plain vertex-coloured
// MeshStandardMaterial without the wet patch (#2118: it compiles to a program the scene already has); elsewhere the #2099 wet
// patch makes it dark and glossy in rain with the street. Hidden in the snow months (under the snow). Placement is
// deterministic from STREET_DRAINS and SITE (every place a *guess*).
import * as THREE from 'three';
import { SITE, STREET_DRAINS as D, STREET_WEAR, SEASON } from './config.js';
import { samples, nearestS, onRoad } from './roads.js';
import { wetGround } from './wetground.js';
import { lowMemory } from './lowmemory.js';
import { registerSeasonal } from './seasons.js';

/** The point `off` m right of `road`'s centre line at arc length `s` (as roads.js `along`): { x, z, nx, nz, w }. */
function pointAt(road, s, off = 0) {
  const S = samples(road);
  let k = 1;
  while (k < S.length - 1 && S[k].s < s) k++;
  const a = S[k - 1], b = S[k], f = b.s > a.s ? THREE.MathUtils.clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
  const w = a.w + (b.w - a.w) * f, nx = a.nx + (b.nx - a.nx) * f, nz = a.nz + (b.nz - a.nz) * f, l = Math.hypot(nx, nz);
  return { x: a.x + (b.x - a.x) * f + (nx / l) * off, z: a.z + (b.z - a.z) * f + (nz / l) * off, nx: nx / l, nz: nz / l, w };
}

/** The rectangles [x0, x1, z0, z1] a cover keeps `clear` of: repair patches, zebra crossings, the bridgehead island. */
export function keepOut() {
  const S = SITE.street, r = [];
  for (const [x, z, w, d] of [...S.patches, ...STREET_WEAR.patches]) r.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
  const c = S.crossing; r.push([c.x0, c.x1, c.z0, c.z1]);
  for (const b of S.bridgehead?.crossings ?? []) r.push([b.x0, b.x1, b.z0, b.z1]);
  const I = S.bridgehead?.island; if (I) r.push([I.x0, I.x1, I.z0, I.z1]);
  return r;
}

/** The footprint corners of a placement (`kind` 'manhole' | 'gully' | 'yard'): a square/rectangle round its outer edge. */
export function footprint(p) {
  const h = p.kind === 'manhole' ? [D.manhole.r + D.manhole.gap + D.manhole.rim, D.manhole.r + D.manhole.gap + D.manhole.rim]
    : p.kind === 'gully' ? [D.gully.along / 2, D.gully.across / 2] : [D.yard.size / 2, D.yard.size / 2];
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw); // local u (along) = (c, -s), v (across) = (s, c) in (x, z)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [p.x + c * a * h[0] + s * b * h[1], p.z - s * a * h[0] + c * b * h[1]]);
}

const overlaps = (pts, [x0, x1, z0, z1], m) => {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return Math.max(...xs) > x0 - m && Math.min(...xs) < x1 + m && Math.max(...zs) > z0 - m && Math.min(...zs) < z1 + m;
};

/** Every cover: [{ kind, x, z, yaw (rad, the local u axis runs along the road), road }], deterministic. */
export function drainPlacements() {
  const out = [], avoid = keepOut();
  const free = (p, road) => {
    const f = footprint(p);
    if (!f.every(([x, z]) => onRoad(x, z, -0.005))) return false; // wholly on asphalt
    if (f.some(([x, z]) => onRoad(x, z, 0.05, road))) return false; // not in a junction or the drive's mouth (on another road)
    if (avoid.some((r) => overlaps(f, r, D.clear))) return false;
    return !out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.5);
  };
  for (const row of D.rows) {
    const road = SITE.roads.find((r) => r.name === row.road);
    const s0 = Math.min(nearestS(road, ...row.from), nearestS(road, ...row.to)), s1 = Math.max(nearestS(road, ...row.from), nearestS(road, ...row.to));
    const place = (s, kind, off) => {
      for (const ds of [0, ...D.shifts]) {
        const t = s + ds;
        if (t < s0 || t > s1) continue;
        const c = pointAt(road, t, 0), across = off(c.w), q = pointAt(road, t, across);
        const p = { kind, x: q.x, z: q.z, yaw: Math.atan2(q.nx, q.nz), road: road.name, across };
        if (kind === 'gully') { // against a kerb: the ground just past the asphalt's edge is not road (a junction's mouth has none)
          const e = Math.sign(across) * (c.w / 2 + 0.375), o = pointAt(road, t, e);
          if (onRoad(o.x, o.z)) continue;
        }
        if (free(p, road)) { out.push(p); return; }
      }
    };
    for (let s = s0 + row.manholeStep / 2; s <= s1; s += row.manholeStep) place(s, 'manhole', () => row.across);
    for (const side of [1, -1]) {
      const phase = side > 0 ? 0 : row.gullyPhase * row.gullyStep;
      for (let s = s0 + row.gullyStep / 4 + phase; s <= s1; s += row.gullyStep) place(s, 'gully', (w) => side * (w / 2 - D.gully.kerbGap - D.gully.across / 2));
    }
  }
  for (const [x, z, yaw] of D.yard.at) out.push({ kind: 'yard', x, z, yaw: THREE.MathUtils.degToRad(yaw), road: null });
  return out;
}

/** The covers' merged geometry (non-indexed: position, normal, color). `ground(x, z)` = the road's ground (the asphalt lies 12 mm
 * over it), `yardGround(x, z)` = the courtyard's. Each vertex follows its own ground height; raised parts lie D.step m higher. */
export function drainGeometry(places, ground, yardGround = ground) {
  const pos = [], col = [], C = {};
  for (const [k, hex] of Object.entries(D.colors)) C[k] = new THREE.Color(hex); // linear, like vertex colours
  for (const p of places) {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw), yard = p.kind === 'yard', g = yard ? yardGround : ground, lift = yard ? D.yardLift : D.lift;
    const W = (u, v, layer) => { const x = p.x + c * u + s * v, z = p.z - s * u + c * v; return [x, g(x, z) + lift + layer * D.step, z]; };
    const tri = (a, b, d, color, layer) => {
      let A = W(...a, layer), B = W(...b, layer), E = W(...d, layer);
      if ((B[2] - A[2]) * (E[0] - A[0]) - (B[0] - A[0]) * (E[2] - A[2]) < 0) [B, E] = [E, B]; // face up
      pos.push(...A, ...B, ...E);
      for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b);
    };
    const quad = (u0, u1, v0, v1, color, layer) => { tri([u0, v0], [u1, v0], [u1, v1], color, layer); tri([u0, v0], [u1, v1], [u0, v1], color, layer); };
    const ring = (r0, r1, color, layer, n) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2, P = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
        if (r0 > 0) { tri(P(r0, a), P(r1, a), P(r1, b), color, layer); tri(P(r0, a), P(r1, b), P(r0, b), color, layer); }
        else tri([0, 0], P(r1, a), P(r1, b), color, layer);
      }
    };
    if (p.kind === 'manhole') {
      const M = D.manhole, R0 = M.r, R1 = R0 + M.gap, R2 = R1 + M.rim, n = M.segs;
      ring(R1, R2, C.rim, 0, n); ring(R0, R1, C.hole, 0, n); ring(0, R0, C.cover, 0, n);
      ring(R0 - M.edge, R0, C.raised, 1, n); // the cover's worn raised edge
      const half = (M.cell * M.stud) / 2, lim = R0 - M.edge - M.cell * 0.2;
      for (let i = -Math.ceil(R0 / M.cell); i <= Math.ceil(R0 / M.cell); i++) for (let j = -Math.ceil(R0 / M.cell); j <= Math.ceil(R0 / M.cell); j++) {
        const u = (i + 0.5) * M.cell, v = (j + 0.5) * M.cell;
        if (Math.hypot(Math.abs(u) + half, Math.abs(v) + half) < lim) quad(u - half, u + half, v - half, v + half, C.raised, 1);
      }
    } else {
      const G = yard ? D.yard : D.gully, hu = (yard ? G.size : G.along) / 2, hv = (yard ? G.size : G.across) / 2, f = G.frame;
      quad(-hu, hu, -hv, hv, C.hole, 0); // the dark slots under the bars
      quad(-hu, hu, -hv, -hv + f, C.rim, 1); quad(-hu, hu, hv - f, hv, C.rim, 1); quad(-hu, -hu + f, -hv + f, hv - f, C.rim, 1); quad(hu - f, hu, -hv + f, hv - f, C.rim, 1);
      const inner = 2 * (hu - f), gap = (inner - G.bars * G.bar) / (G.bars + 1); // bars across the gutter (along v), evenly spaced along u
      for (let i = 0; i < G.bars; i++) { const u0 = -hu + f + gap + i * (G.bar + gap); quad(u0, u0 + G.bar, -hv + f, hv - f, C.bars, 1); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals(); // non-indexed: each face's own normal (follows the slope)
  return geo;
}

/** The covers' material: plain vertex colours on phones (no hooks of its own: a program the scene already compiles), the
 * #2099 wet 'paint' patch elsewhere (no puddles on the iron; it darkens and shines with the street). */
export function drainMaterial(lite = lowMemory) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: D.roughness, metalness: D.metalness, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.name = 'street-drains';
  return lite ? m : wetGround(m, 'paint', lite);
}

/** The one mesh with every cover (street-details group), hidden in the snow months. */
export function buildDrains(ground, yardGround = ground, lite = lowMemory) {
  const mesh = new THREE.Mesh(drainGeometry(drainPlacements(), ground, yardGround), drainMaterial(lite));
  mesh.name = 'street-drains';
  mesh.receiveShadow = true; mesh.castShadow = false;
  registerSeasonal((month) => { mesh.visible = !SEASON.snowMonths.includes(month); });
  return mesh;
}
