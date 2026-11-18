// #2084: small sewn trainer details in the existing upper's frame; no new render path.
import * as THREE from 'three';
import { AVATAR_TRAINERS as S } from './config.js';
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** Clip an XZ detail to each real upper triangle: no smooth-ellipsoid approximation or sunken chords. */
function patch(upper, polygons, lift) {
  upper.computeBoundingBox();
  const top = upper.boundingBox.max.y, p = upper.attributes.position, n = upper.attributes.normal, indices = upper.index?.array ?? Array.from({ length: p.count }, (_, i) => i), position = [], normal = [];
  for (let i = 0; i < indices.length; i += 3) {
    const ids = Array.from(indices.slice(i, i + 3)), t = ids.map(j => [p.getX(j), p.getZ(j)]), area = cross(...t);
    if (Math.abs(area) < 1e-12) continue;
    for (const polygon of polygons) {
      let poly = polygon;
      for (let edge = 0; edge < 3 && poly.length; edge++) {
        const a = t[edge], b = t[(edge + 1) % 3], next = [], side = q => cross(a, b, q) / area;
        for (let j = 0; j < poly.length; j++) {
          const a0 = poly[j], b0 = poly[(j + 1) % poly.length], da = side(a0), db = side(b0), ina = da >= -1e-10, inb = db >= -1e-10;
          if (ina) next.push(a0);
          if (ina !== inb) { const f = da / (da - db); next.push([a0[0] + (b0[0] - a0[0]) * f, a0[1] + (b0[1] - a0[1]) * f]); }
        }
        poly = next;
      }
      for (let j = 1; j + 1 < poly.length; j++) {
        let tri = [poly[0], poly[j], poly[j + 1]];
        const a = cross(...tri); if (Math.abs(a) < 1e-12) continue;
        if (a > 0) tri = [tri[0], tri[2], tri[1]]; // +Y facing in XYZ
        for (const q of tri) {
          const w = [cross(t[1], t[2], q) / area, cross(t[2], t[0], q) / area, cross(t[0], t[1], q) / area];
          position.push(q[0], Math.min(top, ids.reduce((v, k, m) => v + p.getY(k) * w[m], lift)), q[1]); // retain the original highest point
          const v = new THREE.Vector3(); ids.forEach((k, m) => v.addScaledVector(new THREE.Vector3().fromBufferAttribute(n, k), w[m]));
          v.normalize(); normal.push(...v.toArray());
        }
      }
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(position, 3)).setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
}
function ribbon(a, b, width) {
  const dx = b[0] - a[0], dz = b[1] - a[1], k = width / (2 * Math.hypot(dx, dz)), x = -dz * k, z = dx * k;
  return [[a[0] + x, a[1] + z], [b[0] + x, b[1] + z], [b[0] - x, b[1] - z], [a[0] - x, a[1] - z]];
}
/** One-time per cached variant. All details receive the same rigid foot binding in avatar.js. */
export function trainerDetails(upper) {
  const T = S.tongue, L = S.laces, P = S.panels;
  const tongue = [[-T.x, T.z[0]], [T.x, T.z[0]], [T.x, T.z[1]], [-T.x, T.z[1]]];
  const panels = [-1, 1].flatMap(side => P.x.slice(1).map((_, j) => ribbon([side * P.x[j], P.z[j]], [side * P.x[j + 1], P.z[j + 1]], P.width)));
  const result = [{ geometry: patch(upper, [tongue], T.lift), shade: T.shade }, { geometry: patch(upper, panels, P.lift), shade: P.shade }];
  for (const side of [-1, 1]) {
    const laces = Array.from({ length: L.count }, (_, j) => { const z = L.z + j * L.step; return ribbon([side * L.x, z], [-side * L.x, z + L.run], L.width); });
    result.push({ geometry: patch(upper, laces, L.lift + (side > 0 ? L.over : 0)), shade: 1, colour: S.soleColour });
  }
  return result;
}
