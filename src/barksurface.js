// #2081: shallow bark shading; original colour canvases and their RNG remain independent.
import * as THREE from 'three';
import { BARK_SURFACE as S, FOLIAGE as F } from './config.js';

/** Reproduce only the authored marks' locations using a private RNG, never advancing the colour stream. */
export function barkMarks(kind, size = F.bark) {
  let seed = kind === 'birch' ? 5 : 3;
  const r = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  return Array.from({ length: kind === 'birch' ? 26 : 40 }, () => {
    if (kind === 'birch') {
      const y = r() * size * 2, x = r() * size, w = size * (.08 + r() * .35), h = 1 + r() * 3.5;
      r(); // the existing mark's colour choice
      return { x, y, w, h };
    }
    const x = r() * size, w = 1 + r() * 3; r(); // the existing furrow's grey
    return { x, w };
  });
}
const tau = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapped = (x, period) => x - Math.round(x / period) * period;
const smooth = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** Bottom-first data, with features generated in the original canvas frame. R = height, G = absolute roughness. */
export function barkSurfaceData(kind = 'bark', size = F.bark) {
  const width = size, height = size * 2, data = new Uint8Array(width * height * 4), marks = barkMarks(kind, size), birch = kind === 'birch', K = birch ? S.birch : S.bark;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + .5) / width, v = (y + .5) / height;
    const wave = Math.sin(tau * (u * 7) + .4 * Math.sin(tau * v)), fine = Math.sin(tau * (v * 3) + Math.sin(tau * u * 2));
    let heightValue, roughness;
    if (birch) {
      // White bark undulates gently. The dark lenticels are colour marks, never height pits.
      heightValue = .5 + S.birch.wave * wave + S.birch.fine * fine;
      let lenticel = 0;
      for (const m of marks) {
        const dx = Math.abs(wrapped(x + .5 - m.x - m.w / 2, width)), dy = Math.abs(y + .5 - m.y - m.h / 2);
        lenticel = Math.max(lenticel, smooth((m.w / 2 + .5 - dx) / .9) * smooth((m.h / 2 + .5 - dy) / .9));
      }
      roughness = K.roughness[0] + K.tone * (.5 + .5 * fine) + K.mark * lenticel;
    } else {
      let furrow = 0;
      for (const [i, m] of marks.entries()) {
        const dx = wrapped(x + .5 - m.x - m.w / 2 - S.bark.bend * Math.sin(tau * v + i), width);
        furrow += Math.exp(-.5 * (dx / (m.w * .3 + .35)) ** 2);
      }
      const depth = 1 - Math.exp(-furrow * .55);
      heightValue = .64 - K.groove * depth + K.grain * fine;
      roughness = K.roughness[0] + (K.roughness[1] - K.roughness[0]) * depth + K.tone * wave;
    }
    const i = ((height - 1 - y) * width + x) * 4;
    data[i] = Math.round(255 * clamp(heightValue, 0, 1));
    data[i + 1] = Math.round(255 * clamp(roughness, K.roughness[0], K.roughness[1]));
    data[i + 2] = 0; data[i + 3] = 255;
  }
  return { data, width, height };
}

const textures = new Map();
/** Two small cached linear maps in the original colour UV frame. No canvas readback or per-frame upload. */
export function barkSurfaceTexture(kind = 'bark') {
  if (textures.has(kind)) return textures.get(kind);
  const { data, width, height } = barkSurfaceData(kind);
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = `bark-surface-${kind}`;
  texture.colorSpace = THREE.NoColorSpace; texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1, 2);
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.anisotropy = 2; texture.needsUpdate = true;
  textures.set(kind, texture);
  return texture;
}

export function applyBarkSurface(material, kind = 'bark') {
  material.bumpMap = material.roughnessMap = barkSurfaceTexture(kind);
  material.bumpScale = (kind === 'birch' ? S.birch : S.bark).bump;
  material.roughness = 1; // G stores the absolute finish; do not multiply the old birch .85 twice.
  return material;
}
