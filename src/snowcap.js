// #2123: a thin snow cap on narrow upward-facing outdoor surfaces in the snow months (window sill flashings, roof
// cappings and copings, railing top rails, benches, loggia slabs and parapets). A fragment step chained onto the existing
// MeshStandardMaterials (after their own patches: railMetal #2089, benchWood #2098, render #2095, moss #2122): the world
// normal's y decides how much (none on walls, fading on steep faces), a world-xz noise thins it in places. One shared
// uniform switches it (SEASON.snowMonths, set by a seasons hook), so the month changes recompile nothing. No geometry,
// texture, draw, light, pass or per-frame work; vertex positions untouched (rememberFragmentCompile). The step sits after
// normal_fragment_begin, i.e. after every colour/roughness step of the chain, so a mossy coping top is snow-white.
// Phones (lowMemory): only materials that already carry their own compile step (no new program for a plain material).
import * as THREE from 'three';
import { SNOW_CAP as C, SEASON } from './config.js';
import { registerSeasonal } from './seasons.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { lowMemory } from './lowmemory.js';

/** The shared switch: 1 in the snow months, else 0 (every capped material's shader reads this one object). */
export const snowCapUniform = { value: 0 };
export const snowCapOn = (month) => (SEASON.snowMonths.includes(month) ? 1 : 0);
let hooked = false;
const hook = () => { if (!hooked) { hooked = true; registerSeasonal((month) => { snowCapUniform.value = snowCapOn(month); }); } };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let ux = x - ix, uy = y - iy;
  ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy; // = mix(mix(a, b, ux), mix(c, d, ux), uy)
}

/** JS twin of the shader (tests): the mix amount 0…strength towards the snow at world point `p` on a face with unit world
 * normal `n`, with the switch `on` (0 / 1). */
export function snowCapAmount(p, n, on = 1, P = C) {
  if (!(on > 0)) return 0;
  const up = smooth(P.up[0], P.up[1], n.y);
  if (!(up > 0)) return 0;
  return on * up * P.strength * (1 - P.patch * (1 - noise(p.x / P.scale, p.z / P.scale)));
}
/** The snow colour in linear RGB. */
export const snowCapColor = (P = C) => { const c = new THREE.Color(P.color); return [c.r, c.g, c.b]; };

const f = (x) => Number(x).toFixed(4);
/** The GLSL: { head, body }. */
export function snowCapGLSL(P = C) {
  return {
    head: /* glsl */`
uniform float uSnowCap;
float snowCapHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snowCapNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(snowCapHash(i), snowCapHash(i + vec2(1.0, 0.0)), u.x), mix(snowCapHash(i + vec2(0.0, 1.0)), snowCapHash(i + vec2(1.0, 1.0)), u.x), u.y); }`,
    body: /* glsl */`
if (uSnowCap > 0.0) {
  float snowUp = smoothstep(${f(P.up[0])}, ${f(P.up[1])}, inverseTransformDirection(normal, viewMatrix).y);
  if (snowUp > 0.0) {
    vec3 snowP = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);
    float snowA = uSnowCap * snowUp * ${f(P.strength)} * (1.0 - ${f(P.patch)} * (1.0 - snowCapNoise(snowP.xz / ${f(P.scale)})));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${snowCapColor(P).map(f).join(', ')}), snowA);
    roughnessFactor = mix(roughnessFactor, ${f(P.rough)}, snowA);
    metalnessFactor = mix(metalnessFactor, 0.0, snowA);
  }
}`,
  };
}

/** Chain the cap onto a MeshStandardMaterial (once; unique cache-key suffix). `lite` (phones): only a material that already
 * has its own onBeforeCompile. Returns the material. */
export function snowCap(material, lite = lowMemory, P = C) {
  const m = material;
  if (!m?.isMeshStandardMaterial || m.userData.snowCap) return m;
  const before = m.onBeforeCompile, key = m.customProgramCacheKey;
  if (lite && before === THREE.Material.prototype.onBeforeCompile) return m;
  hook();
  m.userData.snowCap = true;
  const glsl = snowCapGLSL(P);
  m.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    shader.uniforms.uSnowCap = snowCapUniform;
    if (shader.fragmentShader.includes('uniform float uSnowCap;')) return; // (an inherited, already capped callback)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${glsl.head}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${glsl.body}`);
  };
  rememberFragmentCompile(m.onBeforeCompile, before);
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  m.customProgramCacheKey = function () { return `${base.call(this)}|snowcap2123`; };
  m.needsUpdate = true;
  return m;
}
