// #2176: patchy snow on the outdoor ground. A fragment step chained onto a ground material (asphalt, paving, gravel, lawn): the
// shared cover (snowUniform) is compared with the spot's own hold (snowcover.js snowHold): the class's base (asphalt melts first, grass
// last) spread by a world-xz noise and lowered under tree crowns and against north facades (the R channel of one small shelter texture,
// built once from the trees and house boxes) and along the road edges, where the plough's dirty-grey ridge lies (G channel,
// SITE.roads). Fragment work only: no geometry, draw, light or pass; the cover is one uniform. Phones (lowMemory, `lite`): noise only,
// no texture lookup. Covered 0 → skips every added branch.
import * as THREE from 'three';
import { SNOW_COVER as P } from './config.js';
import { snowUniform } from './snowcover.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { lowMemory } from './lowmemory.js';
import { roadFrameAt } from './streetwear.js';

const blank = () => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; };
/** The shared uniforms: the cover, the shelter texture (1 × 1 empty until built) and its box (x0, z0, 1/width, 1/depth). */
export const snowGroundUniforms = { uSnowCover: snowUniform, uSnowShelter: { value: blank() }, uSnowBox: { value: new THREE.Vector4(0, 0, 1, 1) } };

/** The shelter / ridge map as RGBA bytes: R 0…255 shelter (crowns + north bands), G 0…255 kerb ridge. Pure (tests). */
export function shelterData({ trees = [], boxes = [], roadAt = null }, M = P.shelterMap, C = P) {
  const n = M.size, px = new Uint8Array(n * n * 4), cell = (2 * M.extent) / n, x0 = M.centre[0] - M.extent, z0 = M.centre[1] - M.extent;
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  const put = (ix, iz, ch, v) => { if (ix < 1 || iz < 1 || ix >= n - 1 || iz >= n - 1) return; const o = (iz * n + ix) * 4 + ch; if (v * 255 > px[o]) px[o] = Math.round(v * 255); };
  const disc = (cx, cz, r) => { // soft-edged disc into R
    const ix0 = Math.floor((cx - r - x0) / cell), ix1 = Math.ceil((cx + r - x0) / cell), iz0 = Math.floor((cz - r - z0) / cell), iz1 = Math.ceil((cz + r - z0) / cell);
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const d = Math.hypot(x0 + (ix + 0.5) * cell - cx, z0 + (iz + 0.5) * cell - cz);
      if (d < r) put(ix, iz, 0, Math.min(1, (r - d) / (0.35 * r)));
    }
  };
  for (const t of trees) disc(t.x, t.z, t.r * M.treeReach);
  for (const b of boxes) { // the north side (−z) of a house stays in its shade: a band of M.northBand m
    if (!(b.y1 > 2.5)) continue;
    const ix0 = Math.floor((b.x0 - 0.5 - x0) / cell), ix1 = Math.ceil((b.x1 + 0.5 - x0) / cell), iz0 = Math.floor((b.z0 - M.northBand - z0) / cell), iz1 = Math.ceil((b.z0 - z0) / cell);
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) put(ix, iz, 0, Math.max(0, 1 - (b.z0 - (z0 + (iz + 0.5) * cell)) / M.northBand));
  }
  if (roadAt) for (let iz = 1; iz < n - 1; iz++) for (let ix = 1; ix < n - 1; ix++) {
    const f = roadAt(x0 + (ix + 0.5) * cell, z0 + (iz + 0.5) * cell);
    if (!f) continue;
    const e = Math.abs(f.across) - f.half; // m outside the road edge (negative: on the road)
    if (e > C.ridge.inner && e < C.ridge.outer) put(ix, iz, 1, Math.min(1, Math.min(e - C.ridge.inner, C.ridge.outer - e) / 0.3));
  }
  return px;
}

/** Build the shelter texture from the trees ({ x, z, r }), house boxes (weather.boxes) and the roads; call once after the world exists. Not on phones. */
export function buildSnowShelter(inputs, M = P.shelterMap) {
  if (lowMemory) return null;
  const px = shelterData({ roadAt: (x, z) => roadFrameAt(x, z), ...inputs }, M);
  const t = new THREE.DataTexture(px, M.size, M.size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  snowGroundUniforms.uSnowShelter.value.dispose?.();
  snowGroundUniforms.uSnowShelter.value = t;
  snowGroundUniforms.uSnowBox.value.set(M.centre[0] - M.extent, M.centre[1] - M.extent, 1 / (2 * M.extent), 1 / (2 * M.extent));
  return t;
}

const f = (x) => Number(x).toFixed(4), c3 = (hex) => { const c = new THREE.Color(hex); return `${f(c.r)}, ${f(c.g)}, ${f(c.b)}`; };
/** The GLSL of the step for a class: { head, body }. */
export function snowGroundGLSL(cls, lite = false, C = P) {
  const head = /* glsl */ `
uniform float uSnowCover; uniform sampler2D uSnowShelter; uniform vec4 uSnowBox;
float snowGH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snowGN(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(snowGH(i), snowGH(i + vec2(1.0, 0.0)), u.x), mix(snowGH(i + vec2(0.0, 1.0)), snowGH(i + vec2(1.0, 1.0)), u.x), u.y); }`;
  const body = /* glsl */ `
if (uSnowCover > 0.0) {
  float snowUp = smoothstep(${f((C.upBy?.[cls] ?? C.up)[0])}, ${f((C.upBy?.[cls] ?? C.up)[1])}, inverseTransformDirection(normal, viewMatrix).y);
  if (snowUp > 0.0) {
    vec3 snowW = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);
    float snowNz = snowGN(snowW.xz / ${f(C.scale[0])}) * 0.6 + snowGN(snowW.xz / ${f(C.scale[1])} + 7.3) * 0.4;
    vec2 snowSh = ${lite ? 'vec2(0.0)' : 'texture2D(uSnowShelter, (snowW.xz - uSnowBox.xy) * uSnowBox.zw).rg'};
    float snowHold = clamp(${f(C.hold[cls])} + (snowNz - 0.5) * ${f(C.noise)} - snowSh.x * ${f(C.shelter)} - snowSh.y * ${f(C.ridge.hold)}, 0.0, 0.9);
    float snowA = smoothstep(snowHold - 0.04, snowHold + 0.05, uSnowCover) * snowUp;
    if (snowA > 0.0) {
      vec3 snowC = mix(vec3(${c3(C.color)}), vec3(${c3(C.ridge.color)}), snowSh.y * ${f(C.ridge.mix)});
      diffuseColor.rgb = mix(diffuseColor.rgb, snowC, snowA);
      roughnessFactor = mix(roughnessFactor, ${f(C.rough)}, snowA);
      normal = normalize(mix(normal, nonPerturbedNormal, snowA * 0.85));
    }
  }
}`;
  return { head, body };
}

/** Patch a lit ground material (MeshStandard) of class `cls` (SNOW_COVER.hold): chains its onBeforeCompile and cache key. Once per material. */
export function snowGround(material, cls, lite = lowMemory) {
  const m = material;
  if (!m?.isMeshStandardMaterial || m.userData.snowGround) return m;
  if (!(cls in P.hold)) throw new Error(`snowGround: unknown class ${cls}`);
  m.userData.snowGround = cls;
  const glsl = snowGroundGLSL(cls, lite), before = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (shader.fragmentShader.includes('uSnowCover')) return;
    Object.assign(shader.uniforms ??= {}, snowGroundUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${glsl.head}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${glsl.body}`);
  };
  rememberFragmentCompile(m.onBeforeCompile, before);
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  m.customProgramCacheKey = function () { return `${base.call(this)}|snow2176-${cls}${lite ? '-lite' : ''}`; };
  m.needsUpdate = true;
  return m;
}
