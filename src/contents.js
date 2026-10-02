import * as THREE from 'three';

// What is inside cabinets and drawers (#228): one shared helper. Contents are built as world-space meshes (merged per
// material by the caller, e.g. interior.js's Batch) and handed to `attachContents` with the Openable that closes them:
//   - `carry: true` (drawers, and anything that moves with the front): the meshes become children of the Openable's
//     pivot (`object`), so they slide out with it;
//   - otherwise they sit still in the carcass (a hinged door swings away from them) in a group the caller adds to the scene.
// Either way they are hidden while the front is shut (no draw calls, no triangles for closed cabinets) and shown as soon
// as it starts to open. They are decoration: no E targets (raycast off). `openable.contents` = the group.

/**
 * @param {THREE.Mesh[]} meshes  world-space meshes (merged per material)
 * @param {object} openable      an Openable-like ({ object, isOpen, t, update })
 * @returns {THREE.Group} the group (already in the pivot when `carry`; add it to the scene yourself otherwise)
 */
export function attachContents(meshes, openable, { carry = false } = {}) {
  const g = new THREE.Group();
  g.name = 'contents';
  for (const m of meshes) {
    m.raycast = () => {}; // decoration: never an E target, never in the way of one
    g.add(m);
  }
  if (carry) {
    const piv = openable.object;
    piv.updateWorldMatrix(true, false);
    // the pivot is at its home (closed) pose now: bring the world-space geometry into its frame
    const inv = piv.matrixWorld.clone().invert();
    for (const m of meshes) { m.geometry.applyMatrix4(inv); m.geometry.computeBoundingSphere(); }
    piv.add(g);
  }
  g.visible = false;
  const update = openable.update.bind(openable);
  openable.update = (dt) => {
    update(dt);
    g.visible = openable.isOpen || openable.t > 0;
  };
  openable.contents = g;
  return g;
}
