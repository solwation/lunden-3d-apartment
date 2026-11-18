// #2096: one shared, deterministic gravel surface (small stones of varied brightness, darker fines between them, soft tone
// patches and a little roughness/relief variation) for the courtyard gravel, the boule court and the park's gravel paths.
// No new draws or per-frame work: the existing batches swap their flat colour for this map, built once.
import * as THREE from 'three';
import { GRAVEL_SURFACE as G, SEASON } from './config.js';
import { registerSeasonal } from './seasons.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { grassPatchNoise, grassPatchField, linearMean } from './grassdetail.js';

const wrap = (n, span) => ((n % span) + span) % span;
const hash = (x, y, seed) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const toLinear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const toByte = (l) => { l = Math.max(0, l); const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };

/** The tile as RGBA bytes: `color` (sRGB, linear per-channel mean = G.mean) and `surface` (R relief, G roughness).
 *  Stones are jittered tile-periodic Voronoi cells, so the map wraps seamlessly. */
export function gravelData(P = G) {
  const n = P.size, cells = P.cells, color = new Uint8Array(n * n * 4), surface = new Uint8Array(n * n * 4), lin = new Float32Array(n * n * 3);
  const noise = grassPatchNoise(P.patch), cell = (k) => Float64Array.from({ length: cells * cells }, (_, i) => hash(i % cells, Math.floor(i / cells), P.seed + k));
  const JX = cell(0), JY = cell(1), TONE = cell(2), HUE = cell(3), SIZE = cell(4); // per-stone values, computed once
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = (x + .5) * cells / n, py = (y + .5) * cells / n, cx = Math.floor(px), cy = Math.floor(py);
    let best = Infinity, second = Infinity, idx = 0, idy = 0, ox = 0, oy = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const wx = wrap(cx + dx, cells), wy = wrap(cy + dy, cells);
      const c = wy * cells + wx, jx = .15 + .7 * JX[c], jy = .15 + .7 * JY[c];
      const ddx = px - cx - dx - jx, ddy = py - cy - dy - jy, d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < best) { second = best; best = d; idx = wx; idy = wy; ox = ddx; oy = ddy; } else if (d < second) second = d;
    }
    const c = idy * cells + idx, tone = TONE[c], hue = HUE[c], size = SIZE[c];
    // the stone's body: a rounded blob round the cell's site (radius by `size`), kept off the neighbour border, so the
    // darker fines show between stones of different sizes
    const r = .4 + .3 * size, round = Math.min(1, Math.max(0, (r - best) / (r * .6))), gap = Math.min(1, Math.max(0, (second - best) / .14));
    const core = Math.min(round, gap), dome = core * core * (3 - 2 * core);
    const shade = 1 + .12 * dome * (-ox - oy) / Math.max(.3, Math.hypot(ox, oy) + .3); // lit from the upper left, a hint of roundness
    const stone = (1 + P.stoneContrast * (tone - .5) * 2) * shade, grit = 1 + P.grit * (hash(x, y, P.seed + 5) - .5) * 2;
    const k = (P.fines + (stone - P.fines) * dome) * grit * (1 + P.patch.strength * grassPatchField(x / n, y / n, noise) * P.patch.contrast);
    const t = P.stoneTint * (hue * 1.6 - .6) * dome; // mostly warm (sandy), a few cool grey
    const i = (y * n + x) * 3; lin[i] = k * (1 + t); lin[i + 1] = k; lin[i + 2] = k * (1 - t);
    const j = (y * n + x) * 4;
    surface[j] = Math.round((.15 + .8 * dome * (.6 + .4 * size)) * 255);
    surface[j + 1] = Math.round((P.roughness[1] - (P.roughness[1] - P.roughness[0]) * dome * (.5 + .5 * tone)) * 255);
    surface[j + 2] = 0; surface[j + 3] = 255;
  }
  // per-channel gain so the map's linear mean is exactly P.mean (a second pass absorbs byte rounding)
  const sum = [0, 0, 0]; for (let i = 0; i < n * n; i++) for (let c = 0; c < 3; c++) sum[c] += lin[i * 3 + c];
  const gain = sum.map((s) => P.mean * n * n / s);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n * n; i++) { for (let c = 0; c < 3; c++) color[i * 4 + c] = toByte(lin[i * 3 + c] * gain[c]); color[i * 4 + 3] = 255; }
    const now = linearMean(color); for (let c = 0; c < 3; c++) gain[c] *= P.mean / now[c];
  }
  return { color, surface, width: n, height: n };
}

/** World-metre UVs (x, z) on a flat or terrain-following ground geometry; positions, normals and indices stay untouched. */
export function gravelUV(geometry) {
  const p = geometry.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geometry;
}

let textures;
export function gravelTextures() {
  if (textures) return textures;
  const { color, surface, width, height } = gravelData();
  const texture = (data, name, colorSpace) => {
    const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    t.name = name; t.colorSpace = colorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.setScalar(1 / G.tile); t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = G.anisotropy; t.needsUpdate = true;
    return t;
  };
  return textures = { color: texture(color, 'gravel-stones-colour', THREE.SRGBColorSpace), surface: texture(surface, 'gravel-relief-roughness', THREE.NoColorSpace) };
}

/** A surface's colour divided by the map's linear mean, so the textured surface averages to `hex`. */
export const gravelColor = (hex) => new THREE.Color(hex).multiplyScalar(1 / G.mean);

/** A gravel material for one batch (they share the textures). With `vertexColors`, per-vertex tints apply only while the
 *  map is on: in snow months the existing registerSnow() drops the map and the surface is plain snow. Call registerSnow()
 *  on the result as before; this owns the relief/roughness maps' seasonal switch. */
export function gravelMaterial(hex, { vertexColors = false, name = 'gravel' } = {}) {
  const t = gravelTextures();
  const material = new THREE.MeshStandardMaterial({ color: gravelColor(hex), map: t.color, bumpMap: t.surface, bumpScale: G.depth, roughnessMap: t.surface, roughness: 1, vertexColors });
  material.name = name; material.userData.gravelSurface = true;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '#ifdef USE_MAP\n#include <color_fragment>\n#endif')
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
      vec2 gravelMeters = vMapUv * ${G.tile.toFixed(4)};
      float gravelTone = sin(dot(gravelMeters, vec2(${G.broadScale[0]}, ${G.broadScale[1]}))) * sin(dot(gravelMeters, vec2(${G.broadScale[2]}, ${G.broadScale[3]})) + 1.3);
      diffuseColor.rgb *= 1.0 + ${G.broadStrength.toFixed(4)} * gravelTone;
#endif`);
  };
  rememberFragmentCompile(material.onBeforeCompile);
  material.customProgramCacheKey = () => 'gravel-surface-2096';
  registerSeasonal((month) => {
    const snow = SEASON.snowMonths.includes(month);
    material.bumpMap = snow ? null : t.surface;
    material.roughnessMap = snow ? null : t.surface;
    material.roughness = snow ? G.snowRoughness : 1;
    material.needsUpdate = true;
  });
  return material;
}
