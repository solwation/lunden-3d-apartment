import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAILBOX as M, SITE } from './config.js';
import { Openable } from './openables.js';
import { Binoculars } from './binoculars.js';
import { paint, box, doorT, mailboxY } from './mailboxbody.js';
export { mailboxBodyParts, mailboxY } from './mailboxbody.js';

// The yellow letterbox (#1706): a generic Swedish wall box (no logo, signal yellow, a letter slot and a latch) on the
// west flank of the Klockhuset's risalit, with the binoculars lying inside. Local frame: origin at the back plate's
// bottom centre, +x across, +y up, +z out of the wall (the front); `M.yaw` turns it into the world.
//  - the fixed sheet-metal body (back, top, bottom, sides, rain hood) has no mesh of its own: `mailboxBodyParts` hands
//    its tinted boxes to campusfacades.js `buildCentre`, which merges them into the school's white-trim batch (no draw call)
//  - the hatch is hinged at the bottom (an Openable 'flap', kind 'cabinet' in world.lids, so E / a tap, the saved
//    open state and the &open parameter all work as for any cabinet door): one small vertex-coloured mesh
//  - the binoculars (binoculars.js) lie in the cavity while the hatch is open

/** The hatch in its own frame: pivot at the bottom front edge, the hatch standing up from it (y 0 … h). */
function hatchGeometry() {
  const { w, h, colors } = M;
  return mergeGeometries([
    paint(box(w, h, doorT, 0, h / 2, -doorT / 2), colors.body),
    paint(box(0.26, 0.028, 0.006, 0, h - 0.09, 0.003), colors.slot),     // the letter slot
    paint(box(0.05, 0.03, 0.012, 0, h - 0.03, 0.006), colors.latch),      // the latch the hatch is pulled by
    paint(box(0.12, 0.05, 0.004, 0, h * 0.35, 0.002), 0xf4efe0),          // a blank label plate (no text, no logo)
  ]);
}

const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });

/**
 * The hatch, its Openable and the binoculars. `ground`: the terrain height at the box (main.js passes groundY).
 * Returns { group, lid, binoculars }; the caller adds `lid` to world.lids and `binoculars` to the holdables.
 */
export function buildMailbox(scene, camera, ground) {
  const group = new THREE.Group();
  group.position.set(M.x, mailboxY(ground), M.z);
  group.rotation.y = THREE.MathUtils.degToRad(M.yaw);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, M.d);
  const hatch = new THREE.Mesh(hatchGeometry(), vmat);
  hatch.castShadow = true;
  pivot.add(hatch);
  group.add(pivot);
  scene.add(group);
  group.updateMatrixWorld(true);
  const lid = new Openable({ name: 'brevlådans lucka', object: pivot, mode: 'flap', axis: [1, 0, 0], sign: 1, max: M.open, speed: M.speed });
  const binoculars = new Binoculars(scene, camera, group, lid);
  return { group, lid, binoculars };
}

/** The ground height the facade builder used for the Klockhuset (sitebackdrop.js: the highest terrain at its corners), so the
 * hatch sits exactly on the merged body. `terrainY` = surroundings.js `renderedTerrainY`. */
export function mailboxGround(terrainY) {
  const b = SITE.east.buildings.find((e) => e.source === '88457546');
  return Math.max(...b.polygon.slice(0, -1).map(([x, z]) => terrainY(x, z)));
}
