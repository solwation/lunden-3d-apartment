import * as THREE from 'three';
import { CAR_LIGHTS as K } from './config.js';
import { glowMaterial, fadeGlowWithFog, poolGeometry } from './groundglow.js';

// #2184: Olof's car lights the road in the dark. No light source: ONE merged additive decal (groundglow.js' fall-off,
// vertex colours per part) lies on the road in the car's own frame: two forward beam lobes, a red pool behind that
// brightens on braking and a white pool behind while reversing. Hidden by day and while the car stands. The tail lamps'
// emissive follows the same levels (car.js), and the reverse lamps are two small white lenses.

/** Pure: which lamp groups are wanted, 0…1 each. `decel` m/s² (positive = slowing), `speed` m/s along the path. */
export function lampTargets({ night, driving, speed, decel, reversing }) {
  const moving = driving && speed > K.movingSpeed;
  const braking = driving && (decel > K.brakeDecel || !moving); // slowing down, or held at a stop while still on its way
  return {
    head: night && driving ? 1 : 0, // the beam (the LED strips stay lit at night, car.js)
    tail: night ? K.tailNight : K.tailDay,
    brake: braking ? 1 : 0, // the tail lamps' extra brightness and the red pool
    reverse: reversing && driving ? 1 : 0, // the white lamps and pool
  };
}

/** Ease a lamp level towards its target (fast on, a little slower off, like a real lamp). */
export const easeLamp = (level, target, dt) => THREE.MathUtils.clamp(level + Math.sign(target - level) * Math.min(Math.abs(target - level), dt / (target > level ? K.fadeOn : K.fadeOff)), 0, 1);

/** The pools' mesh and their per-part colour update. Built facing +x (the car's frame), on the road (y 0). */
export function buildCarGlow(length) {
  const flat = () => 0, parts = [];
  const add = (geo, color, key) => { geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3)); parts.push({ geo, color: new THREE.Color(color), key }); };
  const nose = length / 2, tail = -length / 2;
  for (const s of [-1, 1]) add(poolGeometry(nose + K.beam.len / 2 - 0.4, s * K.beam.side, 1, 0, K.beam.len / 2, K.beam.width, flat, { lift: 0.04, rings: 6, segs: 20 }), K.beam.color, 'head');
  add(poolGeometry(tail - K.red.len * 0.35, 0, 1, 0, K.red.len, K.red.width, flat, { lift: 0.045, rings: 5, segs: 20 }), K.red.color, 'brake');
  add(poolGeometry(tail - K.white.len * 0.4, 0, 1, 0, K.white.len, K.white.width, flat, { lift: 0.05, rings: 5, segs: 20 }), K.white.color, 'reverse');
  const mats = parts.map((p) => p.geo);
  const geometry = mergeParts(mats);
  const mesh = new THREE.Mesh(geometry, fadeGlowWithFog(glowMaterial(0xffffff)));
  mesh.material.vertexColors = true; mesh.material.opacity = 1; mesh.visible = false; mesh.renderOrder = 3; mesh.frustumCulled = false; mesh.name = 'carGlow';
  const color = geometry.attributes.color;
  let at = 0; const ranges = parts.map((p) => { const r = { key: p.key, color: p.color, from: at, n: p.geo.attributes.position.count }; at += r.n; return r; });
  return { mesh, set(levels) {
    let any = false;
    for (const r of ranges) {
      const v = levels[r.key] * (r.key === 'head' ? K.beam.peak : r.key === 'brake' ? K.red.peak : K.white.peak); any ||= v > 0.002;
      for (let i = r.from; i < r.from + r.n; i++) color.setXYZ(i, r.color.r * v, r.color.g * v, r.color.b * v);
    }
    color.needsUpdate = true; mesh.visible = any;
  } };
}

function mergeParts(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  return g;
}

/** Two small white reverse lenses on the tailgate, lit only while reversing (a MeshBasicMaterial: no lighting). */
export function buildReverseLamps(length) {
  const geos = [-1, 1].map((s) => new THREE.BoxGeometry(0.03, 0.05, 0.12).translate(-length / 2 - 0.02, K.reverseLamp.y, s * K.reverseLamp.z));
  const m = new THREE.Mesh(mergeParts(geos.map((g) => g.toNonIndexed())), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  m.visible = false; m.name = 'reverseLamps';
  return m;
}
