import * as THREE from 'three';
import { freeCanvasAfterUpload } from './lowmemory.js';

/** #1825: self-drawn facade lettering, one quad/draw near the gym and none beyond native LOD's far level.
 * Separate from the untextured vertex-colour glass batch: re-atlasing every window/solar panel would add complexity. */
export function buildNordicGymSign(building) {
  const S = building.model.front.sign, N = building.nordicGym;
  const canvas = document.createElement('canvas'); canvas.width = S.canvas[0]; canvas.height = S.canvas[1];
  const g = canvas.getContext('2d'), [w, h] = S.canvas;
  g.clearRect(0, 0, w, h); g.textAlign = 'right'; g.textBaseline = 'alphabetic';
  g.font = `800 ${S.titlePx}px system-ui, sans-serif`; g.fillStyle = S.color;
  g.fillText('NORDICWELLNESS', w - S.marginPx, S.titleY, w - S.marginPx * 2);
  g.font = `700 ${S.subtitlePx}px system-ui, sans-serif`; g.fillStyle = '#ffffff';
  g.fillText('SPORTCENTER', w - S.marginPx, h - S.marginPx);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = S.anisotropy; freeCanvasAfterUpload(texture);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S.width, S.height), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, alphaTest: S.alphaTest, depthWrite: false, toneMapped: false
  })); // FrontSide: exactly one pass; no shadow or light.
  mesh.name = 'nordic-wellness-lettering';
  mesh.userData.noDetail = true; // this sign's native LOD owns its distance policy

  const [ux, uz] = N.axis, [ox, oz] = N.centre, x = N.x0 - S.offset;
  const z = N.z1 - building.model.glass.east - S.right - S.width / 2;
  mesh.rotation.y = Math.atan2(-ux, -uz); // front looks out of the short road face (local -x)
  const lod = new THREE.LOD(); lod.name = 'nordic-wellness-sign';
  lod.position.set(ox + x * ux - z * uz, building.eave - S.top - S.height / 2, oz + x * uz + z * ux);
  lod.addLevel(mesh, 0); lod.addLevel(new THREE.Group(), S.far);
  return lod;
}
