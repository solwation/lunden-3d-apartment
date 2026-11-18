// #2096: the shared gravel map is deterministic, seamless, keeps the mean colour and leaves geometry/snow alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gravelData, gravelTextures, gravelMaterial, gravelColor, gravelUV } from '../src/gravelsurface.js';
import { linearMean } from '../src/grassdetail.js';
import { registerSnow, applySeason } from '../src/seasons.js';
import { GRAVEL_SURFACE as G } from '../src/config.js';
import { hasNativeVertexCompile } from '../src/vertexcompile.js';

const data = gravelData();
test('deterministic map with varied stones, mean normalised to GRAVEL_SURFACE.mean', () => {
  assert.deepEqual(gravelData(), data); assert.equal(data.width, G.size);
  for (const m of linearMean(data.color)) assert.ok(Math.abs(m - G.mean) < 0.002, `linear mean ${m}`);
  const lum = []; for (let i = 0; i < data.color.length; i += 4) lum.push(data.color[i + 1]);
  lum.sort((a, b) => a - b); const p = (q) => lum[Math.floor(q * (lum.length - 1))];
  assert.ok(p(0.95) - p(0.05) > 25, `visible stone brightness spread ${p(0.05)}…${p(0.95)}`);
  assert.ok(p(0.99) < 255 && p(0.01) > 40, 'no clipping to white or black');
  const rough = new Set(); for (let i = 1; i < data.surface.length; i += 4) rough.add(data.surface[i]);
  assert.ok(Math.min(...rough) >= Math.round(G.roughness[0] * 255) - 1 && Math.max(...rough) <= Math.round(G.roughness[1] * 255) + 1 && rough.size > 10, 'roughness varies within its range');
});
test('seamless: the wrap seam is no stronger than an ordinary row/column step', () => {
  const n = data.width, c = data.color, step = (a, b) => { let s = 0; for (let k = 0; k < n; k++) s += Math.abs(c[a(k) * 4 + 1] - c[b(k) * 4 + 1]); return s / n; };
  const inner = []; for (const r of [64, 200, 333]) inner.push(step((k) => r * n + k, (k) => (r + 1) * n + k), step((k) => k * n + r, (k) => k * n + r + 1));
  const avg = inner.reduce((a, b) => a + b) / inner.length;
  assert.ok(step((k) => (n - 1) * n + k, (k) => k) < avg * 1.5, 'rows wrap'); assert.ok(step((k) => k * n + n - 1, (k) => k * n) < avg * 1.5, 'columns wrap');
});
test('material: colour divided by the map mean, shared textures, metre UVs, snow restores the old look', () => {
  const t = gravelTextures(); assert.equal(t, gravelTextures()); assert.equal(t.color.repeat.x, 1 / G.tile);
  assert.equal(t.color.colorSpace, THREE.SRGBColorSpace); assert.equal(t.surface.colorSpace, THREE.NoColorSpace); assert.equal(t.color.minFilter, THREE.LinearMipmapLinearFilter);
  const base = new THREE.Color(0xb5ac90), c = gravelColor(0xb5ac90);
  for (const k of ['r', 'g', 'b']) assert.ok(Math.abs(c[k] * G.mean - base[k]) < 1e-6, 'mean colour preserved');
  const a = gravelMaterial(0xcfc6b2, { vertexColors: true }), b = gravelMaterial(0xb5ac90);
  assert.equal(a.map, b.map); assert.equal(a.bumpMap, t.surface); assert.ok(a.vertexColors && !b.vertexColors); assert.ok(hasNativeVertexCompile(a));
  registerSnow(a, 0xeef3f7);
  for (const month of [6, 1, 7]) { applySeason(month); const w = month === 1;
    assert.equal(a.map, w ? null : t.color); assert.equal(a.bumpMap, w ? null : t.surface); assert.equal(a.roughnessMap, w ? null : t.surface); assert.equal(a.roughness, 1);
    assert.equal(a.color.getHex(), w ? 0xeef3f7 : gravelColor(0xcfc6b2).getHex()); }
  const sh = { fragmentShader: '#include <map_fragment>\n#include <color_fragment>' }; a.onBeforeCompile(sh);
  assert.match(sh.fragmentShader, /#ifdef USE_MAP\n#include <color_fragment>\n#endif/, 'vertex tints only with the map (plain snow in winter)');
  assert.match(sh.fragmentShader, /gravelTone/);
  const g = new THREE.PlaneGeometry(2, 3).rotateX(-Math.PI / 2).translate(-35, 0.03, 24), before = g.attributes.position.array.slice();
  gravelUV(g); assert.deepEqual(g.attributes.position.array, before);
  for (let i = 0; i < g.attributes.position.count; i++) { assert.equal(g.attributes.uv.getX(i), g.attributes.position.getX(i)); assert.equal(g.attributes.uv.getY(i), g.attributes.position.getZ(i)); }
});
