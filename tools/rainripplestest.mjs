// #2119: drop rings in the puddles and a faint splash glitter on the wet film, only while it rains, only on desktop.
// node --test tools/rainripplestest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rippleStep, rippleGLSL, wetGLSL, wetGround, wetUniforms, GroundWetness, gameHours } from '../src/wetground.js';
import { WET_GROUND as W, RAIN_RIPPLES as R } from '../src/config.js';

test('rippleStep: rain only, eased in and out, exactly 0 after the shower, at once when there is nothing to ring', () => {
  let z = 0;
  for (let i = 0; i < 120; i++) z = rippleStep(z, 0.8, 'rain', true, 0.25);
  assert.equal(z, 0.8, 'settles on the rain strength');
  assert.ok(rippleStep(0, 0.8, 'rain', true, 0.1) < 0.1, 'eases in');
  const half = rippleStep(0.8, 0, null, true, R.fade);
  assert.ok(half > 0.2 && half < 0.4, `eases out (${half})`);
  for (let i = 0; i < 80; i++) z = rippleStep(z, 0, null, true, 0.25);
  assert.equal(z, 0, 'after the rain: exactly 0');
  assert.equal(rippleStep(0, 1, 'hail', true, 10), 0, 'hail does not ring');
  assert.equal(rippleStep(0, 1, 'snow', true, 10), 0, 'snow does not ring');
  assert.equal(rippleStep(0.7, 1, 'rain', false, 0), 0, 'puddles off / snow month / dry ground: 0 at once');
  assert.equal(rippleStep(0.5, 1, 'rain', true, 0), 0.5, 'no time, no change');
});

const mock = (fall) => ({ rain: 0, kind: null, overcast: 1, temp: 10,
  fallAt(y, m, d, h) { const r = fall(gameHours({ year: y, month: m, date: d, hour: h })); return { rain: r, kind: r > 0 ? 'rain' : null }; } });

test('GroundWetness writes the rain to uGroundWet.z only while it rains on wet ground, and runs the clock on real dt', () => {
  const day = { year: 2026, month: 9, date: 25, hour: 10, daylight: 0.5 };
  const g = new GroundWetness(mock(() => 0), day);
  g.update(0.1); assert.deepEqual(wetUniforms.uGroundWet.value.toArray(), [0, 0, 0], 'dry: nothing');
  g.weather.rain = 0.9; g.weather.kind = 'rain';
  const t0 = wetUniforms.uWetTime.value;
  for (let i = 0; i < 300; i++) { day.hour += 0.1 / 3600 * 60; g.update(0.1); } // 30 s at a 60× clock
  const u = wetUniforms.uGroundWet.value;
  assert.ok(u.x > 0 && u.z > 0.85, `raining: rings on (${u.toArray()})`);
  assert.ok(Math.abs(wetUniforms.uWetTime.value - ((t0 + 30) % R.wrap)) < 1e-6, 'the clock follows real seconds');
  g.weather.rain = 0; g.weather.kind = null;
  for (let i = 0; i < 300; i++) g.update(0.1);
  assert.ok(u.y > 0 && u.z === 0, `after the rain the puddles stay, the rings stop (${u.toArray()})`);
  g.weather.rain = 1; g.weather.kind = 'rain'; g.update(1); assert.ok(u.z > 0);
  g.puddles = false; g.update(0.1); assert.equal(u.z, 0, 'puddles off (quality 0, phones): no rings');
  g.puddles = true; g.update(1); day.month = 1; g.update(0.1); assert.deepEqual(u.toArray(), [0, 0, 0], 'snow months: nothing');
});

const run = (m) => { const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }; m.onBeforeCompile(sh, null); return sh; };
const RIP = /wetRings|wetSplash|wetRipHash|uWetTime|uGroundWet\.z/;

test('GLSL: rings only in puddles, splashes only on the film, all behind the rain guard; never in -lite; unique keys', () => {
  const keys = new Set();
  for (const kind of Object.keys(W.kinds)) {
    const full = wetGLSL(kind), lite = wetGLSL(kind, W, true), puddles = W.kinds[kind].puddles > 0;
    for (const part of Object.values(lite)) assert.doesNotMatch(part, RIP, `${kind}: no ring code on phones`);
    assert.equal(RIP.test(full.head + full.flatten), puddles, `${kind}: rings exactly where puddles compile`);
    assert.doesNotMatch(full.surface + full.sky, RIP, 'the #2099 film/puddle/sky steps are unchanged');
    if (puddles) {
      const body = full.flatten.split('if (wetP > 0.0) normal = normalize(mix(normal, nonPerturbedNormal, wetP));')[1];
      assert.match(body, /^\s*if \(uGroundWet\.z > 0\.0 && wetW > 0\.0\) \{[^]*\}\s*$/, 'everything behind the rain guard');
      assert.match(body, /if \(wetP > 0\.0 && ripD < [\d.]+\) ripS \+= \(wetRings[^;]*\* wetP \*/, 'rings weighted by the puddle mask');
      assert.equal(/\(1\.0 - wetP\)/.test(body), (R.kinds[kind] ?? 0) > 0, 'splashes off the puddles, where the kind has them');
    }
    for (const lt of [false, true]) {
      const m = wetGround(new THREE.MeshStandardMaterial(), kind, lt), sh = run(m);
      assert.equal(/wetRings\(/.test(sh.fragmentShader), puddles && !lt);
      if (puddles && !lt) { assert.equal(sh.uniforms.uWetTime, wetUniforms.uWetTime); assert.equal((sh.fragmentShader.match(/uniform float uWetTime/g) || []).length, 1); }
      keys.add(m.customProgramCacheKey());
    }
  }
  assert.equal(keys.size, Object.keys(W.kinds).length * 2, 'desktop and -lite keys unique per kind');
  assert.doesNotMatch(rippleGLSL(R, 0).body, /wetSplash\(/, 'splash share 0: no splash code');
});

// A JS twin of wetRings' profile (same formula as the GLSL) for the shape: deterministic, inside its cell, bounded, gone at the ends.
const ring = (r, a, G = R.rings) => { const x = (r - a * G.radius) / (G.width * (1 + a)), env = (1 - a) ** 2 * Math.min(1, Math.max(0, a / 0.06)) ** 2 * (3 - 2 * Math.min(1, a / 0.06));
  return Math.exp(-x * x) * (2.4 * Math.cos(2.4 * x) - 2 * x * Math.sin(2.4 * x)) / 2.4 * env; };
test('ring shape: a front that grows to `radius` inside the cell, bounded slope, flat before and after the drop', () => {
  const G = R.rings;
  assert.ok(G.radius + 2 * G.width < G.cell / 2, 'the ring and its tail stay inside a cell (one cell per lookup)');
  assert.ok(G.drops[0] > 0 && G.drops[1] <= 1 && G.drops[0] < G.drops[1]);
  let max = 0;
  for (let a = 0; a <= 1; a += 0.01) for (let r = 0; r <= G.cell / 2; r += 0.001) max = Math.max(max, Math.abs(ring(r, a)));
  assert.ok(max <= 1 && max > 0.3, `slope bounded by tilt (${max})`);
  assert.equal(ring(0.05, 0), 0); assert.ok(Math.abs(ring(G.radius, 0.999)) < 1e-5, 'fades out as it grows');
  assert.ok(Math.abs(ring(G.radius * 0.5 + 6 * G.width, 0.5)) < 1e-6, 'nothing far from the front');
  assert.equal(ring(0.07, 0.4), ring(0.07, 0.4), 'deterministic');
});
