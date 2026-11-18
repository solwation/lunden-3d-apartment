// #2105: fallen autumn leaves on the outdoor ground. One shared state (how much litter this month, the month's leaf tones, a
// small density map over WALK) and a fragment-only patch for the lit ground materials (lawns, asphalt, paving, kerbs, gravel,
// road paint) that draws small procedural leaves in world space where the map and the month say so: sparse on open ground,
// denser under the crowns and along the roads' kerbs, more towards late autumn, none in summer, spring or the snow months.
// Out of season (amount 0) every added branch is skipped. No new draws, lights or passes; one R8 texture (baked lazily on the
// first autumn month) and a few uniforms.
import * as THREE from 'three';
import { LEAF_LITTER as L, SEASON, WALK } from './config.js';
import { registerSeasonal } from './seasons.js';
import { rememberFragmentCompile } from './vertexcompile.js';

const empty = new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat);
empty.needsUpdate = true;
/** The uniforms every patched material shares: uLitter = (amount 0…1, leaf shapes 0/1, 0), the month's tones, the density map and its box. */
export const litterUniforms = {
  uLitter: { value: new THREE.Vector3(0, 1, 0) },
  uLitterFresh: { value: new THREE.Color() },
  uLitterOld: { value: new THREE.Color() },
  uLitterMap: { value: empty },
  uLitterBox: { value: new THREE.Vector4(WALK.x0, WALK.z0, 1 / (WALK.x1 - WALK.x0), 1 / (WALK.z1 - WALK.z0)) },
};

/** How much of the full litter lies in `month` (1…12): 0 in summer, spring and the snow months, growing through the autumn. */
export const litterAmount = (month, P = L) => (SEASON.snowMonths.includes(month) ? 0 : P.months[month] ?? 0);

/** The month's [fresh, old] leaf tones (sRGB hex), or null out of season. */
export const litterColors = (month, P = L) => (litterAmount(month, P) > 0 ? P.colors[month] ?? null : null);

const hash = (i, j, seed) => { // deterministic 0…1 per texel
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The density map (0…255 per `cell`-m texel over `box`): a patchy sparse base, up to `tree` under each crown ({ x, z, r }) and a
 * `kerb` band along the edges of the roads given as sample lists ([{ x, z, w }] along a centre line, roads.js samples()).
 */
export function bakeLitterDensity({ trees = [], roads = [], box = WALK, P = L } = {}) {
  const c = P.cell, nx = Math.ceil((box.x1 - box.x0) / c), nz = Math.ceil((box.z1 - box.z0) / c);
  const v = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = P.base * (0.3 + 1.4 * hash(i, j, P.seed));
  const span = (x0, x1, z0, z1, fn) => { // every texel centre in the box, fn(index, x, z)
    const i0 = Math.max(0, Math.floor((x0 - box.x0) / c)), i1 = Math.min(nx - 1, Math.ceil((x1 - box.x0) / c));
    const j0 = Math.max(0, Math.floor((z0 - box.z0) / c)), j1 = Math.min(nz - 1, Math.ceil((z1 - box.z0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * nx + i, box.x0 + (i + 0.5) * c, box.z0 + (j + 0.5) * c);
  };
  for (const t of trees) {
    const R = t.r * P.spread;
    if (!(R > 0)) continue;
    span(t.x - R, t.x + R, t.z - R, t.z + R, (k, x, z) => {
      const f = 1 - Math.hypot(x - t.x, z - t.z) / R;
      if (f > 0) v[k] += P.tree * f * f * (3 - 2 * f);
    });
  }
  for (const S of roads) for (let s = 1; s < S.length; s++) {
    const a = S[s - 1], b = S[s], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, reach = Math.max(a.w, b.w) / 2 + P.width;
    span(Math.min(a.x, b.x) - reach, Math.max(a.x, b.x) + reach, Math.min(a.z, b.z) - reach, Math.max(a.z, b.z) + reach, (k, x, z) => {
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      const e = Math.abs(Math.hypot(x - a.x - dx * t, z - a.z - dz * t) - (a.w + (b.w - a.w) * t) / 2);
      if (e < P.width) v[k] = Math.max(v[k], P.kerb * (1 - e / P.width) + P.base * 0.5);
    });
  }
  const data = new Uint8Array(nx * nz);
  for (let k = 0; k < data.length; k++) data[k] = Math.round(Math.min(1, v[k]) * 255);
  return { data, nx, nz, box };
}

/** The litter state: `trees()` (the site crowns, surroundings.js aoTrees) and `roads()` (sample lists) are read once, on the first autumn month. */
export class LeafLitter {
  constructor({ trees = () => [], roads = () => [], P = L } = {}) {
    Object.assign(this, { trees, roads, P, month: 0, texture: null });
  }

  /** Leaf shapes (true) or the mean tint only (false): the quality level / phone profile. */
  set detail(on) { litterUniforms.uLitter.value.y = on ? 1 : 0; }
  get detail() { return litterUniforms.uLitter.value.y > 0; }

  bake() {
    const { data, nx, nz } = bakeLitterDensity({ trees: this.trees(), roads: this.roads(), P: this.P });
    const t = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
    t.name = 'leaf-litter-density';
    t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.unpackAlignment = 1;
    t.needsUpdate = true;
    litterUniforms.uLitterMap.value = this.texture = t;
  }

  /** Every month change (seasons.js): the amount and tones; the map is baked when first needed. */
  apply(month) {
    this.month = month;
    const amount = litterAmount(month, this.P), tones = litterColors(month, this.P), U = litterUniforms;
    if (amount > 0 && !this.texture) this.bake();
    U.uLitter.value.x = amount;
    if (tones) { U.uLitterFresh.value.setHex(tones[0]); U.uLitterOld.value.setHex(tones[1]); }
    return amount;
  }

  /** Follow the seasons (call once). */
  register() { registerSeasonal((month) => this.apply(month)); return this; }
}

const f = (x) => Number(x).toFixed(4);
/** The mean leaf cover of one grid at full density (a pinched ellipse: ~0.9 of π · len · wide·len per cell). */
export const leafShare = (P = L) => { const l = (P.len[0] + P.len[1]) / 2; return 0.9 * Math.PI * l * l * P.wide; };

/** The GLSL for a surface kind: declarations and the albedo / roughness step (after roughnessmap); `mask`: an optional GLSL factor (0…1) of the material's own. */
export function litterGLSL(kind, P = L, mask = '') {
  const K = P.kinds[kind], share = leafShare(P);
  const head = /* glsl */ `
uniform vec3 uLitter, uLitterFresh, uLitterOld;
uniform sampler2D uLitterMap;
uniform vec4 uLitterBox;
vec4 litterHash(vec2 p) { vec4 q = fract(vec4(p.xyx, p.y) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); q += dot(q, q.wzxy + 33.33); return fract((q.xxyz + q.yzzw) * q.zywx); }
// one grid of leaves: coverage 0…1 of this pixel, the leaf's colour in col
float litterLeaf(vec2 p, float cell, float seed, float c, float aa, inout vec3 col) {
  vec2 id = floor(p / cell), q = fract(p / cell) - 0.5;
  vec4 h = litterHash(id + seed);
  if (h.x >= c) return 0.0;
  q -= (h.yz - 0.5) * 0.2;
  float a = h.w * 6.2832, cs = cos(a), sn = sin(a);
  q = vec2(cs * q.x + sn * q.y, cs * q.y - sn * q.x);
  float len = mix(${f(P.len[0])}, ${f(P.len[1])}, fract(h.y * 7.13 + h.z * 3.1)), wid = len * ${f(P.wide)};
  vec2 e = q / vec2(len, wid);
  float r = length(vec2(e.x, e.y / max(1.0 - 0.4 * e.x * e.x, 0.3)));
  float edge = aa / (cell * wid);
  float m = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, r);
  float vein = 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.1 + edge, abs(e.y))) * step(abs(e.x), 0.85);
  col = mix(uLitterFresh, uLitterOld, fract(h.y * 13.7 + h.z * 5.3)) * (0.78 + 0.22 * (1.0 - min(r * r, 1.0)) + 0.25 * fract(h.w * 31.1)) * vein;
  return m;
}`;
  const surface = /* glsl */ `
if (uLitter.x > 0.0) {
  vec3 litW = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);
  float litAA = max(length(fwidth(litW.xz)), 1e-4);
  float litFlat = smoothstep(0.7, 0.9, abs(normalize(cross(dFdx(litW), dFdy(litW))).y));
  vec2 litUV = (litW.xz - uLitterBox.xy) * uLitterBox.zw;
  float litC = 0.0;
  if (litFlat > 0.0 && litUV.x > 0.0 && litUV.y > 0.0 && litUV.x < 1.0 && litUV.y < 1.0)
    litC = texture2D(uLitterMap, litUV).r * uLitter.x * ${f(K)}${mask ? ` * (${mask})` : ''};
  if (litC > 0.004) {
    vec3 litMean = mix(uLitterFresh, uLitterOld, 0.5) * 0.92;
    // the far / undetailed look: the mean cover of both grids plus the mulch, as a tint
    float litFar = clamp(litC * ${f(share)} * (2.0 - litC * ${f(share)}), 0.0, 1.0);
    float litMulch = smoothstep(${f(P.mulch[0])}, 1.0, litC) * ${f(P.mulch[1])};
    vec3 litCol = litMean * 0.8;
    float litA = litMulch;
    diffuseColor.rgb = mix(diffuseColor.rgb, litCol, litA * litFlat);
    float litDetail = uLitter.y * (1.0 - smoothstep(${f(P.aa[0])}, ${f(P.aa[1])}, litAA));
    vec3 litLeaf = litMean;
    float litNear = 0.0;
    if (litDetail > 0.0) {
      vec3 c1 = litMean, c2 = litMean;
      float m2 = litterLeaf(litW.xz + 0.37, ${f(P.cells[1])}, 41.0, litC, litAA, c2);
      float m1 = litterLeaf(litW.xz, ${f(P.cells[0])}, 17.0, litC, litAA, c1);
      litLeaf = mix(c2, c1, m1); // the finer grid lies on top
      litNear = max(m1, m2);
    }
    float litAlpha = mix(litFar, litNear, litDetail) * litFlat;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(litMean, litLeaf, litDetail), litAlpha);
    roughnessFactor = mix(roughnessFactor, ${f(P.rough)}, max(litAlpha, litMulch * litFlat));
  }
}`;
  return { head, surface };
}

/** Patch a lit ground material (MeshStandard) for `kind` (LEAF_LITTER.kinds): chains its onBeforeCompile and cache key. Once per material.
 * `mask`: a GLSL factor the material's own patch declares (the river-bed lawn: no leaves on its mud). */
export function leafLitter(material, kind, mask = '') {
  const m = material;
  if (!m?.isMeshStandardMaterial || m.userData.leafLitter) return m;
  if (!(kind in L.kinds)) throw new Error(`leafLitter: unknown kind ${kind}`);
  m.userData.leafLitter = kind;
  const glsl = litterGLSL(kind, L, mask), before = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (shader.fragmentShader.includes('uLitterMap')) return; // (an inherited, already patched callback)
    Object.assign(shader.uniforms ??= {}, litterUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${glsl.head}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${glsl.surface}`);
  };
  rememberFragmentCompile(m.onBeforeCompile, before);
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  m.customProgramCacheKey = function () { return `${base.call(this)}|litter2105-${kind}${mask ? '-mask' : ''}`; };
  m.needsUpdate = true;
  return m;
}
