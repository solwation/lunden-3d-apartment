// #2195: hoar frost on cold, clear, calm nights and mornings. One fragment step (per material kind, FROST.kinds) chained onto the existing
// MeshStandardMaterials of the lawns, roofs, parked cars (paint and glass) and benches, the way snowcap.js / wetsurface.js do: a whitish,
// finely grained film on faces that look up (glass: a share on the sides too), patchy by a world-xz noise and kept longest in the shade
// (the snow shelter texture of snowground.js: crowns and north facades; desktop only). The one shared cover (frostUniform, 0…1) comes
// from frostCover(): temperature, clear sky, calm, dry, no snow lying, and the sun: it melts as the sun climbs and builds up again after
// dark. No geometry, texture, draw, light, pass or per-frame work beyond one float. Phones (lowMemory): like snowCap only materials that
// already carry their own compile step get it (no new shader program, #2118). Pure helpers are headless-tested (tools/frosttest.mjs).
import * as THREE from 'three';
import { FROST as F } from './config.js';
import { snowGroundUniforms } from './snowground.js';
import { rememberFragmentCompile } from './vertexcompile.js';
import { lowMemory } from './lowmemory.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Smoothstep from `a` to `b` (either direction). */
const ramp = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** The frost cover 0…1 from { temp °C, overcast 0…1, wind m/s, rain 0…1, snow cover 0…1, sunY (sin of the sun's elevation), evening (after noon) }. */
export function frostCover({ temp = 10, overcast = 0, wind = 0, rain = 0, snow = 0, sunY = -1, evening = false } = {}, C = F) {
  if (!(rain <= C.rain)) return 0;
  const cold = ramp(C.temp[1], C.temp[0], temp), clear = ramp(C.overcast[1], C.overcast[0], overcast), calm = ramp(C.wind[1], C.wind[0], wind);
  const bare = ramp(C.snow[1], C.snow[0], snow), sun = ramp(C.sun[1], C.sun[0], sunY);
  const grow = evening ? ramp(0, C.grow, -sunY) : 1; // after sunset it takes a while to form; the melt in the morning is the `sun` term
  return cold * clear * calm * bare * sun * grow;
}

/** JS twin of the shader (tests): the frost amount 0…strength of `kind` at a spot with noise `n` (0…1), shelter 0…1, world normal y `ny`, at `cover`. */
export function frostAmount(kind, cover, { n = 0.5, shelter = 0, ny = 1 } = {}, C = F) {
  const K = C.kinds[kind];
  if (!K || !(cover > 0)) return 0;
  const up = Math.max(K.side, ramp(K.up[0], K.up[1], ny));
  const h = Math.min(0.95, Math.max(0.05, 0.5 + (n - 0.5) * C.noise - (K.shelter ? shelter * C.shelter : 0)));
  return ramp(h - 0.12, h + 0.12, cover * 1.15 - 0.1 * (1 - cover)) * up * K.strength;
}

/** The shared uniforms: the cover (the shelter texture and box are the snow ground's, by reference). */
export const frostUniform = { value: 0 };
const uniforms = { uFrost: frostUniform, uFrostShelter: snowGroundUniforms.uSnowShelter, uFrostBox: snowGroundUniforms.uSnowBox };

const f = (x) => Number(x).toFixed(4), c3 = (hex) => { const c = new THREE.Color(hex); return `${f(c.r)}, ${f(c.g)}, ${f(c.b)}`; };
/** The GLSL for a kind: { head, body }. */
export function frostGLSL(kind, lite = false, C = F) {
  const K = C.kinds[kind], shelter = K.shelter && !lite;
  const head = /* glsl */`
uniform float uFrost;${shelter ? ' uniform sampler2D uFrostShelter; uniform vec4 uFrostBox;' : ''}
float frostHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float frostNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(frostHash(i), frostHash(i + vec2(1.0, 0.0)), u.x), mix(frostHash(i + vec2(0.0, 1.0)), frostHash(i + vec2(1.0, 1.0)), u.x), u.y); }`;
  const body = /* glsl */`
if (uFrost > 0.0) {
  float frostUp = max(${f(K.side)}, smoothstep(${f(K.up[0])}, ${f(K.up[1])}, inverseTransformDirection(normal, viewMatrix).y));
  if (frostUp > 0.0) {
    vec3 frostW = transpose(mat3(viewMatrix)) * (-vViewPosition - viewMatrix[3].xyz);
    vec2 frostP = frostW.xz + vec2(frostW.y * 0.7, frostW.y * 0.4);
    float frostN = frostNoise(frostP / ${f(C.scale[0])}) * 0.6 + frostNoise(frostP / ${f(C.scale[1])} + 3.1) * 0.4;
    float frostH = clamp(0.5 + (frostN - 0.5) * ${f(C.noise)}${shelter ? ` - texture2D(uFrostShelter, (frostW.xz - uFrostBox.xy) * uFrostBox.zw).r * ${f(C.shelter)}` : ''}, 0.05, 0.95);
    float frostA = smoothstep(frostH - 0.12, frostH + 0.12, uFrost * 1.15 - 0.1 * (1.0 - uFrost)) * frostUp * ${f(K.strength)};
    if (frostA > 0.0) {
      float frostG = frostNoise(frostP / ${f(C.grain)});
      frostA = clamp(frostA * (0.8 + 0.4 * frostG), 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${c3(C.color)}) * (0.92 + 0.12 * frostG), frostA);
      roughnessFactor = mix(roughnessFactor, ${f(K.rough)}, frostA);
      metalnessFactor = mix(metalnessFactor, 0.0, frostA);
    }
  }
}`;
  return { head, body };
}

/** Chain the frost onto a MeshStandardMaterial of `kind` (once; unique cache-key suffix). `lite` (phones): only a material that already has
 * its own onBeforeCompile. Returns the material. */
export function frost(material, kind, lite = lowMemory, C = F) {
  const m = material;
  if (!m?.isMeshStandardMaterial || m.userData.frost) return m;
  if (!C.kinds[kind]) throw new Error(`frost: unknown kind ${kind}`);
  const before = m.onBeforeCompile, key = m.customProgramCacheKey;
  if (lite && before === THREE.Material.prototype.onBeforeCompile) return m;
  m.userData.frost = kind;
  const glsl = frostGLSL(kind, lite, C);
  m.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (shader.fragmentShader.includes('uniform float uFrost;')) return; // (an inherited, already frosted callback)
    Object.assign(shader.uniforms ??= {}, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${glsl.head}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${glsl.body}`);
  };
  rememberFragmentCompile(m.onBeforeCompile, before);
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  m.customProgramCacheKey = function () { return `${base.call(this)}|frost2195-${kind}${lite ? '-lite' : ''}`; };
  m.needsUpdate = true;
  return m;
}

/** The driver: frostUniform follows the weather and the clock (call after Weather.update and SnowCover.update). `force` (0…1) pins it (&frost=). */
export class FrostCover {
  constructor(weather, day, snowState, C = F) { Object.assign(this, { weather, day, snowState, C, force: null, shown: 0 }); }
  target() {
    if (this.force != null) return this.force;
    const w = this.weather, d = this.day;
    return frostCover({ temp: w.temp ?? 10, overcast: w.overcast ?? 0, rain: w.rain ?? 0, wind: w.wind ? Math.hypot(w.wind.x, w.wind.z) : 0,
      snow: this.snowState.cover, sunY: d.sunDir?.y ?? 1, evening: d.hour >= 12 }, this.C);
  }
  update(dt = 0) {
    const t = this.target();
    this.shown = this.force != null || dt <= 0 ? t : this.shown + (t - this.shown) * Math.min(1, dt / this.C.ease);
    frostUniform.value = this.shown < 0.003 ? 0 : this.shown;
    return frostUniform.value;
  }
}
