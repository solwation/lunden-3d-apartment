// #2074: shallow joints for the existing patio paving; colour, geometry and metre UVs stay with their consumers.
import * as THREE from 'three';
import { PATIO, PAVING_SURFACE as S, SEASON } from './config.js';
import { registerSeasonal } from './seasons.js';
import { wetGround } from './wetground.js';

const edgeDistance = (p, span) => { const u = ((p % span) + span) % span; return Math.min(u, span - u); };

/** R = structural height, G = absolute roughness. Match pavingTexture's rounded pixel layout, never its colour speckle. */
export function pavingSurfaceData({ slab, joint } = PATIO.paving) {
  const px = Math.round(slab * S.ppm), jw = Math.max(1, Math.round(joint * S.ppm));
  const size = px * S.slabs, data = new Uint8Array(size * size * 4);
  const bevel = Math.max(S.minBevelPixels, S.bevel * S.ppm);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor((y + 0.5) / px), off = row % 2 ? px / 2 : 0;
    const d = Math.min(edgeDistance(x + 0.5 - off, px), edgeDistance(y + 0.5, px));
    const t = Math.min(1, Math.max(0, (d - jw / 2) / bevel)), face = t * t * (3 - 2 * t);
    const i = 4 * (y * size + x);
    data[i] = Math.round(face * 255);
    data[i + 1] = Math.round((S.groutRoughness + (S.faceRoughness - S.groutRoughness) * face) * 255);
    data[i + 3] = 255;
  }
  return { data, size };
}

let surface;
/** One shared linear packed map, registered to the existing CanvasTexture orientation and metre repeat. */
export function pavingSurfaceTexture() {
  if (surface) return surface;
  const { data, size } = pavingSurfaceData();
  surface = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  surface.name = 'paving-height-roughness'; surface.colorSpace = THREE.NoColorSpace;
  surface.wrapS = surface.wrapT = THREE.RepeatWrapping;
  surface.repeat.setScalar(1 / (PATIO.paving.slab * S.slabs));
  surface.flipY = true; // same top-first rows and half-bond orientation as pavingTexture's canvas
  surface.generateMipmaps = true; surface.minFilter = THREE.LinearMipmapLinearFilter;
  surface.magFilter = THREE.LinearFilter; surface.anisotropy = 8; surface.needsUpdate = true;
  return surface;
}

/** Keep the incoming colour map exact. Only exposed paving opts into auxiliary-map snow handling. */
export function pavingMaterial(map, { snow = false } = {}) {
  const packed = pavingSurfaceTexture();
  const material = new THREE.MeshStandardMaterial({ map, bumpMap: packed, bumpScale: S.depth,
    roughnessMap: packed, roughness: 1 });
  if (snow) wetGround(material, 'paving'); // #2099: exposed paving gets wet in rain too; sheltered stays dry
  // #2176: the bump / roughness maps stay: the patchy snow step (snowground.js, via registerSnow at the consumer) flattens the normal where snow lies
  return material;
}
