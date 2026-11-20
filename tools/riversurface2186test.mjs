import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { RIVER_SURFACE as C, RAIN_RIPPLES, COLORS } from '../src/config.js';
import { riverFlowSpeed, riverFlowDirection, riverFlowSlope, riverSkyWeight, riverBankMix, addRiverFlow, riverSurface } from '../src/riversurface.js';
import { riverAt, riverPath } from '../src/riverbridge.js';

test('flow speed: the shared clock wraps on whole wave-lengths of every wave, so the drift never jumps', () => {
  const S = riverFlowSpeed(); assert(S > 0.2 && S < 0.8);
  for (const [a, , c] of C.flow.waves) { assert(Number.isInteger(a) && Number.isInteger(c)); }
  for (const [u, v] of [[0, 0], [13.7, 1.1], [211.3, -2.6]]) {
    const a = riverFlowSlope(u, v, 0), b = riverFlowSlope(u, v, RAIN_RIPPLES.wrap);
    assert(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
  }
});

test('ripples travel downstream: the pattern at t is the pattern at 0 shifted by speed*t along the flow', () => {
  const S = riverFlowSpeed(), t = 3.7;
  for (const [u, v] of [[5, 0.4], [40.2, -1.3]]) {
    const a = riverFlowSlope(u, v, t), b = riverFlowSlope(u - S * t, v, 0);
    assert(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
  }
  assert.notDeepEqual(riverFlowSlope(5, 0.4, 0), riverFlowSlope(5, 0.4, 2)); // it really moves
});

test('flow slope is bounded by the summed gains and fades with distance/footprint', () => {
  const bound = C.flow.waves.reduce((s, w) => s + w[5], 0); let max = 0;
  for (let u = 0; u < 60; u += 0.37) for (let v = -3; v < 3; v += 0.31) { const s = riverFlowSlope(u, v, 1.3); max = Math.max(max, Math.hypot(...s)); assert(Math.hypot(...s) <= bound + 1e-12); }
  assert(max > bound * 0.6);
  assert.deepEqual(riverFlowSlope(3, 1, 1, 100), [0, 0]); assert.deepEqual(riverFlowSlope(3, 1, 1, 0, 1), [0, 0]);
});

test('flow direction follows the river path towards increasing index (downstream, where SITE.river.fall drops)', () => {
  for (let i = 1; i < riverPath.length; i += 3) {
    const [x0, z0] = riverPath[i - 1], [x1, z1] = riverPath[i], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, r = riverAt(mx, mz);
    const d = riverFlowDirection(r.nz, -r.nx), e = riverFlowDirection(x1 - x0, z1 - z0);
    if (r.segment === i) assert(d[0] * e[0] + d[1] * e[1] > 0.999, 'segment ' + i);
  }
  const g = addRiverFlow(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array([300, 0, 40, 330, 0, 30, 300, 0, 36]), 3)), riverAt);
  const f = g.attributes.riverFlow, sh = g.attributes.riverShore;
  assert.equal(f.count, 3); assert(f.getX(0) < -0.9 && f.getY(0) > 0); // at x~300 the river runs west (and a little south)
  assert(f.getZ(0) > 0 && f.getZ(0) < 80); assert(sh.getX(2) < sh.getX(0)); // closer to the centre line = smaller shore fraction
  assert(Math.sign(f.getW(0)) !== 0 && Math.abs(f.getW(0)) > 0);
});

test('sky weight: Fresnel grows toward grazing, 0 cos is the maximum; bank mix is 0 mid-stream, max at the shore', () => {
  let last = Infinity; for (let c = 0; c <= 1.0001; c += 0.05) { const w = riverSkyWeight(c); assert(w <= last + 1e-12); last = w; }
  assert(riverSkyWeight(0) > riverSkyWeight(1) * 10 && riverSkyWeight(1) > 0);
  assert.equal(riverBankMix(0), 0); assert.equal(riverBankMix(C.bank.from), 0); assert.ok(Math.abs(riverBankMix(1) - C.bank.mix) < 1e-12); assert.equal(riverBankMix(3), C.bank.mix);
  let m = 0; for (let s = 0; s <= 1; s += 0.05) { assert(riverBankMix(s) >= m); m = riverBankMix(s); }
});

test('GLSL: flow material adds the river frame attributes + shared clock; far-water variant has the sky but no flow; underwater (back face) gets no reflection', () => {
  const build = (levels, opts) => {
    const m = new T.MeshStandardMaterial({ color: COLORS.water, side: T.DoubleSide, vertexColors: !!levels }); riverSurface(m, levels, opts);
    const s = { vertexShader: T.ShaderLib.standard.vertexShader, fragmentShader: T.ShaderLib.standard.fragmentShader, uniforms: {} }; m.onBeforeCompile(s, {}); return { m, s, key: m.customProgramCacheKey() };
  };
  const near = build(null, { flow: true }), far = build([10], {}), plain = build(null, {});
  assert(near.s.vertexShader.includes('attribute vec4 riverFlow') && near.s.fragmentShader.includes('uRiverTime') && 'uRiverTime' in near.s.uniforms);
  assert(near.s.fragmentShader.includes('faceDirection>0.0') && near.s.fragmentShader.includes('reflectedLight.indirectSpecular+=rSky'));
  assert(!far.s.vertexShader.includes('riverFlow') && !('uRiverTime' in far.s.uniforms) && 'uRiverHorizon' in far.s.uniforms);
  assert(near.s.uniforms.uRiverHorizon.value === plain.s.uniforms.uRiverHorizon.value); // DayCycle's own sky colour objects, no copies
  assert.equal(new Set([near.key, far.key, plain.key]).size, 3); assert.equal(near.m.userData.riverSurface.stationary, false);
  assert.equal(riverSurface(near.m, null, { flow: true }), near.m);
});
