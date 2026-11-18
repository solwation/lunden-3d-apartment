import * as THREE from 'three';
import { CAT_LIFE } from './config.js';
import { rememberBoundedVertexCompile } from './vertexcompile.js';

// #2125: the lie of a cat's coat in the shader of its own fur materials (no fur geometry, no texture, no extra draw or pass).
// - Strand clumps: a value noise stretched along the lie of the coat (back and down in each part's local frame, CAT_LIFE.fur.dir; along
//   the tube on the tail) brightens / darkens the coat by ±`streak`, faded out by its screen-space size so it never shimmers far away.
// - A soft strand sheen: a Kajiya-Kay highlight across the strands for the first directional light (the view direction without one),
//   scaled by the light the surface already gets (shadows and lamps included), partly untinted so dark coats shine too.
// - The tail bends in the vertex shader (uv.x runs along the tube): `uCatTail` = (yaw at the tip, lift, 1 on the tail material). The CPU
//   tip blob uses the same `bendPoint`. Registered as a bounded vertex edit (vertexcompile.js) of at most `TAIL_SLACK` m.
// Every fur material carries the same code (one cache key), so the program count does not grow (#2118: no new lowMemory variant):
// the shared ordinary-cat materials, each puppet's clones and the outdoor cats' far LOD material.

const F = CAT_LIFE.fur;
const num = (x) => Number(x).toFixed(6);
const vec3 = (a) => `vec3(${a.map(num).join(',')})`;
export const TAIL_SLACK = 0.3;
const BEND_POW = 1.6;

const head = /* glsl */`
uniform vec2 uCatFur;
uniform vec3 uCatTail;
varying vec3 vCfPos;
varying vec3 vCfDir;
varying float vCfU;`;

const vertHead = `${head}
vec3 cfBend(vec3 p, float u) {
  float a = uCatTail.x * u, c = cos(a), s = sin(a);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  float b = uCatTail.y * u, cb = cos(b), sb = sin(b);
  return vec3(p.x, cb * p.y - sb * p.z, sb * p.y + cb * p.z);
}`;

const fragHead = `${head}
float cfHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cfNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cfHash(i), cfHash(i + vec3(1,0,0)), f.x), mix(cfHash(i + vec3(0,1,0)), cfHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cfHash(i + vec3(0,0,1)), cfHash(i + vec3(1,0,1)), f.x), mix(cfHash(i + vec3(0,1,1)), cfHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

const furDir = vec3(new THREE.Vector3(...F.dir).normalize().toArray());

const vertNormal = `#include <beginnormal_vertex>
float cfU = pow(clamp(uv.x, 0.0, 1.0), ${num(BEND_POW)}) * uCatTail.z;
objectNormal = cfBend(objectNormal, cfU);`;

const vertBegin = `#include <begin_vertex>
transformed = cfBend(transformed, cfU);
vCfPos = transformed * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
vCfDir = normalize((modelViewMatrix * vec4(${furDir}, 0.0)).xyz);
vCfU = uv.x;`;

// strand clumps: coordinates across the lie (two axes) at `freq`, along it at `freq` × `along`
const fragColor = `#include <color_fragment>
{
  vec3 cfD = ${furDir};
  vec3 cfA = normalize(cross(cfD, vec3(1.0, 0.0, 0.0))), cfB = cross(cfD, cfA);
  vec3 cfQ = vec3(dot(vCfPos, cfA), dot(vCfPos, cfB), dot(vCfPos, cfD) * ${num(F.along)}) * ${num(F.freq)};
  float cfW = fwidth(cfQ.x) + fwidth(cfQ.y);
  float cfS = (cfNoise(cfQ) * 2.0 - 1.0) * ${num(F.streak)} * uCatFur.x * (1.0 - smoothstep(${num(F.fade[0])}, ${num(F.fade[1])}, cfW));
  diffuseColor.rgb *= 1.0 + cfS;
}`;

const fragLight = `#include <lights_fragment_end>
{
  vec3 cfPx = dFdx(-vViewPosition), cfPy = dFdy(-vViewPosition);
  float cfDet = dot(normal, cross(cfPx, cfPy));
  vec3 cfG = (dFdx(vCfU) * cross(cfPy, normal) + dFdy(vCfU) * cross(normal, cfPx)) * sign(cfDet);
  vec3 cfT = mix(vCfDir, cfG, step(0.5, uCatTail.z) * step(1e-8, dot(cfG, cfG)));
  cfT = cfT - normal * dot(cfT, normal);
  float cfTl = length(cfT);
  if (cfTl > 1e-5 && uCatFur.y > 0.0) {
    cfT /= cfTl;
    #if NUM_DIR_LIGHTS > 0
      vec3 cfL = directionalLights[0].direction;
    #else
      vec3 cfL = geometryViewDir;
    #endif
    vec3 cfH = normalize(cfL + geometryViewDir);
    float cfTh = dot(cfT, cfH);
    float cfK = pow(max(0.0, 1.0 - cfTh * cfTh), ${num(F.shine * 0.5)}) * smoothstep(-0.1, 0.4, dot(normal, cfL));
    vec3 cfIrr = min(reflectedLight.directDiffuse / max(diffuseColor.rgb, vec3(0.02)), vec3(4.0));
    reflectedLight.directSpecular += mix(diffuseColor.rgb, vec3(1.0), ${num(F.white)}) * cfIrr * cfK * ${num(F.sheen)} * uCatFur.y;
  }
}`;

const state = new WeakMap(); // material → its uniforms

/** The uniforms of a patched fur material (null otherwise). */
export function furState(material) { return state.get(material) ?? null; }

/**
 * Give a fur material the coat shader (idempotent). `share`: another fur material whose fur strength uniform it shares (the ordinary
 * cat's body surface follows the shared coat material); `copy`: one whose values it copies (a puppet's clone); `bare`: no fur at all
 * (the nose, eyes and pupils: the same program as the coat, so the cat adds no shader variant, with the effect switched off).
 */
export function furMaterial(material, { share = null, copy = null, bare = false } = {}) {
  if (!material || state.has(material)) return material;
  const from = furState(share);
  const u = {
    uCatFur: from?.uCatFur ?? { value: new THREE.Vector2(1, 1) },
    uCatTail: { value: new THREE.Vector3() },
  };
  const c = furState(copy);
  if (bare) u.uCatFur.value.set(0, 0);
  if (c && !from) u.uCatFur.value.copy(c.uCatFur.value);
  if (c) u.uCatTail.value.copy(c.uCatTail.value);
  state.set(material, u);
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  const compile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (shader.vertexShader.includes('vec3 cfBend(')) return; // (an inherited, already patched callback)
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertHead}`)
      .replace('#include <beginnormal_vertex>', vertNormal)
      .replace('#include <begin_vertex>', vertBegin);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragHead}`)
      .replace('#include <color_fragment>', fragColor)
      .replace('#include <lights_fragment_end>', fragLight);
  };
  material.onBeforeCompile = compile;
  rememberBoundedVertexCompile(compile, before, TAIL_SLACK);
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  material.customProgramCacheKey = function () { return `${base.call(this)}|catfur1`; };
  material.needsUpdate = true;
  return material;
}

/** Fur strength for a breed: a naked sphynx has hardly any strands or sheen. */
export function setFurStrength(material, naked) {
  const u = furState(material);
  if (u) u.uCatFur.value.setScalar(naked ? F.naked : 1);
}

/** Bend the tail (on its fur material): `yaw` at the tip, `lift` (rad). */
export function setTailBend(material, yaw, lift) {
  const u = furState(material);
  if (u) u.uCatTail.value.set(yaw, lift, 1);
}

/** The CPU twin of the shader's bend: point `v` (tail-local, in place) at `u` (0 … 1 along the tail). */
export function bendPoint(v, yaw, lift, u = 1) {
  const w = Math.pow(Math.min(1, Math.max(0, u)), BEND_POW), a = yaw * w, c = Math.cos(a), s = Math.sin(a);
  const x = c * v.x + s * v.z, z = -s * v.x + c * v.z, b = lift * w, cb = Math.cos(b), sb = Math.sin(b);
  v.x = x; const y = v.y; v.y = cb * y - sb * z; v.z = sb * y + cb * z;
  return v;
}
