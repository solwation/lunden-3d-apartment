// #2100: node --test tools/aerialhazetest.mjs  (aerial perspective: fog chunk patch, haze curve per weather, haze colour per sun position)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { HAZE } from '../src/config.js';
import { installHaze, hazeUniforms, hazeCurve, hazeState, applyHaze, clearHaze } from '../src/aerialhaze.js';
import { sunDirection } from '../src/daycycle.js';

const NEAR = 45, FAR = 650; // SITE.south.view fog
const HOR = new T.Color(0xcfe0ec), GLOW = new T.Color(0xff8a3c);
const sky = (hour, doy, extra = {}) => { const sunDir = sunDirection(hour, doy); const day = T.MathUtils.smoothstep(sunDir.y, -0.08, 0.18);
  const glowAmt = (1 - T.MathUtils.smoothstep(Math.abs(sunDir.y), 0, 0.35)) * T.MathUtils.smoothstep(sunDir.y, -0.15, 0.05);
  return hazeState({ sunDir, horizon: HOR.clone(), glow: GLOW, glowAmt, day, oc: 0, ...extra }); };

test('the fog chunks are patched once and every fogged ShaderLib entry shares the haze uniforms', () => {
  assert.equal(installHaze(), false, 'already installed at import');
  for (const k of ['fog_pars_vertex', 'fog_vertex', 'fog_pars_fragment']) assert.match(T.ShaderChunk[k], /vFogDir/);
  assert.match(T.ShaderChunk.fog_fragment, /hazeCurve\( vFogDepth, fogNear, fogFar \)/);
  assert.match(T.ShaderChunk.fog_fragment, /float fogFactor/, 'groundglow.js reads fogFactor after the chunk');
  assert.equal((T.ShaderChunk.fog_fragment.match(/gl_FragColor\.rgb = mix/g) || []).length, 1);
  for (const k of ['standard', 'physical', 'lambert', 'phong', 'basic', 'points', 'sprite', 'toon', 'matcap'])
    assert.equal(T.ShaderLib[k].uniforms.fogHazeSun, hazeUniforms.fogHazeSun, k);
  // per-material clones (built-ins) and merged custom ShaderMaterials keep the same objects, so one write reaches all programs
  const clone = T.UniformsUtils.clone(T.ShaderLib.standard.uniforms), merged = T.UniformsUtils.merge([T.UniformsLib.fog, { a: { value: 1 } }]);
  for (const u of [clone, merged, new T.ShaderMaterial({ uniforms: merged }).clone().uniforms]) for (const k in hazeUniforms) assert.equal(u[k].value, hazeUniforms[k].value);
});

test('near field unchanged: no haze before fog near for any weather; full fog at far; monotonic', () => {
  for (const w of [0, HAZE.clear.w, HAZE.overcast.w, 1]) {
    for (let d = 0; d <= NEAR; d += 5) assert.equal(hazeCurve(d, NEAR, FAR, w, HAZE.k), 0);
    assert.ok(Math.abs(hazeCurve(FAR, NEAR, FAR, w, HAZE.k) - 1) < 1e-9); assert.equal(hazeCurve(900, NEAR, FAR, w, HAZE.k), 1);
    let last = 0; for (let d = NEAR; d <= FAR; d += 5) { const f = hazeCurve(d, NEAR, FAR, w, HAZE.k); assert.ok(f >= last - 1e-12); last = f; }
  }
  assert.equal(hazeCurve(300, NEAR, FAR, 0, HAZE.k), T.MathUtils.smoothstep(300, NEAR, FAR), 'weight 0 = three\'s stock fog');
});

test('density: lighter on a clear day, denser mid-range under rain clouds, night = stock', () => {
  const noon = sky(13, 172), rain = sky(13, 172, { oc: 1 }), night = sky(1, 172);
  assert.ok(noon.w < rain.w); assert.equal(night.w, 0);
  const at = (s, d) => hazeCurve(d, NEAR, FAR, s.w, s.k);
  assert.ok(at(noon, 250) - T.MathUtils.smoothstep(250, NEAR, FAR) < 0.15, 'clear: close to the old curve');
  assert.ok(at(rain, 250) > at(noon, 250) + 0.1, 'overcast: clearly denser at 250 m');
  assert.ok(at(rain, 60) < 0.2 && at(noon, 60) < 0.05, 'just past fog near stays clear');
});

test('colour: bluer mid haze by day, warm towards a setting sun matching the sky glow, nothing at night / off', () => {
  const noon = sky(13, 172), sunset = sky(21.6, 172), night = sky(1, 172), off = sky(13, 172, { off: 1 }), rain = sky(13, 172, { oc: 1 });
  assert.ok(noon.blue.b > 0 && noon.blue.r < 0 && noon.blue.r < noon.blue.g, 'mid haze shifts towards blue');
  assert.ok(Math.abs(rain.blue.r) < Math.abs(noon.blue.r) / 2, 'grey under rain clouds');
  assert.ok(sunset.warm.r > sunset.warm.b && sunset.warm.r > 0.05, 'warm towards the low sun');
  assert.ok(sunset.warm.r > noon.warm.r * 2, 'the warmth belongs to the low sun');
  for (const s of [night, off]) for (const c of [s.blue, s.warm]) assert.ok(Math.abs(c.r) + Math.abs(c.g) + Math.abs(c.b) < 1e-3);
  // at full fog towards the sun the haze equals the sky shader's horizon there: srgb(horizon + glow*amt + scatter)
  const sd = sunDirection(21.6, 172), glowAmt = (1 - T.MathUtils.smoothstep(Math.abs(sd.y), 0, 0.35)) * T.MathUtils.smoothstep(sd.y, -0.15, 0.05);
  const skyOut = HOR.clone().add(GLOW.clone().multiplyScalar(glowAmt)).add(sunset.scatter).convertLinearToSRGB();
  const hazeOut = HOR.clone().convertLinearToSRGB().add(sunset.warm);
  for (const k of ['r', 'g', 'b']) assert.ok(Math.abs(skyOut[k] - hazeOut[k]) < 1e-6, k);
});

test('apply/clear write the shared uniforms', () => {
  const s = sky(21.6, 172); applyHaze(s);
  assert.equal(hazeUniforms.fogHazeWarm.value.x, s.warm.r); assert.equal(hazeUniforms.fogHazeWarm.value.w, s.w); assert.equal(hazeUniforms.fogHazeSun.value.y, s.sun.y);
  clearHaze(); assert.equal(hazeUniforms.fogHazeWarm.value.w, 0); assert.equal(hazeUniforms.fogHazeBlue.value.x, 0);
});
