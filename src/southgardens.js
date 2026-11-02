import * as THREE from 'three';
import { SITE } from './config.js';
// #1806: clipped garden hedges round the villas' and white houses' plots (SITE.south.gardens, all *guess*), pushed into the south
// backdrop's facade batch as vertex-coloured two-sided tents: no draw call. See the config comment for the rules.
const distSeg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l)) : 0; return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
const inside = (x, z, p) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };
const roadDist = (x, z, roads) => Math.min(...roads.map(r => Math.min(...r.path.slice(1).map((c, i) => distSeg(x, z, r.path[i], c))) - r.w / 2));

/** The hedge pieces as `{a: [x, z], b: [x, z]}` in plan coordinates (testable without three's scene). */
export function gardenHedges() {
  const S = SITE.south, G = S.gardens, roads = [...S.paths, ...(S.access ?? [])], homes = S.buildings.filter(b => G.sources.includes(b.source)), plots = [], out = [];
  for (const b of homes) {
    const p = b.polygon.slice(0, -1); let len = 0, e = 0;
    p.forEach((q, i) => { const r = p[(i + 1) % p.length], d = Math.hypot(r[0] - q[0], r[1] - q[1]); if (d > len) { len = d; e = i; } });
    const a = p[e], c = p[(e + 1) % p.length], ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len, us = p.map(q => ux * q[0] + uz * q[1]), vs = p.map(q => -uz * q[0] + ux * q[1]);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs), um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    const at = (u, v) => [ux * u - uz * v, uz * u + ux * v], d = (u, v) => roadDist(...at(u, v), roads);
    const frontLow = d(um, v0 - G.front) < d(um, v1 + G.front); // the road side is the open front
    const vb0 = v0 - (frontLow ? G.front : G.back), vb1 = v1 + (frontLow ? G.back : G.front), ua = u0 - G.side, ub = u1 + G.side;
    plots.push({ box: [ua, ub, vb0, vb1], at, ux, uz });
    const vBack = frontLow ? vb1 : vb0, vFront = frontLow ? vb0 : vb1;
    for (const [p0, p1] of [[[ua, vBack], [ub, vBack]], [[ua, vBack], [ua, vFront]], [[ub, vBack], [ub, vFront]]]) {
      const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.ceil(l / G.piece);
      for (let k = 0; k < n; k++) {
        const s = [p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n], t = [p0[0] + (p1[0] - p0[0]) * (k + 1) / n, p0[1] + (p1[1] - p0[1]) * (k + 1) / n];
        const A = at(...s), B = at(...t), m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        if (roadDist(...m, roads) < G.roadClear || roadDist(...A, roads) < G.roadClear || roadDist(...B, roads) < G.roadClear) continue;
        if ((S.parking ?? []).some(q => q.polygon && inside(...m, q.polygon)) || S.buildings.some(q => inside(...m, q.polygon))) continue;
        // inside an earlier house's plot: the boundary is shared and drawn once
        if (plots.slice(0, -1).some(q => { const w = [q.ux * m[0] + q.uz * m[1], -q.uz * m[0] + q.ux * m[1]]; return w[0] > q.box[0] && w[0] < q.box[1] && w[1] > q.box[2] && w[1] < q.box[3]; })) continue;
        out.push({ a: A, b: B });
      }
    }
  }
  return out;
}

/** Pushes the hedges into `parts.facade`; `ground(x, z)` is the terrain height. */
export function gardenParts(ground, parts) {
  const G = SITE.south.gardens, col = new THREE.Color(G.color), hw = G.width / 2;
  for (const { a, b } of gardenHedges()) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l * hw, nz = dx / l * hw;
    const ya = ground(...a) - G.sink, yb = ground(...b) - G.sink, P = (p, y, s) => [p[0] + nx * s, y, p[1] + nz * s];
    const al = P(a, ya, -1), ar = P(a, ya, 1), at = P(a, ya + G.height, 0), bl = P(b, yb, -1), br = P(b, yb, 1), bt = P(b, yb + G.height, 0);
    const pts = [al, bl, bt, al, bt, at, ar, at, bt, ar, bt, br];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(pts.flatMap(() => [col.r, col.g, col.b]), 3)); g.computeVertexNormals();
    parts.facade.push(g);
  }
}
