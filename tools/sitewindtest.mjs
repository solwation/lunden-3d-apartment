// #2101: node --test tools/sitewindtest.mjs  (the site wind sway: weather power, deterministic offset, colour/depth parity,
// LOD contracts, bounded-vertex audit and zero sway at zero wind; no browser). Function-level checks only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

// a minimal 2D canvas so foliage.js can paint its leaf atlas in Node (every draw is a no-op; pixels read back empty)
const ctx = (canvas) => new Proxy({ canvas }, { get: (t, k) => k in t ? t[k] : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => { const c = { width: 1, height: 1 }; c.getContext = () => ctx(c); return c; } };

const { SITE_WIND: W, FOLIAGE } = await import('../src/config.js');
const SW = await import('../src/sitewind.js');
const { lodLeafMaterial, windLeafMaterial, leafMaterial, lobeGeometry } = await import('../src/foliage.js');
const { lodRange, InstanceLod, patchDitherLod } = await import('../src/lod.js');
const { vertexCompileSlack, hasNativeVertexCompile, rememberFragmentCompile } = await import('../src/vertexcompile.js');

const compile = (m, lib) => { const s = { uniforms: {}, vertexShader: T.ShaderLib[lib].vertexShader, fragmentShader: T.ShaderLib[lib].fragmentShader }; m.onBeforeCompile(s, {}); return s; };
const block = (src) => { const i = src.indexOf('#include <begin_vertex>'), j = src.indexOf('#include', i + 10); return src.slice(i, j); };
const swayBlock = (src) => { const i = src.indexOf('{\n  #ifdef USE_INSTANCING\n  mat4 swM'); return i < 0 ? '' : src.slice(i, src.indexOf('inverse(swL) * swO;', i)); };

test('weather power: calm clear breeze < overcast < rain < storm, within 0…1', () => {
  const clear = SW.siteWindPower({}), grey = SW.siteWindPower({ overcast: 1 }), rain = SW.siteWindPower({ overcast: 1, rain: 0.8 }), storm = SW.siteWindPower({ overcast: 1, rain: 1, storm: true });
  assert.ok(clear > 0 && clear < grey && grey < rain && rain < storm && storm <= 1, `${clear} ${grey} ${rain} ${storm}`);
});

test('offset: deterministic, zero at zero power, clamped, calm barely visible and storm clear on a tree crown', () => {
  const dir = new T.Vector2(W.dir[0], W.dir[1]).normalize(), anchor = { x: 37.2, z: -12.4 };
  const lw = SW.lobeWeights({ x: 0.2, y: 0.9, z: 0.1 }, 2.6); // the top of an ordinary site tree's lobe
  const peak = (power) => { let m = 0; for (let t = 0; t < 60; t += 0.05) { const o = SW.siteWindOffset({ time: t, power, dir }, anchor, lw.weight, lw.flutter, lw.seed); m = Math.max(m, Math.hypot(o.x, o.z)); } return m; };
  const a = SW.siteWindOffset({ time: 12.5, power: 0.7, dir }, anchor, lw.weight, lw.flutter, lw.seed), b = SW.siteWindOffset({ time: 12.5, power: 0.7, dir }, anchor, lw.weight, lw.flutter, lw.seed);
  assert.deepEqual(a, b);
  assert.deepEqual(SW.siteWindOffset({ time: 12.5, power: 0, dir }, anchor, lw.weight, lw.flutter, lw.seed), { x: 0, z: 0 });
  const calm = peak(SW.siteWindPower({})), storm = peak(SW.siteWindPower({ overcast: 1, rain: 1, storm: true }));
  assert.ok(calm > 0.005 && calm < 0.06, `calm peak ${calm} m`); assert.ok(storm > 0.15 && storm <= W.maxDisplacement + 1e-9, `storm peak ${storm} m`);
  assert.ok(peak(1) <= W.maxDisplacement + 1e-9);
  // the lobe's foot moves less than its top, a shrub less than a tree, the opaque core does not flutter
  assert.ok(SW.lobeWeights({ x: 0, y: -1, z: 0 }, 2.6).weight < lw.weight && SW.lobeWeights({ x: 0, y: 0.9, z: 0 }, 0.5).weight < lw.weight);
  assert.equal(SW.lobeWeights({ x: 0.3, y: 0, z: 0 }, 2.6).flutter, 0);
  // downwind on average (the steady lean)
  let mean = 0; for (let t = 0; t < 200; t += 0.1) { const o = SW.siteWindOffset({ time: t, power: 0.5, dir }, anchor, lw.weight); mean += o.x * dir.x + o.z * dir.y; }
  assert.ok(mean > 0);
});

test('colour and shadow depth get the same sway GLSL and the same uniform objects (both LOD levels, the courtyard pair)', () => {
  const range = lodRange(40, 50);
  const pairs = [lodLeafMaterial({ far: false, range }), lodLeafMaterial({ far: true, range }), windLeafMaterial()];
  let ref = null;
  for (const { material, depth } of pairs) {
    const c = compile(material, 'standard'), d = compile(depth, 'depth');
    const bc = swayBlock(c.vertexShader), bd = swayBlock(d.vertexShader);
    assert.ok(bc.length > 100 && bc === bd, 'identical sway block in colour and depth');
    ref ??= bc; assert.equal(bc, ref);
    for (const u of ['uSiteWindTime', 'uSiteWindPower', 'uSiteWindDir']) { assert.equal(c.uniforms[u], SW.siteWindUniforms[u]); assert.equal(d.uniforms[u], SW.siteWindUniforms[u]); }
    assert.ok(/siteWindWorld/.test(c.vertexShader.split('void main')[0]) && /siteWindWorld/.test(d.vertexShader.split('void main')[0]));
    assert.equal(material.defines.SITE_WIND_FLUTTER, ''); assert.equal(depth.defines.SITE_WIND_FLUTTER, '');
    assert.equal(depth.map, material.map); assert.equal(depth.alphaTest, material.alphaTest); assert.equal(depth.side, T.DoubleSide);
  }
  // the LOD dither still works on the swaying LOD materials (fragment discard + per-instance fade), and the plain shared leaf stays still
  const near = compile(pairs[0].material, 'standard');
  assert.match(near.vertexShader, /vLodFade/); assert.match(near.fragmentShader, /lodBayer/);
  assert.doesNotMatch(compile(leafMaterial(), 'standard').vertexShader, /siteWindWorld/);
  // zero wind: the shader's own early exit
  assert.match(SW.siteWindUniforms && near.vertexShader, /if \(uSiteWindPower <= 0\.0\) return vec3\(0\.0\);/);
});

test('program keys stay unique and the bend mode carries its attribute', () => {
  const range = lodRange(40, 50), n = lodLeafMaterial({ far: false, range }), f = lodLeafMaterial({ far: true, range }), w = windLeafMaterial();
  const keys = [leafMaterial(), n.material, w.material].map((m) => m.customProgramCacheKey());
  assert.equal(new Set(keys).size, 3, keys.join(' / '));
  assert.ok(keys.slice(1).every((k) => k.includes('site-wind-lobe')));
  assert.equal(n.material.customProgramCacheKey(), f.material.customProgramCacheKey()); // one program for both levels (the level is a uniform)
  const bend = SW.patchSiteWind(new T.MeshStandardMaterial(), 'bend'), s = compile(bend, 'standard');
  assert.match(s.vertexShader, /attribute float siteWindBend;/); assert.equal(bend.defines.SITE_WIND_BEND, '');
  assert.match(bend.customProgramCacheKey(), /site-wind-bend/);
  assert.equal(SW.patchSiteWind(bend, 'bend'), bend); assert.equal(compile(bend, 'standard').vertexShader.split('siteWindWorld(vec3').length, 2); // idempotent
});

test('bounded-vertex audit: native 0, dither-only 0, sway = maxDisplacement through fragment wrappers, unknown Infinity', () => {
  const range = lodRange(40, 50);
  assert.equal(vertexCompileSlack(new T.MeshStandardMaterial()), 0);
  const dither = patchDitherLod(new T.MeshStandardMaterial(), { range });
  assert.equal(vertexCompileSlack(dither), 0); assert.ok(hasNativeVertexCompile(dither));
  const sway = lodLeafMaterial({ far: false, range }).material;
  assert.equal(vertexCompileSlack(sway), W.maxDisplacement); assert.equal(hasNativeVertexCompile(sway), false);
  // a later fragment-only wrapper (the lamp wash pattern) keeps the bound
  const before = sway.onBeforeCompile; sway.onBeforeCompile = function (s, r) { before.call(this, s, r); }; rememberFragmentCompile(sway.onBeforeCompile, before);
  assert.equal(vertexCompileSlack(sway), W.maxDisplacement);
  const odd = new T.MeshStandardMaterial(); odd.onBeforeCompile = () => {};
  assert.equal(vertexCompileSlack(odd), Infinity);
});

test('LOD contract: both levels sway alike, far copies carry the near anchors, culling spheres widen by the sway', () => {
  const range = lodRange(10, 20), n = lodLeafMaterial({ far: false, range }), f = lodLeafMaterial({ far: true, range });
  const near = new T.InstancedMesh(lobeGeometry('tree'), n.material, 3), far = new T.InstancedMesh(lobeGeometry('far'), f.material, 3);
  near.customDepthMaterial = n.depth; far.customDepthMaterial = f.depth;
  const m = new T.Matrix4();
  [[0, 5, 0], [15, 5, 0], [40, 5, 3]].forEach(([x, y, z], i) => near.setMatrixAt(i, m.compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(2.4, 2.6, 2.4))));
  near.computeBoundingSphere(); const r0 = near.boundingSphere.radius; SW.siteWindBounds(near);
  assert.ok(Math.abs(near.boundingSphere.radius - r0 - W.maxDisplacement) < 1e-9);
  const lod = new InstanceLod([{ mesh: near }], far, { start: 10, end: 20, margin: 1, step: 1, range });
  lod.update(new T.Vector3(0, 0, 0), true);
  assert.ok(far.count >= 1 && far.boundingSphere.radius >= near.boundingSphere.radius - 1e-9);
  const dir = new T.Vector2(W.dir[0], W.dir[1]).normalize(), a = new T.Matrix4(), b = new T.Matrix4(), p = new T.Vector3();
  far.getMatrixAt(0, a); const id = [...Array(near.instanceMatrix.count).keys()].find((i) => { near.getMatrixAt(i, b); return b.equals(a); });
  assert.ok(id !== undefined, 'the far instance is a copy of a near one');
  p.setFromMatrixPosition(a); const lw = SW.lobeWeights({ x: 0, y: 1, z: 0 }, 2.6);
  const o1 = SW.siteWindOffset({ time: 3, power: 0.6, dir }, { x: p.x, z: p.z }, lw.weight), o2 = SW.siteWindOffset({ time: 3, power: 0.6, dir }, { x: p.x, z: p.z }, lw.weight);
  assert.deepEqual(o1, o2);
  for (const mat of [n.material, f.material, n.depth, f.depth]) assert.equal(mat.userData.siteWind, 'lobe');
});

test('SiteWind drives the uniforms from the weather, eases, and a forced 0 is exactly still', () => {
  const weather = { overcast: 0, rain: 0, storm: false };
  const w = new SW.SiteWind(weather);
  assert.equal(SW.siteWindUniforms.uSiteWindPower.value, SW.siteWindPower(weather));
  Object.assign(weather, { overcast: 1, rain: 1, storm: true }); w.update(1);
  const mid = SW.siteWindUniforms.uSiteWindPower.value;
  assert.ok(mid > SW.siteWindPower({}) && mid < SW.siteWindPower(weather));
  for (let i = 0; i < 200; i++) w.update(0.5);
  assert.ok(Math.abs(SW.siteWindUniforms.uSiteWindPower.value - SW.siteWindPower(weather)) < 1e-6);
  const still = new SW.SiteWind(weather, { force: 0 }); still.update(0.1);
  assert.equal(SW.siteWindUniforms.uSiteWindPower.value, 0); assert.equal(SW.siteWind.power, 0);
  w.update(NaN); assert.equal(SW.siteWind.power, 0); // a bad dt changes nothing
  const held = new SW.SiteWind(weather, { force: 0.8, time: 12 }); held.update(5);
  assert.equal(SW.siteWind.time, 12); assert.equal(SW.siteWindUniforms.uSiteWindPower.value, 0.8); assert.equal(SW.siteWindUniforms.uSiteWindTime.value, 12);
  SW.siteWind.hold = false; SW.siteWind.force = null;
});
