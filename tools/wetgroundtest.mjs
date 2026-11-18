// #2099: the wet ground follows the weather on the game clock and dries gradually; dry leaves the shaders' output alone.
// node --test tools/wetgroundtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { wetStep, wetting, GroundWetness, wetGround, wetUniforms, wetGLSL, gameHours } from '../src/wetground.js';
import { WET_GROUND as W } from '../src/config.js';
import { hasNativeVertexCompile, rememberFragmentCompile } from '../src/vertexcompile.js';

test('rain soaks, then fills puddles; drying is gradual, faster in sun and warmth; snow does not wet', () => {
  let s = { wet: 0, pool: 0 };
  s = wetStep(s, { falling: 1 }, W.wetUp / 2);
  assert.ok(Math.abs(s.wet - 0.5) < 1e-9 && s.pool === 0, 'half soaked, no puddles yet');
  s = wetStep(s, { falling: 1 }, W.wetUp / 2 + W.poolUp);
  assert.equal(s.wet, 1); assert.ok(s.pool > 0.6, `puddles fill once soaked (${s.pool})`);
  assert.deepEqual(wetStep(s, { falling: 0 }, 0), s, 'no time, no change');
  let prev = s, dried = 0;
  for (let h = 0; h < 12; h += 0.25) {
    const n = wetStep(prev, { falling: 0, daylight: 0.5, overcast: 0.6, temp: 12 }, 0.25);
    assert.ok(n.wet <= prev.wet && n.pool <= prev.pool, 'never wetter without rain');
    assert.ok(prev.wet - n.wet <= (1 + W.sun * 0.5 * 0.4 + W.warm * 12) * 0.25 / W.dry + 1e-9 && prev.wet - n.wet < 0.25, 'gradual: a quarter hour never dries it in one go');
    prev = n; if (!dried && n.wet === 0 && n.pool === 0) dried = h + 0.25;
  }
  assert.ok(dried > 2 && dried < 10, `dry again after ${dried} h`);
  const sun = wetStep({ wet: 1, pool: 0 }, { daylight: 1, overcast: 0, temp: 20 }, 0.5), dull = wetStep({ wet: 1, pool: 0 }, { daylight: 0, overcast: 1, temp: 5 }, 0.5);
  assert.ok(sun.wet < dull.wet, 'sun and warmth dry faster');
  assert.equal(wetting(0.9, 'snow'), 0); assert.equal(wetting(0.7, 'hail'), 0.7); assert.equal(wetting(0.5, null), 0);
});

/** A Weather stand-in: `fall(t)` = what falls at absolute game hour t, plus the live fields Weather.update sets. */
const mock = (fall, force = null) => ({ force, rain: 0, kind: null, overcast: 0, temp: 12,
  fallAt(y, m, d, h) { const t = gameHours({ year: y, month: m, date: d, hour: h }); const r = fall(t); return { rain: r, kind: r > 0 ? 'rain' : null }; } });

test('GroundWetness: spin-up from history, live drying after a shower, snow months and puddle switch', () => {
  const day = { year: 2026, month: 5, date: 12, hour: 14, daylight: 1 }, now = gameHours(day);
  assert.equal(Math.round(gameHours({ ...day, hour: 0 }) + 14 - now), 0);
  // a shower 10:00–12:00, now 14:00: still damp with puddles, from the history alone
  const shower = (t) => (t >= now - 4 && t < now - 2 ? 0.8 : 0);
  const g = new GroundWetness(mock(shower), day);
  const u = g.update();
  assert.ok(g.wet > 0.2 && g.wet < 1 && g.pool > 0, `after the shower: wet ${g.wet}, pool ${g.pool}`);
  assert.equal(u, wetUniforms.uGroundWet.value); assert.equal(u.x, g.wet); assert.equal(u.y, g.pool);
  // the clock runs on: it dries step by step, never jumps back up
  let last = g.wet;
  for (let i = 0; i < 40; i++) { day.hour += 0.1; g.update(); assert.ok(g.wet <= last); last = g.wet; }
  assert.ok(last < 0.2, `mostly dry 4 h later (${last})`);
  // live rain wets it again
  g.weather.rain = 1; g.weather.kind = 'rain';
  for (let i = 0; i < 10; i++) { day.hour += 0.05; g.update(); }
  assert.equal(g.wet, 1);
  g.puddles = false; g.weather.rain = 1; day.hour += 1; g.update(); assert.ok(g.pool > 0 && wetUniforms.uGroundWet.value.y === 0, 'puddles off: uniform 0');
  day.month = 1; g.update(); assert.deepEqual(wetUniforms.uGroundWet.value.toArray(), [0, 0, 0], 'snow months: dry (the ground is snow)');
  // never rained in the last hours: dry, uniform exactly 0
  const dry = new GroundWetness(mock(() => 0), { year: 2026, month: 6, date: 3, hour: 9, daylight: 0.5 });
  dry.update(); assert.deepEqual(wetUniforms.uGroundWet.value.toArray(), [0, 0, 0]);
  // a date jump re-integrates instead of stepping through days
  const f = new GroundWetness(mock(() => 1), { year: 2026, month: 4, date: 2, hour: 9, daylight: 0.5 }); f.update();
  assert.equal(f.wet, 1); f.weather.fallAt = () => ({ rain: 0, kind: null }); f.day.date = 20; f.update(); assert.equal(f.wet, 0);
});

const physical = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader });
test('wetGround: chains the existing callback, unique keys per kind, fragment only, every change behind the wet guard', () => {
  const m = new THREE.MeshStandardMaterial({ color: 0x888888 }), calls = [];
  m.onBeforeCompile = (s) => { calls.push('own'); s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n// own'); };
  rememberFragmentCompile(m.onBeforeCompile); m.customProgramCacheKey = () => 'own-key';
  wetGround(m, 'asphalt'); wetGround(m, 'asphalt');
  const s = physical(); m.onBeforeCompile(s, null);
  assert.deepEqual(calls, ['own'], 'the existing patch runs once, first');
  assert.ok(s.fragmentShader.includes('// own'));
  for (const k of ['uGroundWet', 'uWetHorizon', 'uWetZenith']) assert.equal(s.uniforms[k], wetUniforms[k]);
  assert.equal((s.fragmentShader.match(/uniform vec3 uGroundWet/g) || []).length, 1);
  for (const a of ['roughnessmap_fragment', 'normal_fragment_maps', 'lights_fragment_end']) assert.ok(new RegExp(`#include <${a}>\\n[^]*?wet`).test(s.fragmentShader), a);
  assert.equal(s.vertexShader, THREE.ShaderLib.physical.vertexShader); assert.ok(hasNativeVertexCompile(m));
  assert.match(m.customProgramCacheKey(), /^own-key\|wet2099-asphalt(\||$)/); // (#2105: the leaf litter may follow it)
  const plain = wetGround(new THREE.MeshStandardMaterial(), 'gravel'), paint = wetGround(new THREE.MeshStandardMaterial(), 'paint');
  assert.notEqual(plain.customProgramCacheKey(), paint.customProgramCacheKey());
  // a later wrapper (lampwash.js style) keeps it once
  const inner = plain.onBeforeCompile; plain.onBeforeCompile = function (sh, r) { inner.call(this, sh, r); };
  const s2 = physical(); plain.onBeforeCompile(s2, null); inner.call(plain, s2, null);
  assert.equal((s2.fragmentShader.match(/float wetW/g) || []).length, 1, 'never a second copy');
  // dry exactness: everything that changes colour, roughness, normal or light sits behind uGroundWet.x > 0 / wetW > 0 / wetP > 0
  for (const kind of Object.keys(W.kinds)) {
    const g = wetGLSL(kind);
    assert.match(g.surface, /^\s*float wetW = 0\.0, wetP = 0\.0;\s*if \(uGroundWet\.x > 0\.0\) \{[^]*\}\s*$/);
    assert.ok(g.sky.trim().startsWith('if (wetW > 0.0)'));
    assert.ok(!g.flatten || g.flatten.trim().startsWith('if (wetP > 0.0)'));
    assert.equal(g.surface.includes('wetNoise'), W.kinds[kind].puddles > 0, 'puddle noise only where puddles form');
  }
  assert.ok(!new THREE.MeshLambertMaterial().userData.wetGround && wetGround(new THREE.MeshLambertMaterial()).userData.wetGround === undefined, 'only MeshStandard');
});
