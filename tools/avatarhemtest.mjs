// #2019: the sweater hem clears the trouser waistband (no z-fighting) and long hair ends hang outside the back of the sweater.
// Rest pose (bind), both body types, every top / trouser variant: node --test tools/avatarhemtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { avatarModelGeometry } from '../src/avatar.js';
import { decodeAvatarLook } from '../src/config.js';

const REGION = { top: 1, pants: 2, hair: 3 };
/** The mesh of every triangle whose three vertices carry `region`, optionally only those in a y band. */
function part(g, region, y0 = -Infinity, y1 = Infinity) {
  const p = g.attributes.position, r = g.attributes.region, out = [];
  for (let i = 0; i < p.count; i += 3) {
    if (r.getX(i) !== region) continue;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    if (y < y0 || y > y1) continue;
    for (let k = 0; k < 3; k++) out.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
  }
  const m = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return new THREE.Mesh(m, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}
/** Outermost radius of `mesh` from the vertical axis at height y, azimuth a (0 = +z, front). */
const ray = new THREE.Raycaster();
function reach(mesh, y, a, cz = 0) {
  const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), o = new THREE.Vector3(0, y, cz);
  ray.set(o.clone().addScaledVector(d, 1), d.clone().negate()); ray.far = 1.2;
  const h = ray.intersectObject(mesh, false)[0];
  return h ? 1 - h.distance : null;
}
const base = decodeAvatarLook('241302112', 'hem-2019');
const HIP = 0.9;
export function hemGap(look) {
  const g = avatarModelGeometry(look), top = part(g, REGION.top, HIP - 0.05, HIP + 0.1), pants = part(g, REGION.pants, HIP - 0.2, HIP + 0.1);
  let min = Infinity, at;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) for (let y = HIP - 0.02; y <= HIP + 0.04; y += 0.005) {
    const t = reach(top, y, a), p = reach(pants, y, a);
    if (t === null || p === null) continue;
    if (t - p < min) { min = t - p; at = [+(a * 180 / Math.PI).toFixed(0), +y.toFixed(3)]; }
  }
  return { min, at };
}
for (const gender of [0, 1]) for (const [name, o] of [['t-shirt', { sleeves: 0, cut: 0 }], ['long sleeves', { sleeves: 1, cut: 0 }], ['hoodie', { sleeves: 1, cut: 2 }], ['wide trousers', { sleeves: 1, cut: 0, legs: 2 }]]) {
  test(`${gender ? 'female' : 'male'} ${name}: the hem stands off the waistband`, () => {
    const { min, at } = hemGap({ ...base, gender, figure: gender, style: 1, ...o });
    console.log(`  gap ${(min * 1000).toFixed(1)} mm at ${at}`);
    assert.ok(min >= 0.008, `hem gap ${min} m at (azimuth deg, y) ${at}`);
  });
}
for (const gender of [0, 1]) test(`${gender ? 'female' : 'male'} long hair ends lie outside the sweater back`, () => {
  const g = avatarModelGeometry({ ...base, gender, figure: gender, style: 1, sleeves: 1, cut: 0 });
  const top = part(g, REGION.top), p = g.attributes.position, r = g.attributes.region;
  let min = Infinity, at;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (r.getX(i) !== REGION.hair || z > -0.02 || Math.abs(x) > 0.12 || y > 1.3 || y < 1.0) continue;
    const t = reach(top, y, Math.atan2(x, z));
    if (t === null) continue;
    const m = Math.hypot(x, z) - t;
    if (m < min) { min = m; at = [x, y, z].map((v) => +v.toFixed(3)); }
  }
  console.log(`  hair margin ${(min * 1000).toFixed(1)} mm at ${at}`);
  assert.ok(min >= 0.002, `hair vertex inside the sweater by ${min} at ${at}`);
});
