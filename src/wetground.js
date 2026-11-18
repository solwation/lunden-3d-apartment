// #2099: wet ground during and after rain. One shared state (wet film + puddles, WET_GROUND) integrated on the game clock
// from the weather, and a fragment-only patch for the outdoor ground materials (asphalt, paving, gravel, road paint) that
// reads it from shared uniforms: darker, glossier, a few shallow puddles reflecting the sky's own colours. Dry (wet = 0) skips
// every added branch, so the dry picture is unchanged; no new draws, textures, lights, passes or per-frame uploads beyond
// three floats (the sky colours are DayCycle's own Color objects).
import * as THREE from 'three';
import { WET_GROUND as W, SEASON } from './config.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { leafLitter } from './leaflitter.js';
import { lowMemory } from './lowmemory.js';

/** The uniforms every patched material shares: uGroundWet = (film, puddles, 0), the sky's horizon / zenith colours. */
export const wetUniforms = {
  uGroundWet: { value: new THREE.Vector3() },
  uWetHorizon: { value: new THREE.Color(0.6, 0.65, 0.7) },
  uWetZenith: { value: new THREE.Color(0.35, 0.45, 0.6) },
};

/** What falls that wets the ground: rain and (melting) hail, 0…1. */
export const wetting = (rain, kind) => (kind === 'rain' || kind === 'hail' ? Math.max(0, rain) : 0);

/** One step of `dh` game hours: { wet, pool } after falling = wetting(), with drying sped up by sun (daylight × clear sky) and warmth. */
export function wetStep(s, { falling = 0, daylight = 0, overcast = 1, temp = 10 } = {}, dh = 0, P = W) {
  let { wet, pool } = s;
  if (dh <= 0) return { wet, pool };
  if (falling > 0) {
    wet = Math.min(1, wet + falling * dh / P.wetUp);
    if (wet >= 1) pool = Math.min(1, pool + falling * dh / P.poolUp);
  } else {
    const rate = 1 + P.sun * daylight * (1 - overcast) + P.warm * Math.max(0, temp);
    pool = Math.max(0, pool - rate * dh / P.poolDry);
    wet = Math.max(pool > 0 ? Math.min(wet, 0.15 + 0.35 * pool) : 0, wet - rate * dh / P.dry); // a damp film stays round the puddles while they last
  }
  return { wet, pool };
}

const HOUR = 3.6e6;
/** Game time in hours (local calendar). */
export const gameHours = (d) => new Date(d.year, d.month - 1, d.date).getTime() / HOUR + d.hour;
/** A rough daylight 0…1 for an hour of the day (history only: the live value comes from DayCycle). */
const dayShape = (h) => Math.max(0, Math.min(1, Math.sin(((h - 6) / 12) * Math.PI) * 1.4));

/** The integrated wetness for the weather: `weather` (Weather: force, real, state), `day` (DayCycle). */
export class GroundWetness {
  constructor(weather, day, P = W) {
    Object.assign(this, { weather, day, P, wet: 0, pool: 0, puddles: true, t: null });
  }

  /** What fell at game hour `t` (absolute, gameHours): Weather.fallAt (forced = constant, real data, else the seeded draw). */
  fallAt(t) {
    const dt = new Date(t * HOUR), y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    const s = this.weather.fallAt(y, m, d, (t * HOUR - new Date(y, m - 1, d).getTime()) / HOUR);
    return wetting(s.rain, s.kind);
  }

  /** Integrate the last P.spinUp hours up to `now` from the weather history. */
  spinUp(now) {
    let s = { wet: 0, pool: 0 };
    const temp = this.weather.temp ?? 10;
    for (let t = now - this.P.spinUp; t < now - 1e-9; t += this.P.step) {
      const falling = this.fallAt(t), h = ((t % 24) + 24) % 24;
      s = wetStep(s, { falling, daylight: dayShape(h), overcast: falling > 0 ? 1 : 0.4, temp }, Math.min(this.P.step, now - t), this.P);
    }
    Object.assign(this, s);
  }

  /** After Weather.update: advance on the game clock and write the shared uniform. */
  update() {
    const now = gameHours(this.day), dh = this.t === null ? null : now - this.t;
    if (dh === null || dh < 0 || dh > this.P.jump) this.spinUp(now);
    else Object.assign(this, wetStep(this, { falling: wetting(this.weather.rain, this.weather.kind), daylight: this.day.daylight ?? 0,
      overcast: this.weather.overcast ?? 0, temp: this.weather.temp ?? 10 }, dh, this.P));
    this.t = now;
    const snow = SEASON.snowMonths.includes(this.day.month); // the snow months' ground is snow (registerSnow): dry
    wetUniforms.uGroundWet.value.set(snow ? 0 : this.wet, snow || !this.puddles ? 0 : this.pool, 0);
    return wetUniforms.uGroundWet.value;
  }
}

/** Share DayCycle's own sky colours (linear) as the reflected sky (no per-frame copy). */
export function bindWetSky(horizon, zenith) {
  wetUniforms.uWetHorizon.value = horizon; wetUniforms.uWetZenith.value = zenith;
}

const f = (x) => Number(x).toFixed(4);
/** The GLSL for a surface kind: declarations, after roughnessmap (albedo/roughness), after normal maps (flatten in puddles), after lights (sky).
 * `lite` (phones, #2118): no puddle code at all. Phones never get puddles (GroundWetness.puddles is off there, so uGroundWet.y = 0 and the
 * puddle branch never ran); leaving it out gives the same pixels from a smaller shader to compile. */
export function wetGLSL(kind, P = W, lite = false) {
  const K = P.kinds[kind], Q = P.puddle, puddles = K.puddles > 0 && !lite;
  const head = /* glsl */ `
uniform vec3 uGroundWet, uWetHorizon, uWetZenith;
${puddles ? `float wetHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wetNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(wetHash(i), wetHash(i + vec2(1.0, 0.0)), u.x), mix(wetHash(i + vec2(0.0, 1.0)), wetHash(i + vec2(1.0, 1.0)), u.x), u.y); }` : ''}`;
  const surface = /* glsl */ `
float wetW = 0.0, wetP = 0.0;
if (uGroundWet.x > 0.0) {
  wetW = uGroundWet.x;
${puddles ? `  if (uGroundWet.y > 0.0) {
    vec3 wetWorld = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);
    float wetN = wetNoise(wetWorld.xz / ${f(Q.scale[0])}) * 0.68 + wetNoise(wetWorld.xz / ${f(Q.scale[1])} + 17.3) * 0.32;
    float wetT = 1.0 - ${f(K.puddles)} * uGroundWet.y;
    float wetFlat = smoothstep(${f(Q.flat[0])}, ${f(Q.flat[1])}, abs(normalize(cross(dFdx(wetWorld), dFdy(wetWorld))).y));
    wetP = smoothstep(wetT, wetT + ${f(Q.edge)}, wetN) * wetFlat;
  }` : ''}
  // damp darkens soon (×1.6), the gloss comes only as it soaks (wet²)
  diffuseColor.rgb *= mix(1.0, ${f(K.dark)}, min(1.0, wetW * 1.6)) * mix(1.0, ${f(Q.dark)}, wetP);
  roughnessFactor = mix(roughnessFactor, min(roughnessFactor, ${f(K.rough)}), wetW * wetW);
  roughnessFactor = mix(roughnessFactor, ${f(Q.rough)}, wetP);
}`;
  const flatten = puddles ? /* glsl */ `
if (wetP > 0.0) normal = normalize(mix(normal, nonPerturbedNormal, wetP));` : '';
  const sky = /* glsl */ `
if (wetW > 0.0) {
  vec3 wetV = normalize(vViewPosition);
  float wetF = 0.02 + 0.98 * pow(1.0 - clamp(dot(normal, wetV), 0.0, 1.0), 5.0);
  vec3 wetR = transpose(mat3(viewMatrix)) * reflect(-wetV, normal);
  vec3 wetSky = mix(uWetHorizon, uWetZenith, sqrt(clamp(wetR.y, 0.0, 1.0)));
  reflectedLight.indirectSpecular += wetSky * wetF * (${f(P.sky.film)} * wetW * wetW * (1.0 - wetP) + ${f(P.sky.pool)} * wetP);
}`;
  return { head, surface, flatten, sky };
}

/** Patch a lit ground material (MeshStandard) for `kind` (WET_GROUND.kinds): chains its onBeforeCompile and cache key. Once per material. */
export function wetGround(material, kind, lite = lowMemory) {
  const m = material;
  if (!m?.isMeshStandardMaterial || m.userData.wetGround) return m;
  if (!W.kinds[kind]) throw new Error(`wetGround: unknown kind ${kind}`);
  m.userData.wetGround = kind;
  const glsl = wetGLSL(kind, W, lite), before = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (shader.fragmentShader.includes('uGroundWet')) return; // (an inherited, already wet callback)
    Object.assign(shader.uniforms ??= {}, wetUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${glsl.head}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${glsl.surface}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${glsl.flatten}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${glsl.sky}`);
  };
  rememberFragmentCompile(m.onBeforeCompile, before);
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  m.customProgramCacheKey = function () { return `${base.call(this)}|wet2099-${kind}${lite ? '-lite' : ''}`; };
  m.needsUpdate = true;
  return leafLitter(m, kind, '', lite); // #2105: autumn leaves on the same exposed ground (the outer wrapper inserts its step first: wet leaves darken and gloss too)
}
