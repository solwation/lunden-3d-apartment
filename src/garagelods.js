import { GARAGE } from './config.js';
import { lodRange, patchDitherLod, lodDepthMaterial } from './lod.js';

/** One garage rack/storage row: keep its actual near/far meshes, horizontal distance and sphere-radius allowance.
 * The basement's fluorescent lighting animates the shell colour; both clones share that very Color, never a snapshot. */
export function garageBikeRowLod(hi, lo, shell) {
  hi.geometry.boundingSphere ?? hi.geometry.computeBoundingSphere();
  const { center: c, radius: r } = hi.geometry.boundingSphere;
  const range = lodRange(GARAGE.bikeLodNear + r - GARAGE.bikeLodFade / 2, GARAGE.bikeLodNear + r + GARAGE.bikeLodFade / 2);
  const centre = { value: c.clone() };
  for (const [mesh, far] of [[hi, false], [lo, true]]) {
    const mat = shell.clone(); mat.color = shell.color;
    mesh.material = patchDitherLod(mat, { far, range, centre });
    if (mesh.castShadow) mesh.customDepthMaterial = lodDepthMaterial({ far, range, centre, side: mat.side });
  }
  lo.visible = false;
  const row = { hi, lo, c, r, range, centre,
    update(cameraPosition) {
      centre.value.set(c.x, cameraPosition.y, c.z); // the old policy uses horizontal distance, not camera height
      const d = Math.hypot(cameraPosition.x - c.x, cameraPosition.z - c.z);
      hi.visible = d < range.value.y; lo.visible = d > range.value.x;
    } };
  hi.userData.garageBikeLod = lo.userData.garageBikeLod = row;
  return row;
}
