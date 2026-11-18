// #2071: relief/roughness for the existing Hus L brick colour tile, without new geometry.
import * as THREE from 'three';
import { BRICK_SURFACE as B } from './config.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = (x, span) => ((x % span) + span) % span;

/** Linear RGBA bytes: R is shallow height, G roughness. All coordinates match exterior.js's colour canvas. */
export function brickSurfacePixels() {
  const n = B.size, bw = n / B.columns, bh = n / B.rows, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const row = Math.floor(y / bh), px = wrap(x + 0.5 - (row % 2 ? bw / 2 : 0), bw), py = y % bh + 0.5;
    const edge = Math.min(px, bw - px, py, bh - py);
    const face = smooth(B.jointPixels / 2, B.jointPixels / 2 + B.edgePixels, edge);
    // Integer periods keep the subtle clay grain continuous at repeat boundaries; mipmaps filter it on distant walls.
    const u = (x + 0.5) / n, v = (y + 0.5) / n;
    const grain = Math.sin(2 * Math.PI * (41 * u + 13 * v)) * Math.sin(2 * Math.PI * (17 * u - 53 * v));
    const at = 4 * (y * n + x);
    data[at] = Math.round(255 * (B.mortarHeight + (B.faceHeight - B.mortarHeight) * face + B.grainHeight * face * grain));
    data[at + 1] = Math.round(255 * (B.mortarRoughness + (B.faceRoughness - B.mortarRoughness) * face + B.grainRoughness * face * grain));
    data[at + 3] = 255;
  }
  return data;
}

let surface;
/** One cached packed map, used twice by the same Standard material; no colour-space conversion of either scalar. */
export function brickSurfaceTexture() {
  if (!surface) {
    surface = new THREE.DataTexture(brickSurfacePixels(), B.size, B.size, THREE.RGBAFormat);
    surface.name = 'Hus L brick height and roughness';
    surface.wrapS = surface.wrapT = THREE.RepeatWrapping;
    surface.flipY = true; // match the existing CanvasTexture's orientation, including alternate-row offsets
    surface.generateMipmaps = true;
    surface.minFilter = THREE.LinearMipmapLinearFilter;
    surface.magFilter = THREE.LinearFilter;
    surface.anisotropy = 8;
    surface.needsUpdate = true;
  }
  return surface;
}
