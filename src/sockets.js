import * as THREE from 'three';
import { KITCHEN, KITCHEN_SOCKETS as S } from './config.js';

// The kitchen's wall sockets (#442, #510, KITCHEN_SOCKETS): black double sockets at the top of the splashback, just under
// the wall cabinets, on the east wall facing west. `mouths()` = every socket mouth (world point on the plate's face,
// where a plug goes in, facing −x); interior.js merges their geometry into the kitchen (`socketGeometry`); the air
// fryer, the Moccamaster and the toaster run their cords to them.

const y = () => KITCHEN.wallBottom - S.below; // the plates' centre height (Entréplan: the floor is y 0)

/** Every mouth: { id ('coffee-n' …), x, y, z, taken (the appliance using it, or undefined) }. */
export function mouths() {
  const out = [];
  for (const a of S.at) for (const [side, k] of [['n', -1], ['s', 1]]) {
    const id = `${a.id}-${side}`;
    out.push({ id, x: S.wall - S.plate.t, y: y(), z: a.z + k * S.pitch / 2, taken: S.taken[id] });
  }
  return out;
}

/** A mouth as a Vector3. */
export const mouthPoint = (m, out = new THREE.Vector3()) => out.set(m.x, m.y, m.z);

/** The free mouth nearest `p` (world), or null. */
export function nearestFree(p) {
  let best = null, bd = Infinity;
  for (const m of mouths()) {
    if (m.taken) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/** The geometry of every plate, per material: { plate: [geos], cup: [geos], hole: [geos] } (world space). */
export function socketGeometry() {
  const P = S.plate, parts = { plate: [], cup: [], hole: [] }, yc = y();
  for (const a of S.at) {
    // the plate: a slightly rounded slab on the tiles (thin; its face at S.wall − t)
    parts.plate.push(new THREE.BoxGeometry(P.t, P.h, P.w).translate(S.wall - P.t / 2, yc, a.z));
    for (const k of [-1, 1]) {
      const z = a.z + k * S.pitch / 2;
      // the round recess (a shallow grey cup) and the two pin holes (horizontal, like a Schuko socket) + the earth clips
      parts.cup.push(new THREE.CylinderGeometry(S.r, S.r, 0.002, 24).rotateZ(Math.PI / 2).translate(S.wall - P.t - 0.0005, yc, z));
      for (const d of [-1, 1]) parts.hole.push(new THREE.CylinderGeometry(0.0024, 0.0024, 0.002, 10).rotateZ(Math.PI / 2).translate(S.wall - P.t - 0.0012, yc, z + d * 0.0095));
      for (const d of [-1, 1]) parts.hole.push(new THREE.BoxGeometry(0.0015, 0.006, 0.003).translate(S.wall - P.t - 0.0012, yc + d * (S.r - 0.003), z));
    }
  }
  return parts;
}

/** A plug at mouth `m` (a child of `parent`, which must have its world matrix up to date): a short black body sticking
 * out of the socket along −x. Returns the mesh. */
export function plugAt(parent, m, material) {
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.03, 16).rotateZ(Math.PI / 2), material);
  parent.updateWorldMatrix(true, false);
  plug.position.copy(parent.worldToLocal(new THREE.Vector3(m.x - 0.015, m.y, m.z)));
  plug.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert()); // square to the walls
  plug.raycast = () => {};
  return plug;
}

/** A cord's points (world) from `a` (where it leaves the appliance, on the worktop or low on its back) along the worktop
 * to the wall under mouth `m`, up the splashback and into the plug. `top` = the worktop's height. */
export function cordToMouth(a, m, top, back = null) {
  const V = (x, yy, z) => new THREE.Vector3(x, yy, z), wx = S.wall - 0.006, lay = top + 0.004;
  const pts = [a.clone()];
  if (back) pts.push(a.clone().addScaledVector(back, 0.03).setY(Math.max(lay, a.y - 0.01)));
  const near = V(wx - 0.02, lay, (pts[pts.length - 1].z + m.z) / 2);
  pts.push(near, V(wx, lay + 0.03, m.z), V(wx, m.y - 0.12, m.z), V(wx - 0.004, m.y - 0.035, m.z), V(m.x - 0.03, m.y, m.z));
  return pts;
}
