// #2075: painted board relief; geometry and the existing cream-frame UV mask stay with screenwall.js.
import * as THREE from 'three';
import { SCREEN_WALL as W, SCREEN_WALL_SURFACE as S } from './config.js';

/** A gentle fibre path along a board; the endpoints stay within a small fraction of its width. */
export const screenGrainOffset = (t, phase) => S.grainBend * (Math.sin(t * 8 + phase) + .28 * Math.sin(t * 19 + phase * 1.7));

/** Canvas-oriented layout, flipped for DataTexture. Only the old four-pixel joints enter structural height. */
export function screenSurfaceData() {
  const width = 32 * W.boards, height = 512, data = new Uint8Array(width * height * 4);
  const rail = Math.round(W.rail / 1.8 * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = (x + .5) % 32, edge = Math.min(px, 32 - px);
    const u = Math.max(0, Math.min(1, (edge - 2) / S.edgePixels)), face = u * u * (3 - 2 * u);
    const board = Math.floor(x / 32), t = (y + .5) / height;
    const grain = Math.sin((px + screenGrainOffset(t, board + .7)) * 1.7 + board * 2.3);
    // UVs for posts/top/bottom sample the top rail: exactly constant across its full width.
    const frame = y < rail;
    const h = frame ? 1 : S.jointHeight + (1 - S.jointHeight) * face;
    const rough = frame ? S.frameRoughness : S.grooveRoughness + (S.faceRoughness - S.grooveRoughness) * face + grain * S.grainRoughness * face;
    const i = ((height - 1 - y) * width + x) * 4;
    data[i] = Math.round(h * 255); data[i + 1] = Math.round(rough * 255); data[i + 3] = 255;
  }
  return { width, height, data, rail };
}

let shared;
/** One cached linear map for the scalar channels, exactly aligned to the existing colour canvas. */
export function screenWallSurface() {
  if (!shared) {
    const { width, height, data } = screenSurfaceData();
    const map = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    map.name = 'painted-screen-height-roughness'; map.colorSpace = THREE.NoColorSpace;
    map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
    map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
    map.anisotropy = 8; map.needsUpdate = true;
    shared = { bumpMap: map, roughnessMap: map, bumpScale: S.depth, roughness: 1 };
  }
  return shared;
}
