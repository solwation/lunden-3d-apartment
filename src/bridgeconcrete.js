// #2076: one shared mineral surface for the existing bridge concrete, with a flat granite swatch.
import * as THREE from 'three';
import { BRIDGE_CONCRETE as C } from './config.js';

const hash = (x, y) => {
  let h = Math.imul((x + C.size) % C.size, 374761393) ^ Math.imul((y + C.size) % C.size, 668265263) ^ C.seed;
  h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296;
};
/** R = shallow height; G = matte roughness. Linear data, no painted colour or assumed cracks/joints. */
export function bridgeConcreteData() {
  const n = C.size, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const grain = hash(x, y), smooth = (hash(x - 1, y) + hash(x + 1, y) + hash(x, y - 1) + hash(x, y + 1)) / 4;
    let pore = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const h = hash(x + dx, y + dy);
      if (h < C.pores) pore = Math.max(pore, Math.max(0, 1 - Math.hypot(dx, dy) / 1.8) * (0.55 + h / C.pores * 0.45));
    }
    const flat = Math.abs(x + .5 - n / 2) < C.flat / 2 && Math.abs(y + .5 - n / 2) < C.flat / 2;
    const i = (y * n + x) * 4;
    data[i] = flat ? 128 : Math.round(255 * (.53 + .09 * (grain - .5) + .12 * (smooth - .5) - .38 * pore));
    data[i + 1] = flat ? 255 : Math.round(255 * (C.roughness[0] + (C.roughness[1] - C.roughness[0]) * (.35 * grain + .65 * pore)));
    data[i + 2] = 0; data[i + 3] = 255;
  }
  return data;
}
/** Existing UV attribute, in bridge-local metres before bridge rotation; granite samples one flat point. */
export function bridgeConcreteUV(g, granite = false) {
  const p = g.attributes.position, normal = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (granite) uv.setXY(i, C.tile / 2, C.tile / 2);
    else if (Math.abs(normal.getY(i)) > .5) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (Math.abs(normal.getX(i)) > .5) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}
let surface;
export function bridgeConcreteTexture() {
  if (surface) return surface;
  surface = new THREE.DataTexture(bridgeConcreteData(), C.size, C.size, THREE.RGBAFormat);
  surface.name = 'bridge-concrete2076'; surface.colorSpace = THREE.NoColorSpace;
  surface.wrapS = surface.wrapT = THREE.RepeatWrapping; surface.repeat.setScalar(1 / C.tile);
  surface.generateMipmaps = true; surface.minFilter = THREE.LinearMipmapLinearFilter;
  surface.magFilter = THREE.LinearFilter; surface.anisotropy = 4; surface.needsUpdate = true;
  return surface;
}
export function bridgeConcreteMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true,
    bumpMap: bridgeConcreteTexture(), bumpScale: C.bump, roughnessMap: bridgeConcreteTexture(), roughness: C.baseRoughness });
}
