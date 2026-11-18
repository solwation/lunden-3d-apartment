// #2102: node --test tools/cloudshadowtest.mjs  (cloud shadows: lights chunk patch, off at clear sky / night / indoors, drift with the wind)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CLOUD_SHADOW as C } from '../src/config.js';
import { installCloudShadows, cloudShadowUniforms, cloudShadowState, applyCloudShadows, cloudDrift, cloudShadowAt } from '../src/cloudshadow.js';
import { sunDirection } from '../src/daycycle.js';

const NOON = sunDirection(13, 172), NIGHT = sunDirection(1, 172);
const set = (sunDir, oc, t = 0, off = 0) => { const s = cloudShadowState({ sunDir, oc, off }); applyCloudShadows(s, t); return s; };
/** The direct-sun factor over a 2 km × 2 km ground grid (20 m steps). */
const grid = (y = 0) => { const v = []; for (let x = -1000; x < 1000; x += 20) for (let z = -1000; z < 1000; z += 20) v.push(cloudShadowAt(x, y, z)); return v; };

test('the lights chunks are patched once and every lit ShaderLib entry shares the cloud uniforms', () => {
  assert.equal(installCloudShadows(), false, 'already installed at import');
  const L = T.ShaderChunk.lights_fragment_begin;
  assert.equal((L.match(/cloudShadowAt\( geometryPosition \)/g) || []).length, 1, 'once, in the directional loop');
  assert.ok(L.indexOf('cloudShadowAt') > L.indexOf('getDirectionalLightInfo') && L.indexOf('cloudShadowAt') < L.indexOf('#if ( NUM_RECT_AREA_LIGHTS'));
  assert.match(L, /UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS \)\n\t\tdirectLight\.color \*= cloudShadowAt/, 'only the shadow-casting light (the sun)');
  assert.equal((L.match(/getShadow\(/g) || []).length, 2, 'three\'s spot + directional shadow lookups untouched');
  assert.match(T.ShaderChunk.lights_pars_begin, /float cloudShadowAt\( vec3 viewPos \)/);
  for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon']) assert.equal(T.ShaderLib[k].uniforms.cloudShadowA, cloudShadowUniforms.cloudShadowA, k);
  const clone = T.UniformsUtils.clone(T.ShaderLib.standard.uniforms), merged = T.UniformsUtils.merge([T.UniformsLib.lights, { a: { value: 1 } }]);
  for (const u of [clone, merged]) for (const k in cloudShadowUniforms) assert.equal(u[k].value, cloudShadowUniforms[k].value);
});

test('no effect at a clear sky, full overcast, night, indoors / quality off', () => {
  for (const [what, sun, oc, off] of [['clear', NOON, 0, 0], ['overcast', NOON, 1, 0], ['night', NIGHT, 0.4, 0], ['indoors', NOON, 0.4, 1]]) {
    const s = set(sun, oc, 123, off);
    assert.equal(s.strength, 0, what); assert.equal(cloudShadowUniforms.cloudShadowA.value.w, 0, what);
    assert.ok(grid().every((v) => v === 1), what);
  }
  const half = set(NOON, 0.4, 0, 0.5).strength, full = set(NOON, 0.4).strength;
  assert.ok(Math.abs(half - full / 2) < 1e-12, 'the indoor fade scales it');
});

test('partly cloudy: soft patches of shade and sun, more shade as the cloud cover grows', () => {
  const share = (oc) => { set(NOON, oc); const v = grid(); return { shade: v.filter((x) => x < 1 - C.strength * 0.5).length / v.length, min: Math.min(...v), max: Math.max(...v) }; };
  const few = share(0.3), many = share(0.65);
  assert.ok(few.shade > 0.05 && few.shade < 0.5, `few clouds: ${few.shade}`);
  assert.ok(many.shade > few.shade + 0.15, `more clouds: ${many.shade}`);
  for (const r of [few, many]) { assert.equal(r.max, 1, 'sunlit gaps'); assert.ok(r.min >= 1 - C.strength - 1e-9 && r.min < 1 - C.strength * 0.8, 'shade keeps 1 − strength of the sun'); }
  // soft and large: neighbours 5 m apart barely differ
  set(NOON, 0.45); let worst = 0;
  for (let x = -500; x < 500; x += 5) worst = Math.max(worst, Math.abs(cloudShadowAt(x, 0, 40) - cloudShadowAt(x + 5, 0, 40)));
  assert.ok(worst < 0.25, `edge step ${worst}`);
});

test('the clouds drift with the wind (the cloud deck\'s and the rain\'s way), seamlessly and deterministically', () => {
  const l = Math.hypot(...C.wind), wx = C.wind[0] / l, wz = C.wind[1] / l;
  assert.ok(wx < 0, 'towards −x like the deck drift and the rain slant');
  const t1 = 10, t2 = 70, d1 = cloudDrift(t1), d2 = cloudDrift(t2);
  assert.ok(Math.abs(d2.dx - d1.dx - wx * C.speed * 60) < 1e-9 && Math.abs(d2.dz - d1.dz - wz * C.speed * 60) < 1e-9);
  const at = (t, x, z) => { set(NOON, 0.45, t); return cloudShadowAt(x, 0, z); };
  for (const [x, z] of [[0, 0], [130, -40], [-260, 310], [55, 500]]) {
    const a = at(t1, x, z), b = at(t2, x + d2.dx - d1.dx, z + d2.dz - d1.dz);
    assert.ok(Math.abs(a - b) < 1e-6, `the shade moved with the wind at ${x},${z}`);
  }
  assert.notDeepEqual([at(t1, 0, 0), at(t1, 100, 0), at(t1, 0, 100)], [at(t2, 0, 0), at(t2, 100, 0), at(t2, 0, 100)], 'it does move');
  // the offset wraps every tile without a jump; same time → same picture
  const tile = C.cell * C.cells, tw = tile / C.speed / Math.abs(wx) * 3.7;
  assert.ok(cloudDrift(tw).x >= 0 && cloudDrift(tw).x < tile);
  const p = at(tw, 20, 30), q = at(tw, 20 + tile, 30 - tile), r = at(tw, 20, 30);
  assert.ok(Math.abs(p - q) < 1e-6, 'periodic tile'); assert.equal(p, r, 'deterministic');
});

test('walls and roofs share the ground\'s clouds along the sun ray', () => {
  set(NOON, 0.45, 42); const s = cloudShadowState({ sunDir: NOON, oc: 0.45 });
  for (const [x, y, z] of [[10, 6, 20], [-40, 12, 75], [80, 3, -30]]) {
    // the ground point where the sun ray through (x, y, z) lands lies under the same cloud
    assert.ok(Math.abs(cloudShadowAt(x, y, z) - cloudShadowAt(x - s.slope.x * y, 0, z - s.slope.z * y)) < 1e-6);
  }
});
