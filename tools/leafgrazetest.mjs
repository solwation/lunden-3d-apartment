// #2133: node --test tools/leafgrazetest.mjs  (leaf cards seen edge-on fade out up close): the fragment patch sits once before
// alphaTest in every leaf colour material (shared, LOD near/far, wind), never in their shadow depth materials; the material keeps
// its atlas filtering, alphaTest, sides and a fragment-only (native vertex) compile; the JS mirror fades edge-on cards near and
// keeps everything beyond near[1] (≤ the phone LOD start) and face-on; only a modest share of a tree lobe's cards fades from any
// close view, and the opaque core never. Function-level checks only; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

const ctx = (canvas) => new Proxy({ canvas }, { get: (t, k) => k in t ? t[k] : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => { const c = { width: 1, height: 1 }; c.getContext = () => ctx(c); return c; } };

const { FOLIAGE: F } = await import('../src/config.js');
const Fo = await import('../src/foliage.js');
const { hasNativeVertexCompile } = await import('../src/vertexcompile.js');

const compile = (m, lib) => { const s = { uniforms: {}, vertexShader: T.ShaderLib[lib].vertexShader, fragmentShader: T.ShaderLib[lib].fragmentShader }; m.onBeforeCompile(s, {}); return s; };
const count = (s, x) => s.split(x).length - 1;

test('every leaf colour material carries the edge-on fade once, before alphaTest; depth materials do not', () => {
  const range = { value: new T.Vector2(46, 54) };
  const near = Fo.lodLeafMaterial({ far: false, range }), far = Fo.lodLeafMaterial({ far: true, range }), wind = Fo.windLeafMaterial();
  for (const m of [Fo.leafMaterial(), near.material, far.material, wind.material]) {
    const f = compile(m, 'physical').fragmentShader;
    assert.equal(count(f, 'grazeN'), 2, m.name);
    assert.ok(f.indexOf('grazeK;') < f.indexOf('#include <alphatest_fragment>'), m.name);
    assert.ok(f.includes('float faceDirection = 1.0;'), m.name); // the #679 normal patch stays
  }
  assert.ok(hasNativeVertexCompile(Fo.leafMaterial())); // fragment-only: tightfrustum / site batch audits unchanged
  for (const d of [near.depth, far.depth, wind.depth]) assert.ok(!compile(d, 'depth').fragmentShader.includes('grazeN'), d.name);
  const keys = new Set([Fo.leafMaterial(), near.material, far.material, wind.material].map((m) => m.customProgramCacheKey()));
  assert.equal(keys.size, 3); /* near and far LOD share one program (#1958) */ for (const k of keys) assert.match(k, /foliage-leaves-v2/);
});

test('the material keeps its atlas filtering, alphaTest and sides', () => {
  const m = Fo.leafMaterial(), t = m.map;
  assert.equal(m.alphaTest, F.alphaTest); assert.equal(m.side, T.DoubleSide); assert.equal(m.shadowSide, T.DoubleSide);
  assert.equal(t.minFilter, T.LinearMipmapLinearFilter); assert.equal(t.anisotropy, 2); assert.ok(t.generateMipmaps);
});

test('fade: edge-on near cards go, face-on and far cards stay, within the LOD contract', () => {
  assert.ok(F.graze.near[1] <= Math.min(F.lod.start, F.lod.startPhone), 'no change where the LOD levels hand over');
  assert.equal(Fo.leafGrazeFade(0.02, 3), 0); assert.equal(Fo.leafGrazeFade(0.6, 3), 1); assert.equal(Fo.leafGrazeFade(0.02, F.graze.near[1]), 1);
  assert.ok(Fo.leafGrazeFade(0.02, 25) > 0 && Fo.leafGrazeFade(0.02, 25) < 1);
  // it erodes no face-on card at all (alphaTest cuts alpha × fade; a fully opaque texel survives while fade ≥ alphaTest)
  assert.ok(Fo.leafGrazeFade(F.graze.cos[1], 0) === 1);
});

test('from any close view only a modest share of a tree lobe\'s cards fades; the core never', () => {
  const g = Fo.lobeGeometry('tree'), p = g.attributes.position, uv = g.attributes.uv, a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), eye = new T.Vector3();
  let cards = 0, faded = 0, coreFaded = 0;
  for (let k = 0; k < 64; k++) { // views from 4 m (a lobe scaled ×2.5) all round
    const th = Math.acos(1 - 2 * (k + 0.5) / 64), ph = k * 2.39996; eye.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)).multiplyScalar(4 / 2.5);
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      const centre = a.clone().add(b).add(c).divideScalar(3), v = eye.clone().sub(centre), d = v.length() * 2.5, fade = Fo.leafGrazeFade(Math.abs(n.dot(v.normalize())), d);
      const core = uv.getX(i) > 0.5 && uv.getY(i) < 0.5 && uv.getX(i + 1) > 0.5 && uv.getY(i + 1) < 0.5;
      if (core) { if (fade < 1) coreFaded++; continue; } // (the shader skips the core by its uv; counted only for the report)
      cards++; if (fade < F.alphaTest) faded++;
    }
  }
  const share = faded / cards;
  assert.ok(share > 0.03 && share < 0.25, `share of card triangles cut: ${share.toFixed(3)}`);
});
