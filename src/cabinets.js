import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sfx } from './audio.js';

// Wall cabinets that open (#138): a hollow carcass on a wall, a shelf, and one side-hung door per unit, each
// its own E target (kind 'cabinet', in world.lids via the level's appliances). Whatever is inside is passed in
// as geometry per material and merged. Built along a wall facing +x or −x (the plan's walls run along z).

const OPEN_DEG = 100;

/**
 * spec: { wall (x of the wall face), dir (+1 = the cabinet faces +x), z0, z1, y0, y1, depth, units, material
 *   (carcass + doors), handle (material), contents: [[geometries], material][] (world coordinates) }
 * Returns { object, doors } — doors are E targets with update(dt).
 */
export function wallCabinet(spec) {
  const { wall, dir, z0, z1, y0, y1, depth, units, material, handle } = spec;
  const g = new THREE.Group(), t = 0.016, H = y1 - y0, W = z1 - z0, front = wall + dir * depth;
  const xc = wall + dir * depth / 2, yc = (y0 + y1) / 2, zc = (z0 + z1) / 2;
  const carcass = [];
  const b = (sx, sy, sz, x, y, z) => carcass.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
  b(depth, t, W, xc, y0 + t / 2, zc); b(depth, t, W, xc, y1 - t / 2, zc); // bottom, top
  for (let i = 0; i <= units; i++) b(depth, H, t, xc, yc, Math.min(z1 - t / 2, Math.max(z0 + t / 2, z0 + (W * i) / units))); // sides
  b(t, H, W, wall + dir * t / 2, yc, zc); // back
  b(depth - 0.03, 0.014, W - 0.03, xc - dir * 0.01, y0 + H * 0.5, zc); // shelf
  const body = new THREE.Mesh(mergeGeometries(carcass), material);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  for (const [geos, m] of spec.contents ?? []) {
    const o = new THREE.Mesh(mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x))), m);
    o.castShadow = true;
    g.add(o);
  }
  const doors = [];
  for (let i = 0; i < units; i++) {
    const a = z0 + (W * i) / units, w = W / units, atZ0 = i % 2 === 0; // hinges alternate: pairs open from the middle
    const door = new THREE.Group();
    door.position.set(front, y0, atZ0 ? a : a + w);
    const s = atZ0 ? 1 : -1; // panel runs from the hinge along s·z
    const add = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = true; door.add(o); };
    add(0.019, H - 0.003, w - 0.004, dir * 0.0095, H / 2, s * w / 2, material);
    add(0.02, 0.012, 0.012, dir * 0.03, 0.06, s * (w - 0.035), handle); // a knob near the free edge, low (it hangs high)
    const cab = {
      name: 'skåpet', kind: 'cabinet', isOpen: false, t: 0, object: door, pickable: door,
      toggle() { this.isOpen = !this.isOpen; sfx.click(door.getWorldPosition(new THREE.Vector3())); },
      update(dt) {
        const target = this.isOpen ? 1 : 0;
        this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 2.5);
        door.rotation.y = s * dir * this.t * this.t * (3 - 2 * this.t) * THREE.MathUtils.degToRad(OPEN_DEG);
      },
    };
    door.traverse((m) => { m.userData.door = cab; });
    g.add(door);
    doors.push(cab);
  }
  return { object: g, doors };
}
