// #2175: rain wets facades, roofs, cars and benches, not only the ground. One fragment step per material class (WET_SURFACE) chained
// onto the existing MeshStandardMaterials after their own patches, the same way snowcap.js is: it reads the ground's own wetness (the
// shared wetUniforms.uGroundWet.x from wetground.js, 0 dry … 1 soaked, 0 in the snow months), so a wall dries as fast as the street.
// Darker albedo (damp from the start), a glossier film as it soaks (roughness down by wet²), a faint sky reflection on the film, on walls
// faint vertical run streaks, on car paint beads of dropwise gloss. Dry (wet = 0) skips the whole branch. No geometry, texture, draw, light,
// pass or per-frame work (three floats are already uploaded for the ground). Phones (lowMemory): like snowCap only materials that already
// carry their own compile step get it, so no plain material becomes a new shader program there (#2118). Sits after normal_fragment_begin
// (every colour / roughness step of the chain is behind it, `normal` is the view normal).
import * as THREE from 'three';
import { WET_SURFACE as W } from './config.js';
import { wetUniforms } from './wetground.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { lowMemory } from './lowmemory.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let ux = x - ix, uy = y - iy;
  ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** JS twin of the shader (tests): { dark: albedo factor, rough: roughness ceiling factor mix (0 = untouched … 1 = the kind's `rough`), shine: sky add
 * strength, streak: extra darkening 0…1 (as a factor: albedo × (1 − streak)), drops: share 0…1 of beaded gloss } for `kind` at world point
 * `p`, unit world normal `n`, wetness `wet`. */
export function wetSurfaceState(kind, wet, p = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 1, z: 0 }, P = W) {
  const K = P.kinds[kind];
  if (!K || !(wet > 0)) return { dark: 1, rough: 0, shine: 0, streak: 0, drops: 0 };
  const w = Math.min(1, wet);
  const dark = 1 + (K.dark - 1) * Math.min(1, w * 1.6), rough = w * w;
  let streak = 0;
  if (K.streak > 0) {
    const wall = smooth(P.streak.wall[0], P.streak.wall[1], Math.abs(n.y)); // 1 on a vertical wall, 0 on tops and steep slopes
    const s = noise((p.x + p.z) * P.streak.cols, p.y / P.streak.stretch + (p.x - p.z) * 0.05);
    streak = K.streak * wall * smooth(0.55, 0.85, s) * smooth(P.streak.wet, 1, w);
  }
  let drops = 0;
  if (K.drops) drops = K.drops * rough * (noise(p.x / P.drops.scale, p.z / P.drops.scale + p.y / P.drops.scale) > 0.5 ? 1 : 0);
  return { dark, rough, shine: K.shine * rough, streak, drops };
}

const f = (x) => Number(x).toFixed(4);
/** The GLSL for a class: { head, body }. */
export function wetSurfaceGLSL(kind, P = W) {
  const K = P.kinds[kind], S = P.streak, D = P.drops;
  const head = /* glsl */`
uniform vec3 uSurfWet, uSurfHorizon, uSurfZenith;
float wetSurfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wetSurfNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(wetSurfHash(i), wetSurfHash(i + vec2(1.0, 0.0)), u.x), mix(wetSurfHash(i + vec2(0.0, 1.0)), wetSurfHash(i + vec2(1.0, 1.0)), u.x), u.y); }`;
  const body = /* glsl */`
float wetSW = 0.0;
if (uSurfWet.x > 0.0) {
  wetSW = min(1.0, uSurfWet.x);
  float wetSD = mix(1.0, ${f(K.dark)}, min(1.0, wetSW * 1.6));
${K.streak > 0 || K.drops ? `  vec3 wetSP = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);` : ''}
${K.streak > 0 ? `  vec3 wetSN = inverseTransformDirection(normal, viewMatrix);
  float wetSWall = smoothstep(${f(S.wall[0])}, ${f(S.wall[1])}, abs(wetSN.y));
  if (wetSWall > 0.0) wetSD *= 1.0 - ${f(K.streak)} * wetSWall * smoothstep(0.55, 0.85, wetSurfNoise(vec2((wetSP.x + wetSP.z) * ${f(S.cols)}, wetSP.y / ${f(S.stretch)} + (wetSP.x - wetSP.z) * 0.05))) * smoothstep(${f(S.wet)}, 1.0, wetSW);` : ''}
  diffuseColor.rgb *= wetSD;
  float wetSG = wetSW * wetSW;
${K.drops ? `  float wetSDrop = step(0.5, wetSurfNoise(vec2(wetSP.x, wetSP.z + wetSP.y) / ${f(D.scale)})) * ${f(K.drops)} * wetSG;
  roughnessFactor = mix(roughnessFactor, min(roughnessFactor, ${f(D.rough)}), wetSDrop);` : ''}
  roughnessFactor = mix(roughnessFactor, min(roughnessFactor, ${f(K.rough)}), wetSG);
  vec3 wetSV = normalize(vViewPosition);
  float wetSF = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, wetSV), 0.0, 1.0), 5.0);
  vec3 wetSR = transpose(mat3(viewMatrix)) * reflect(-wetSV, normal);
  wetSkyAdd = mix(uSurfHorizon, uSurfZenith, sqrt(clamp(wetSR.y, 0.0, 1.0))) * wetSF * ${f(K.shine)} * wetSG;
}`;
  return { head, body };
}

/** Chain the wet step onto a MeshStandardMaterial (once; unique cache-key suffix). `lite` (phones): only a material that already has its own
 * onBeforeCompile. Returns the material. */
export function wetSurface(material, kind, lite = lowMemory, P = W) {
  const m = material;
  if (!m?.isMeshStandardMaterial || m.userData.wetSurface) return m;
  if (!P.kinds[kind]) throw new Error(`wetSurface: unknown kind ${kind}`);
  const before = m.onBeforeCompile, key = m.customProgramCacheKey;
  if (lite && before === THREE.Material.prototype.onBeforeCompile) return m;
  m.userData.wetSurface = kind;
  const glsl = wetSurfaceGLSL(kind, P);
  m.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    Object.assign(shader.uniforms ??= {}, { uSurfWet: wetUniforms.uGroundWet, uSurfHorizon: wetUniforms.uWetHorizon, uSurfZenith: wetUniforms.uWetZenith });
    if (shader.fragmentShader.includes('uniform vec3 uSurfWet')) return; // (an inherited, already wet callback)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${glsl.head}\nvec3 wetSkyAdd = vec3(0.0);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${glsl.body}`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular += wetSkyAdd;');
  };
  rememberFragmentCompile(m.onBeforeCompile, before);
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  m.customProgramCacheKey = function () { return `${base.call(this)}|wetsurf2175-${kind}`; };
  m.needsUpdate = true;
  return m;
}
