import * as THREE from 'three';
import { SITE_WIND as W, FOLIAGE, WIND } from './config.js';
import { rememberBoundedVertexCompile } from './vertexcompile.js';
import { lowMemory } from './lowmemory.js';
import { windPower } from './windsim.js';

// Outdoor vegetation sway (#2101): the site's tree crowns and shrubs (the leaf-card lobes of src/foliage.js), the courtyard
// perennials and the river park's reeds and bank tussocks move softly in the wind, with a strength that follows the
// weather (Weather has no wind of its own: `siteWindPower` derives one from clear / overcast / rain / storm). All the work is
// in the vertex shader: per frame only the three shared uniforms below change (no per-instance CPU work, no buffer upload,
// no new draw call or pass). Colour and shadow-depth materials get the very same GLSL and the same uniform objects, so a
// shadow sways exactly with its crown. The displacement is world space (metres), clamped to `SITE_WIND.maxDisplacement`;
// the patch is registered as a bounded vertex edit (src/vertexcompile.js), so the frustum / occlusion helpers widen their
// boxes by that much instead of treating the material as native. Collision, seasons, instancing and the LOD are untouched.
//
// Modes: 'lobe' — an instanced crown lobe of radius ~1 round its origin (src/foliage.js lobeGeometry): the whole lobe sways
// with its tree (weighted towards its top, scaled by the lobe's world height), the outer leaf cards flutter a little on
// top of that; 'bend' — a merged mesh with a per-vertex `siteWindBend` attribute (m above the plant's foot): the vertex bends
// downwind by bend² (stalk tips move, feet stay).
//
// Reuse (#2110): `siteWind` is the live state { time, power, dir } and `siteWindOffset` the JS mirror of the shader's
// offset, so another module (an avatar's hair or clothes) can follow the same wind without a second source.
// #2117: the power and direction now come from the weather's wind (`weather.wind`, m/s downwind: the real 10 m wind or windsim.js' seeded
// draw) — power = `windPower(speed)`, direction = downwind — both eased; `siteWindPower` (cloud / rain / storm) remains the fallback for
// a weather without wind. `SITE_WIND.dir` is only the start direction.

/** The live wind state: seconds, power 0…1 (0 = still), unit downwind direction in the x/z plane; `force` / `hold`: see SiteWind. */
export const siteWind = { time: 0, power: 0, dir: new THREE.Vector2(W.dir[0], W.dir[1]).normalize(), force: null, hold: false };
const uniforms = { uSiteWindTime: { value: 0 }, uSiteWindPower: { value: 0 }, uSiteWindDir: { value: siteWind.dir } };
/** The shared uniform objects (tests, and a later consumer that patches its own shader). */
export const siteWindUniforms = uniforms;

const num = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/** The weather's wind power 0…1: a light breeze in clear weather, more under cloud and in rain, a storm the most. */
export function siteWindPower({ overcast = 0, rain = 0, storm = false } = {}) {
  const p = W.calm + W.overcast * overcast + W.rain * rain + (storm ? W.storm : 0);
  return Math.min(1, Math.max(0, p));
}

/**
 * The JS mirror of the shader's offset (world metres, { x, z }). `anchor` {x, z} picks the phase and the gust; `weight` m of
 * sway at unit oscillation; `flutter` m of extra card flutter with its `seed`; `freq` the oscillation rate (rad/s).
 */
export function siteWindOffset(state, anchor, weight, flutter = 0, seed = 0, freq = W.crown.freq) {
  const { time: t, power, dir } = state;
  if (!(power > 0)) return { x: 0, z: 0 };
  const ph = anchor.x * W.phase[0] + anchor.z * W.phase[1];
  const gust = 1 - W.gust.depth + W.gust.depth * Math.sin(t * W.gust.freq - (anchor.x * dir.x + anchor.z * dir.y) * W.gust.wave);
  const s = Math.sin(t * freq + ph) + W.harmonic * Math.sin(t * freq * 2.37 + ph * 1.7);
  const c = Math.sin(t * freq * 0.71 + ph + 1.3);
  const a = (W.lean + s) * weight * gust, b = W.side * c * weight * gust;
  let x = dir.x * a - dir.y * b + flutter * Math.sin(t * W.crown.flutterFreq + seed);
  let z = dir.y * a + dir.x * b + flutter * Math.cos(t * W.crown.flutterFreq * 1.13 + seed * 1.31);
  x *= power; z *= power;
  const l = Math.hypot(x, z);
  if (l > W.maxDisplacement) { x *= W.maxDisplacement / l; z *= W.maxDisplacement / l; }
  return { x, z };
}

/** The crown weight of a lobe vertex (local position on the radius-1 lobe, world height `size` of the lobe). */
export function lobeWeights(local, size, flutter = !lowFlutter) {
  const h = Math.min(1, Math.max(0, (local.y + 1) / 2)), r = Math.hypot(local.x, local.y, local.z);
  const e = Math.min(1, Math.max(0, (r - W.crown.cardFrom) / (1 - W.crown.cardFrom))), fl = e * e * (3 - 2 * e);
  const sz = Math.min(size, W.crown.maxSize);
  return { weight: W.crown.amp * sz * (W.crown.base + (1 - W.crown.base) * h), flutter: flutter ? W.crown.flutter * fl : 0, seed: local.x * 12.9898 + local.y * 78.233 + local.z * 37.719 };
}

/** Phones (lowMemory): no card flutter (one sine pair less per vertex). */
const lowFlutter = lowMemory;

const HEAD = /* glsl */`
uniform float uSiteWindTime;
uniform float uSiteWindPower;
uniform vec2 uSiteWindDir;
#ifdef SITE_WIND_BEND
attribute float siteWindBend;
#endif
vec3 siteWindWorld(vec3 anchor, float weight, float flutter, float seed, float freq) {
  if (uSiteWindPower <= 0.0) return vec3(0.0);
  float t = uSiteWindTime;
  float ph = dot(anchor.xz, vec2(${num(W.phase[0])}, ${num(W.phase[1])}));
  float gust = ${num(1 - W.gust.depth)} + ${num(W.gust.depth)} * sin(t * ${num(W.gust.freq)} - dot(anchor.xz, uSiteWindDir) * ${num(W.gust.wave)});
  float s = sin(t * freq + ph) + ${num(W.harmonic)} * sin(t * freq * 2.37 + ph * 1.7);
  float c = sin(t * freq * 0.71 + ph + 1.3);
  float a = (${num(W.lean)} + s) * weight * gust, b = ${num(W.side)} * c * weight * gust;
  vec2 o = uSiteWindDir * a + vec2(-uSiteWindDir.y, uSiteWindDir.x) * b
    + flutter * vec2(sin(t * ${num(W.crown.flutterFreq)} + seed), cos(t * ${num(W.crown.flutterFreq * 1.13)} + seed * 1.31));
  o *= uSiteWindPower;
  float l = length(o);
  if (l > ${num(W.maxDisplacement)}) o *= ${num(W.maxDisplacement)} / l;
  return vec3(o.x, 0.0, o.y);
}
`;
const LOBE = /* glsl */`
{
  #ifdef USE_INSTANCING
  mat4 swM = modelMatrix * instanceMatrix;
  #else
  mat4 swM = modelMatrix;
  #endif
  mat3 swL = mat3(swM);
  float swH = clamp((transformed.y + 1.0) * 0.5, 0.0, 1.0);
  float swW = ${num(W.crown.amp)} * min(length(swL[1]), ${num(W.crown.maxSize)}) * (${num(W.crown.base)} + ${num(1 - W.crown.base)} * swH);
  #ifdef SITE_WIND_FLUTTER
  float swF = ${num(W.crown.flutter)} * smoothstep(${num(W.crown.cardFrom)}, 1.0, length(transformed));
  #else
  float swF = 0.0;
  #endif
  vec3 swO = siteWindWorld(swM[3].xyz, swW, swF, dot(transformed, vec3(12.9898, 78.233, 37.719)), ${num(W.crown.freq)});
  float swD = determinant(swL);
  if (abs(swD) > 1e-9) transformed += inverse(swL) * swO;
}
`;
const BEND = /* glsl */`
{
  mat3 swL = mat3(modelMatrix);
  vec3 swO = siteWindWorld((modelMatrix * vec4(transformed, 1.0)).xyz, ${num(W.bend.amp)} * siteWindBend * siteWindBend, 0.0, 0.0, ${num(W.bend.freq)});
  float swD = determinant(swL);
  if (abs(swD) > 1e-9) transformed += inverse(swL) * swO;
}
`;

/** The shader edit itself: the head after <common>, the offset right after <begin_vertex> (before skinning/projection). */
export function siteWindShader(shader, mode) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${HEAD}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${mode === 'bend' ? BEND : LOBE}`);
}

/**
 * Make `material` (colour or depth) sway, before its first compile. `mode`: 'lobe' | 'bend'. Chains any onBeforeCompile it
 * already has, extends its program key, and registers the edit as bounded by `SITE_WIND.maxDisplacement` m.
 */
export function patchSiteWind(material, mode = 'lobe') {
  if (material.userData.siteWind) return material;
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : () => key.call(material);
  const defines = (material.defines ??= {});
  if (mode === 'bend') defines.SITE_WIND_BEND = ''; else if (!lowFlutter) defines.SITE_WIND_FLUTTER = '';
  const patched = function (shader, renderer) { before.call(this, shader, renderer); siteWindShader(shader, mode); };
  material.onBeforeCompile = patched;
  material.customProgramCacheKey = function () { return `${base.call(this)}|site-wind-${mode}${lowFlutter && mode === 'lobe' ? '-lo' : ''}-v1`; };
  rememberBoundedVertexCompile(patched, before, W.maxDisplacement);
  material.userData.siteWind = mode;
  return material;
}

/** Widen a mesh's culling sphere by the sway (an InstancedMesh's own sphere, else its geometry's). */
export function siteWindBounds(mesh) {
  if (mesh.isInstancedMesh) { mesh.boundingSphere ?? mesh.computeBoundingSphere(); mesh.boundingSphere.radius += W.maxDisplacement; return mesh; }
  const g = mesh.geometry; if (g.userData.siteWindBounds) return mesh;
  g.boundingSphere ?? g.computeBoundingSphere(); g.boundingSphere.radius += W.maxDisplacement; g.userData.siteWindBounds = true;
  return mesh;
}

/** A depth material for swaying leaf cards (cut out by the atlas like three's own). */
export function siteWindLeafDepth(material, mode = 'lobe') {
  return patchSiteWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: material.map, alphaTest: material.alphaTest, side: THREE.DoubleSide }), mode);
}

/**
 * Drives the shared uniforms from the weather: eased power, a running clock. `siteWind.force` (0…1, the `&wind=` parameter)
 * pins the power; `siteWind.hold` stops the clock and applies the power at once (`&wind=power,seconds`: repeatable frames).
 */
export class SiteWind {
  constructor(weather, { force = null, time = null } = {}) {
    this.weather = weather;
    siteWind.force = Number.isFinite(force) ? Math.min(1, Math.max(0, force)) : null;
    siteWind.hold = Number.isFinite(time); if (siteWind.hold) siteWind.time = time;
    this.power = siteWind.power = this.target(); this.steer(1);
    uniforms.uSiteWindPower.value = this.power; uniforms.uSiteWindTime.value = siteWind.time;
  }
  target() {
    const w = this.weather?.wind;
    return siteWind.force ?? (w ? windPower(Math.hypot(w.x, w.z)) : siteWindPower(this.weather ?? {}));
  }
  /** Turn `siteWind.dir` (the uniform's own Vector2) towards the weather's downwind direction by `k` 0…1; a calm keeps the last one. */
  steer(k) {
    const w = this.weather?.wind, v = w ? Math.hypot(w.x, w.z) : 0, d = siteWind.dir;
    if (!(v > WIND.still)) return;
    const a = Math.atan2(d.y, d.x); let da = Math.atan2(w.z, w.x) - a;
    da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI; // (the short way round; exactly opposite turns one way, never through zero)
    d.set(Math.cos(a + da * k), Math.sin(a + da * k));
  }
  update(dt) {
    if (!(dt >= 0 && Number.isFinite(dt))) return;
    const target = this.target(), k = 1 - Math.exp(-dt / W.easeSeconds);
    this.steer(siteWind.hold ? 1 : k);
    this.power = siteWind.hold ? target : this.power + (target - this.power) * k;
    if (!siteWind.hold) siteWind.time += dt;
    siteWind.power = this.power;
    uniforms.uSiteWindTime.value = siteWind.time; uniforms.uSiteWindPower.value = this.power;
  }
}

// (FOLIAGE.core is the lobe's opaque core radius; the cards start beyond it: keep `cardFrom` just outside it.)
if (W.crown.cardFrom < FOLIAGE.core) throw new RangeError('SITE_WIND.crown.cardFrom must lie outside FOLIAGE.core');
