import * as THREE from 'three';
import { VEHICLE_SHADOW as K } from './config.js';
import { poolGeometry } from './groundglow.js';

// #2185: soft contact shadows under parked cars and bicycles. The sun's shadow map only covers ±14 m round its target,
// so everything further out stood on the ground without touching it. One merged mesh per place (street car park + bike
// yard, east car parks, Olof's car): a soft oval under each body, darker patches under the wheels, a thin strip under
// each bike. Multiply-blended vertex colours (white = nothing, no texture, no light, no shadow caster), draped on the
// ground, one draw call. A vehicle that drives or is ridden away switches its own range off (`set`).

/** Pure: the ellipses ({ x, z, ax, az, ra, rb, strength, rings, segs }, world metres) one vehicle darkens.
 * `item` = { x, z, ax, az (its nose direction, any length), kind: 'car' | 'bike' }; `phone` leaves out the wheel patches. */
export function vehicleFootprint(item, phone = false, C = K) {
  const l = Math.hypot(item.ax, item.az) || 1, ux = item.ax / l, uz = item.az / l, vx = -uz, vz = ux;
  const at = (a, b) => [item.x + ux * a + vx * b, item.z + uz * a + vz * b];
  const out = [];
  const pool = (a, b, half, strength, rings, segs) => { const [x, z] = at(a, b); out.push({ x, z, ax: ux, az: uz, ra: half[0], rb: half[1], strength, rings, segs }); };
  if (item.kind === 'bike') { pool(C.bike.x, 0, C.bike.half, C.bike.strength, C.bike.rings, C.bike.segs); return out; }
  pool(C.car.x, 0, C.car.half, C.car.strength, C.car.rings, C.car.segs);
  if (!phone) for (const sx of [-1, 1]) for (const sz of [-1, 1]) pool(sx * C.tyre.x, sz * C.tyre.z, C.tyre.half, C.tyre.strength, C.tyre.rings, C.tyre.segs);
  return out;
}

/** Pure: the multiply factor (1 = untouched) at normalised radius r (0 centre, 1 rim): flat to `plateau`, then a smoothstep out for a pool of `strength`. */
export const shadeAt = (r, strength, C = K) => { const t = Math.min(1, Math.max(0, (r - C.plateau) / (1 - C.plateau))); return 1 - strength * (1 - t * t * (3 - 2 * t)); };

/** items: [{ x, z, ax, az, kind }]; ground(x, z) → y. Returns { mesh, count, set(i, on) } (the mesh is null without items). */
export function buildVehicleShadow(items, ground, { phone = false, name = 'vehicleShadow' } = {}) {
  const parts = [], ranges = [];
  let n = 0;
  for (const item of items) {
    const from = n;
    for (const e of vehicleFootprint(item, phone)) {
      const g = poolGeometry(e.x, e.z, e.ax, e.az, e.ra, e.rb, ground, { lift: K.lift, rings: e.rings, segs: e.segs });
      const uv = g.attributes.uv, col = new Float32Array(uv.count * 3);
      for (let i = 0; i < uv.count; i++) { /* vertex colours are linear, the output is sRGB-encoded: this is the multiplier as seen on screen */ const v = shadeAt(Math.hypot(uv.getX(i) - 0.5, uv.getY(i) - 0.5) * 2, e.strength) ** 2.2; col.set([v, v, v], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g); n += uv.count;
    }
    ranges.push([from, n]);
  }
  if (!n) return { mesh: null, count: 0, set() {} };
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const color = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('color', color);
  const base = col.slice(), on = new Array(items.length).fill(true);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.name = name; mesh.renderOrder = 1; mesh.raycast = () => {}; mesh.matrixAutoUpdate = false; mesh.userData.moving = false;
  geometry.computeBoundingSphere();
  return { mesh, count: items.length, set(i, show) {
    if (!ranges[i] || on[i] === show) return;
    on[i] = show;
    const [a, b] = ranges[i], arr = color.array;
    for (let k = a * 3; k < b * 3; k++) arr[k] = show ? base[k] : 1;
    color.needsUpdate = true;
  } };
}

/** The vehicles an array of instance matrices stands for (street/east car parks, bikes): position and nose (local +x) from each matrix. */
export function itemsFromMatrices(mats, kind) {
  return mats.map((m) => { const e = m.elements; return { x: e[12], z: e[14], ax: e[0], az: e[2], kind }; });
}
