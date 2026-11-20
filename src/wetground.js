// #2099: wet ground during and after rain. One shared state (wet film + puddles, WET_GROUND) integrated on the game clock
// from the weather, and a fragment-only patch for the outdoor ground materials (asphalt, paving, gravel, road paint) that
// reads it from shared uniforms: darker, glossier, a few shallow puddles reflecting the sky's own colours. Dry (wet = 0) skips
// every added branch, so the dry picture is unchanged; no new draws, textures, lights, passes or per-frame uploads beyond
// three floats (the sky colours are DayCycle's own Color objects).
import * as THREE from 'three';
import { WET_GROUND as W, RAIN_RIPPLES as RR, SEASON } from './config.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { leafLitter } from './leaflitter.js';
import { lowMemory } from './lowmemory.js';
import { snowState, calendarCover } from './snowcover.js';

/** The uniforms every patched material shares: uGroundWet = (film, puddles, rain on it #2119), the sky's horizon / zenith colours,
 * uWetTime = the drop rings' clock (s, wraps at RAIN_RIPPLES.wrap). */
export const wetUniforms = {
  uGroundWet: { value: new THREE.Vector3() },
  uWetTime: { value: 0 },
  uWetHorizon: { value: new THREE.Color(0.6, 0.65, 0.7) },
  uWetZenith: { value: new THREE.Color(0.35, 0.45, 0.6) },
};

/** What falls that wets the ground: rain and (melting) hail, 0…1. */
export const wetting = (rain, kind) => (kind === 'rain' || kind === 'hail' ? Math.max(0, rain) : 0);

/** #2119: the rain that rings the puddles now, eased from `cur` over `dt` s (RAIN_RIPPLES.fade): rain only (not hail or snow), and
 * none where there is nothing to ring (`on` = puddles drawn and not a snow month). */
export function rippleStep(cur, rain, kind, on, dt, P = RR) {
  if (!on) return 0; // (puddles off, snow month or dry ground: nothing to ring, at once)
  const target = kind === 'rain' ? Math.max(0, Math.min(1, rain)) : 0;
  if (!(dt > 0)) return cur;
  const next = target + (cur - target) * Math.exp(-dt / P.fade);
  return Math.abs(next - target) < 1e-3 ? target : next;
}

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
    Object.assign(this, { weather, day, P, wet: 0, pool: 0, puddles: true, t: null, ripple: 0, time: 0 });
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

  /** After Weather.update: advance on the game clock and write the shared uniform; `dt` (real s) runs #2119's drop rings. */
  update(dt = 0) {
    const now = gameHours(this.day), dh = this.t === null ? null : now - this.t;
    if (dh === null || dh < 0 || dh > this.P.jump) this.spinUp(now);
    else Object.assign(this, wetStep(this, { falling: wetting(this.weather.rain, this.weather.kind), daylight: this.day.daylight ?? 0,
      overcast: this.weather.overcast ?? 0, temp: this.weather.temp ?? 10 }, dh, this.P));
    this.t = now;
    // #2176: snow-covered ground is dry (the snow step, snowground.js, whitens it); the shared cover (calendar without real data) fades the film out
    const cover = snowState.driven ? snowState.cover : calendarCover(this.day.month), bare = 1 - Math.min(1, Math.max(0, (cover - 0.08) / 0.32)), snow = bare <= 0;
    this.ripple = rippleStep(this.ripple, this.weather.rain ?? 0, this.weather.kind, this.puddles && bare > 0.5 && this.wet > 0, dt);
    if (dt > 0) wetUniforms.uWetTime.value = this.time = (this.time + dt) % RR.wrap;
    wetUniforms.uGroundWet.value.set(snow ? 0 : this.wet * bare, snow || !this.puddles ? 0 : this.pool * bare, this.ripple);
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
export function wetGLSL(kind, P = W, lite = false, R = RR) {
  const K = P.kinds[kind], Q = P.puddle, puddles = K.puddles > 0 && !lite;
  const rip = puddles && R ? rippleGLSL(R, R.kinds[kind] ?? 0) : null; // #2119: only where puddles compile (never -lite)
  const head = /* glsl */ `
uniform vec3 uGroundWet, uWetHorizon, uWetZenith;
${puddles ? `float wetHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wetNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(wetHash(i), wetHash(i + vec2(1.0, 0.0)), u.x), mix(wetHash(i + vec2(0.0, 1.0)), wetHash(i + vec2(1.0, 1.0)), u.x), u.y); }` : ''}${rip ? rip.head : ''}`;
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
if (wetP > 0.0) normal = normalize(mix(normal, nonPerturbedNormal, wetP));${rip ? rip.body : ''}` : '';
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

/** #2119: rain on the puddles and the wet film (desktop only): `head` = the clock uniform and the ring / splash functions, `body` =
 * after the puddles' flattening: bend the view normal by the rings' slope (in puddles) and the splashes' (on the film), behind
 * `uGroundWet.z > 0` (it is raining) so dry ground and the ground after rain run none of it. `splash` = this kind's share. */
export function rippleGLSL(R = RR, splash = 1) {
  const G = R.rings, S = R.splash, keep = 1 - 2 * (G.radius + 2 * G.width) / G.cell; // (the front and its tail stay inside the cell)
  const head = /* glsl */ `
uniform float uWetTime;
float wetRipHash(vec2 p) { return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453); }
// one grid of drop rings: the surface slope (world xz) at p, for rain k (0…1)
vec2 wetRings(vec2 p, float k, float lay) {
  vec2 c = floor(p / ${f(G.cell)});
  float ph = uWetTime / ${f(G.period)} + wetRipHash(c + lay * 7.31), a = fract(ph);
  vec2 s = c + floor(ph) * vec2(0.731, 1.37) + lay * 3.1;
  if (wetRipHash(s) > mix(${f(G.drops[0])}, ${f(G.drops[1])}, k)) return vec2(0.0);
  vec2 d = p - (c + 0.5 + (vec2(wetRipHash(s + 5.17), wetRipHash(s + 9.83)) - 0.5) * ${f(keep)}) * ${f(G.cell)};
  float r = length(d), x = (r - a * ${f(G.radius)}) / (${f(G.width)} * (1.0 + a));
  float env = (1.0 - a) * (1.0 - a) * smoothstep(0.0, 0.06, a);
  return d / max(r, 1e-4) * exp(-x * x) * (2.4 * cos(2.4 * x) - 2.0 * x * sin(2.4 * x)) / 2.4 * env;
}
// one small splash per cell, now and then: xy = its slope, z = its strength (0…1)
vec3 wetSplash(vec2 p, float k) {
  vec2 c = floor(p / ${f(S.cell)});
  float ph = uWetTime * ${f(S.rate)} + wetRipHash(c + 41.7), a = fract(ph);
  vec2 s = c + floor(ph) * vec2(1.13, 0.37);
  vec2 q = fract(p / ${f(S.cell)}) - 0.5 - (vec2(wetRipHash(s + 6.1), wetRipHash(s + 3.3)) - 0.5) * 0.3;
  float fl = step(wetRipHash(s + 2.9), ${f(S.share)} * k) * (1.0 - a) * (1.0 - a) * smoothstep(0.42, 0.18, length(q));
  return vec3(normalize(q + 1e-4) * ${f(S.tilt)} * fl, fl);
}`;
  const body = /* glsl */ `
if (uGroundWet.z > 0.0 && wetW > 0.0) {
  vec3 ripW = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);
  float ripD = length(vViewPosition);
  vec2 ripS = vec2(0.0);
  if (wetP > 0.0 && ripD < ${f(G.near[1])}) ripS += (wetRings(ripW.xz, uGroundWet.z, 0.0) + wetRings(ripW.xz + ${f(G.cell / 2)}, uGroundWet.z, 1.0))
    * ${f(G.tilt)} * wetP * smoothstep(${f(G.near[1])}, ${f(G.near[0])}, ripD);
${splash > 0 ? `  float ripA = ${f(splash)} * wetW * wetW * (1.0 - wetP) * smoothstep(${f(S.near[1])}, ${f(S.near[0])}, ripD);
  if (ripA > 0.0) {
    vec3 ripF = wetSplash(ripW.xz, uGroundWet.z);
    ripS += ripF.xy * ripA;
    roughnessFactor = mix(roughnessFactor, min(roughnessFactor, ${f(S.rough)}), ripF.z * ripA);
  }
` : ''}  normal = normalize(normal - mat3(viewMatrix) * vec3(ripS.x, 0.0, ripS.y));
}`;
  return { head, body };
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
