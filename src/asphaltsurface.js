// #2072: one shared, deterministic local road surface; no road layout or per-frame work.
import * as THREE from 'three';
import { ASPHALT_SURFACE as A, COLORS, SEASON } from './config.js';
import { registerSeasonal } from './seasons.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { wetGround } from './wetground.js';
import { streetWear } from './streetwear.js';

const wrap = (n, span) => ((n % span) + span) % span;
const hash = (x, y, seed) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Periodic aggregate cells: small stone cores in darker binder, with independent mild tonal variation. */
export function asphaltData() {
  const n = A.size, cells = A.cells, color = new Uint8Array(n * n * 4), surface = new Uint8Array(n * n * 4);
  const base = [COLORS.asphalt >> 16, (COLORS.asphalt >> 8) & 255, COLORS.asphalt & 255];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = (x + .5) * cells / n, py = (y + .5) * cells / n, cx = Math.floor(px), cy = Math.floor(py);
    let best = Infinity, tone = 0, grain = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iy = cy + dy, wx = wrap(ix, cells), wy = wrap(iy, cells);
      const jx = .2 + .6 * hash(wx, wy, A.seed), jy = .2 + .6 * hash(wx, wy, A.seed + 1);
      const d = Math.hypot(px - ix - jx, py - iy - jy);
      if (d < best) { best = d; tone = hash(wx, wy, A.seed + 2); grain = hash(wx, wy, A.seed + 3); }
    }
    const core = Math.max(0, 1 - best / (.43 + grain * .17)), relief = core * core * (3 - 2 * core);
    const tint = 1 + A.colourVariation * ((tone - .5) * 1.4 + (core - .2) * .5);
    const i = (y * n + x) * 4;
    for (let k = 0; k < 3; k++) color[i + k] = Math.max(0, Math.min(255, Math.round(base[k] * tint)));
    color[i + 3] = 255;
    surface[i] = Math.round((.2 + .6 * relief) * 255);
    surface[i + 1] = Math.round((A.roughness[1] - (A.roughness[1] - A.roughness[0]) * relief) * 255);
    surface[i + 2] = 0; surface[i + 3] = 255;
  }
  return { color, surface, width: n, height: n };
}

/** Positions remain exact. World-metre UVs make adjoining strips/fillets share the same grain scale and phase. */
export function asphaltUV(geometry) {
  const p = geometry.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geometry;
}

let textures;
export function asphaltTextures() {
  if (textures) return textures;
  const { color, surface, width, height } = asphaltData();
  const texture = (data, name, colorSpace) => {
    const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    t.name = name; t.colorSpace = colorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.setScalar(1 / A.tile); t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  };
  return textures = { color: texture(color, 'asphalt-aggregate-colour', THREE.SRGBColorSpace), surface: texture(surface, 'asphalt-height-roughness', THREE.NoColorSpace) };
}

let material;
export function asphaltMaterial() {
  if (material) return material;
  const t = asphaltTextures();
  material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t.color, bumpMap: t.surface, bumpScale: A.depth, roughnessMap: t.surface, roughness: 1 });
  material.name = 'local-asphalt'; material.userData.asphaltSurface = true;
  material.onBeforeCompile = shader => {
    // vMapUv is transformed metric UV; without USE_MAP in snow, there is no broad colour modulation either.
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
      vec2 asphaltMeters = vMapUv * ${A.tile.toFixed(4)};
      float asphaltTone = sin(dot(asphaltMeters, vec2(${A.broadScale[0]}, ${A.broadScale[1]}))) * sin(dot(asphaltMeters, vec2(${A.broadScale[2]}, ${A.broadScale[3]})) + 1.7);
      diffuseColor.rgb *= 1.0 + ${A.broadStrength.toFixed(4)} * asphaltTone;
#endif`);
  };
  rememberFragmentCompile(material.onBeforeCompile);
  material.customProgramCacheKey = () => 'asphalt-surface-2072';
  streetWear(material, 'asphalt'); // #2103: tracks, cracks, edge cracks (the geometry carries roadFrame); before the wet patch
  wetGround(material, 'asphalt'); // #2099: darker, glossier, puddles in and after rain
  // registerSnow in the road's existing flat() caller still owns colour/map. Opt in only this new material's auxiliary channels.
  registerSeasonal(month => {
    const snow = SEASON.snowMonths.includes(month);
    material.bumpMap = snow ? null : t.surface;
    material.roughnessMap = snow ? null : t.surface;
    material.roughness = snow ? A.snowRoughness : 1;
    material.needsUpdate = true;
  });
  return material;
}
