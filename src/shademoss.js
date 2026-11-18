// #2122: discreet green moss / algae low down and in the joints of shaded, north-facing walls. A fragment-only colour detail
// chained onto existing wall materials (bricksurface #2071 / rendersurface #2095 and plain ones): world normal (north = −z),
// height above the ground in front of the face and a world-space noise mask decide where. The height is one baked float per
// vertex (`mossHeight`, + SHADE_MOSS.offset so a mesh without it reads as far underground: no moss). No new draws, textures,
// lights, passes or per-frame work; positions untouched. Phones (lowMemory) skip it entirely: no attribute, no shader variant.
import * as THREE from 'three';
import { SHADE_MOSS as M } from './config.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { lowMemory } from './lowmemory.js';

const LUM = [0.2126, 0.7152, 0.0722];
const lum = (c) => c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2];
/** The moss hue (linear) normalised to unit luminance. */
export const mossHue = (P = M) => P.hue.map((v) => v / lum(P.hue));

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let ux = x - ix, uy = y - iy;
  ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a + (d - c - c + a) * ux) * uy; // (bilinear: mix(mix(a,b),mix(c,d)))
}

/** JS twin of the shader's mask (tests): the mix amount 0…strength at world point `p` on a face with unit world normal `n`,
 * `h` m above its ground, `joint` 0…1 (how much of a mortar joint the texel is). */
export function mossAmount(p, n, h, joint = 0, P = M) {
  const north = smooth(P.north[0], P.north[1], -n.z) * (1 - smooth(P.vertical[0], P.vertical[1], Math.abs(n.y)));
  if (!(north > 0) || h < -0.3) return 0;
  const u = p.x * -n.z + p.z * n.x, v = p.y;
  const n1 = noise(u / P.scale[0], v / P.scale[0]), n2 = noise(u / P.scale[1] + 7.3, v / P.scale[1] + 7.3), k = n1 * 0.65 + n2 * 0.35;
  const top = P.band * (0.55 + 0.9 * n1), band = 1 - smooth(top * 0.35, top, h);
  const jb = 1 - smooth(0, P.joints.height, h);
  return north * Math.min(1, band * smooth(P.cover[0], P.cover[1], k) + P.joints.amount * joint * jb * (0.4 + 0.6 * n2)) * P.strength;
}
/** The linear colour after the moss: `c` (linear RGB) mixed by `a` towards the moss hue at c's own luminance × dark. */
export function mossColor(c, a, P = M) {
  const hue = mossHue(P), l = lum(c) * P.dark;
  return c.map((v, i) => v + (hue[i] * l - v) * a);
}

const f = (x) => Number(x).toFixed(4);
/** The GLSL: { vertexHead, vertexBody, head, body }. `joints`: 'bump' (low bumpMap height = joint), 'map' (light map texel =
 * mortar) or null. */
export function mossGLSL(joints = null, P = M) {
  const hue = mossHue(P), J = P.joints;
  const joint = joints === 'bump' ? `#ifdef USE_BUMPMAP
    mossJ = 1.0 - smoothstep(${f(J.bump[0])}, ${f(J.bump[1])}, texture2D(bumpMap, vBumpMapUv).r);
  #endif` : joints === 'map' ? `#ifdef USE_MAP
    mossJ = smoothstep(${f(J.map[0])}, ${f(J.map[1])}, dot(sampledDiffuseColor.rgb, vec3(${LUM.join(', ')})));
  #endif` : '';
  return {
    vertexHead: 'attribute float mossHeight;\nvarying float vMossH;',
    vertexBody: `vMossH = mossHeight - ${f(P.offset)};`,
    head: /* glsl */`
varying float vMossH;
float mossHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mossNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(mossHash(i), mossHash(i + vec2(1.0, 0.0)), u.x), mix(mossHash(i + vec2(0.0, 1.0)), mossHash(i + vec2(1.0, 1.0)), u.x), u.y); }`,
    body: /* glsl */`
if (vMossH > -0.3 && vMossH < ${f(Math.max(P.band * 1.45, J.height))}) {
  vec3 mossN = normalize(transpose(mat3(viewMatrix)) * cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  float mossNorth = smoothstep(${f(P.north[0])}, ${f(P.north[1])}, -mossN.z) * (1.0 - smoothstep(${f(P.vertical[0])}, ${f(P.vertical[1])}, abs(mossN.y)));
  if (mossNorth > 0.0) {
    vec3 mossP = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);
    vec2 mossQ = vec2(mossP.x * -mossN.z + mossP.z * mossN.x, mossP.y);
    float mossN1 = mossNoise(mossQ / ${f(P.scale[0])}), mossN2 = mossNoise(mossQ / ${f(P.scale[1])} + 7.3);
    float mossK = mossN1 * 0.65 + mossN2 * 0.35, mossTop = ${f(P.band)} * (0.55 + 0.9 * mossN1);
    float mossJ = 0.0;
  ${joint}
    float mossA = mossNorth * ${f(P.strength)} * min(1.0, (1.0 - smoothstep(mossTop * 0.35, mossTop, vMossH)) * smoothstep(${f(P.cover[0])}, ${f(P.cover[1])}, mossK)
      + ${f(J.amount)} * mossJ * (1.0 - smoothstep(0.0, ${f(J.height)}, vMossH)) * (0.4 + 0.6 * mossN2));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${hue.map(f).join(', ')}) * dot(diffuseColor.rgb, vec3(${LUM.join(', ')})) * ${f(P.dark)}, mossA);
    roughnessFactor = mix(roughnessFactor, 1.0, mossA * ${f(P.rough)});
  }
}`,
  };
}

/** Bake `mossHeight` (+ offset) on a geometry in world coordinates: each vertex's height over `ground(x, z)` sampled
 * SHADE_MOSS.reach m out along its normal (cached on a SHADE_MOSS.grid m lattice). Positions untouched. */
export function mossHeights(geometry, ground, P = M) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal, out = new Float32Array(pos.count), cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    if (nor) { const nx = nor.getX(i), nz = nor.getZ(i), l = Math.hypot(nx, nz); if (l > 1e-3) { x += nx / l * P.reach; z += nz / l * P.reach; } }
    const gx = Math.round(x / P.grid), gz = Math.round(z / P.grid), key = gx * 100003 + gz;
    let g = cache.get(key);
    if (g === undefined) { g = ground(gx * P.grid, gz * P.grid); if (!Number.isFinite(g)) g = -1e3; cache.set(key, g); }
    out[i] = pos.getY(i) - g + P.offset;
  }
  geometry.setAttribute('mossHeight', new THREE.BufferAttribute(out, 1));
  return geometry;
}

/** Chain the moss onto a MeshStandardMaterial (once per material; unique cache-key suffix). */
export function mossMaterial(material, joints = null, P = M) {
  const m = material;
  if (!m?.isMeshStandardMaterial || m.userData.shadeMoss) return m;
  m.userData.shadeMoss = joints ?? 'plain';
  const glsl = mossGLSL(joints, P), before = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (shader.fragmentShader.includes('vMossH')) return; // (an inherited, already mossy callback)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${glsl.vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${glsl.vertexBody}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${glsl.head}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${glsl.body}`);
  };
  rememberFragmentCompile(m.onBeforeCompile, before); // a varying only: vertex positions unchanged
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  m.customProgramCacheKey = function () { return `${base.call(this)}|shademoss2122-${m.userData.shadeMoss}`; };
  m.needsUpdate = true;
  return m;
}

/** Moss on a built (merged, world-coordinate) mesh: bake its heights over `ground` and patch its material. No-op on phones
 * (`lite`) or without a mesh. Returns the mesh. */
export function shadeMoss(mesh, ground, joints = null, lite = lowMemory) {
  if (lite || !mesh?.geometry || !mesh.material?.isMeshStandardMaterial) return mesh;
  mossHeights(mesh.geometry, ground);
  mossMaterial(mesh.material, joints);
  return mesh;
}
