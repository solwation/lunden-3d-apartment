import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ELCABINET as E, SPRAY as S } from './config.js';
import { Openable } from './openables.js';
import { SprayCan } from './spraycan.js';
import { doorT, cabinetY } from './elcabinetbody.js';

// The grey electrical cabinet by Sankt Lars väg with the spray cans (#1707). A generic sheet-metal kopplingsskåp (no logo,
// no text). Local frame as elcabinetbody.js: origin at the back's bottom centre, +x across, +z out of the front; `E.yaw`.
//  - the fixed body has no mesh of its own: elcabinetbody.js `cabinetBodyParts` is merged into street.js's metal pole batch
//  - the door is side-hinged (an Openable 'hinge', kind 'cabinet' in world.lids, so E / a tap, the saved open state and the
//    &open parameter all work as for any cabinet door): one small vertex-coloured mesh
//  - S.cans spray cans (spraycan.js) stand in a row on the shelf, drawn only while the door is open (or out of the cabinet)

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** The door in its own frame: pivot at the hinge (the front's left edge seen from outside), the door reaching +x. */
function doorGeometry() {
  const { w, h, plinth, colors: C } = E, dh = h - plinth - 0.01, y = plinth + 0.005 + dh / 2, parts = [paint(box(w, dh, doorT, w / 2, y, -doorT / 2), C.door)];
  for (const vy of [0.22, 0.27, 0.32, dh - 0.12, dh - 0.07]) parts.push(paint(box(w * 0.5, 0.012, 0.004, w / 2, plinth + vy, 0.002), C.vent)); // louvres low and high
  parts.push(paint(box(0.025, 0.11, 0.018, w - 0.06, y, 0.009), C.handle));              // the handle (right side, away from the hinge)
  parts.push(paint(box(0.14, 0.07, 0.003, w / 2, plinth + dh * 0.68, 0.0015), C.label)); // a blank label plate
  return mergeGeometries(parts);
}

const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });

/**
 * The door, its Openable and the cans. `ground`: the same terrain height street.js used for the body (surroundings.js
 * `lampGroundY`); `graffiti`: the shared paint; `hooks`: { score, pay, say } (main.js, the score path).
 * Returns { group, lid, cans }; the caller adds `lid` to world.lids and the cans to the holdables.
 */
export function buildElCabinet(scene, camera, ground, graffiti, hooks) {
  const group = new THREE.Group();
  group.position.set(E.x, cabinetY(ground), E.z);
  group.rotation.y = THREE.MathUtils.degToRad(E.yaw);
  group.name = 'elcabinet';
  const pivot = new THREE.Group();
  pivot.position.set(-E.w / 2, 0, E.d);
  const door = new THREE.Mesh(doorGeometry(), vmat);
  door.castShadow = true;
  pivot.add(door);
  group.add(pivot);
  scene.add(group);
  group.updateMatrixWorld(true);
  const lid = new Openable({ name: 'elskåpets dörr', object: pivot, mode: 'hinge', sign: -1, max: E.open, speed: E.speed });
  const qGroup = group.getWorldQuaternion(new THREE.Quaternion()), n = S.cans.length, inner = E.w - 2 * E.wall - 0.04, step = inner / n;
  const slot = new THREE.Vector3(step, S.can.h + S.can.cap, (E.d - doorT) * 0.8).applyQuaternion(qGroup);
  const cans = S.cans.map((_, i) => {
    const local = new THREE.Vector3(-inner / 2 + step * (i + 0.5), E.shelf + (S.can.h + S.can.cap) / 2 + 0.001, (E.d - doorT) / 2 + 0.01);
    const pos = group.localToWorld(local.clone());
    const rot = new THREE.Euler().setFromQuaternion(qGroup.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))); // nozzles towards the door
    return new SprayCan(scene, camera, { home: { pos, rot, pick: { pos: pos.clone(), size: [Math.abs(slot.x), Math.abs(slot.y), Math.abs(slot.z)] } }, lid, index: i, graffiti, hooks });
  });
  return { group, lid, cans };
}
