// #1967: the entrance plants' distance LOD (src/entranceplants.js with src/lod.js). node tools/entranceplantlodtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ENTRANCE_PLANTS as C } from '../src/config.js';
import { buildEntrancePlants } from '../src/entranceplants.js';
import { updateInstanceLods } from '../src/lod.js';

const doors = [0, 1, 2, 3].map((i) => ({ unit: `U${i}`, index: i, x0: -40 + i * 12, x1: -39.1 + i * 12, y: i > 1 ? 6.4 : 0, z: i > 1 ? 1.6 : 0 }));
const plants = buildEntrancePlants(doors, () => 0), { records, lod } = plants.userData, far = lod.far, L = C.lod;
const scene = new T.Scene(); scene.add(plants); scene.updateMatrixWorld(true);
const camera = new T.PerspectiveCamera(60, 1.6, 0.1, 500);
const look = (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); camera.updateMatrixWorld(true); updateInstanceLods(camera); };
const triangles = (r) => r.model.children.reduce((n, m) => n + (m.geometry.index ?? m.geometry.attributes.position).count / 3, 0);
const compile = (m) => { const s = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>' }; m.onBeforeCompile(s, {}); return s; };

test('the far copy holds every plant once: the same triangles, a colour and its plant\'s foot per vertex', () => {
  const g = far.geometry, total = records.reduce((n, r) => n + triangles(r), 0);
  assert.equal(g.attributes.position.count / 3, total);
  assert.equal(g.index.count / 3, total);
  for (const name of ['normal', 'color', 'lodCentre']) assert.equal(g.attributes[name].count, g.attributes.position.count, name);
  const feet = new Set(); for (let i = 0; i < g.attributes.lodCentre.count; i++) feet.add([0, 1, 2].map((k) => g.attributes.lodCentre.array[i * 3 + k].toFixed(3)).join());
  assert.deepEqual([...feet].sort(), records.map((r) => [r.x, r.y, r.z].map((v) => Math.fround(v).toFixed(3)).join()).sort());
  const box = new T.Box3().setFromBufferAttribute(g.attributes.position), all = new T.Box3(); records.forEach((r) => all.expandByObject(r.model, true));
  assert.ok(box.min.distanceTo(all.min) < 1e-4 && box.max.distanceTo(all.max) < 1e-4, 'baked where the plants stand');
  assert.ok(far.castShadow && far.customDepthMaterial && far.userData.noDetail);
});

test('by the doors only the plants\' own meshes draw; in the zone both levels; beyond it only the far copy, in one draw call', () => {
  const r = records[0];
  look(r.x, 1.6, r.z - 3, r.x, 0.5, r.z); // 3 m from the first plant, the others out of view or near
  assert.ok(r.model.visible, 'the plant by the camera is its own meshes');
  const near = records.filter((q) => q.model.visible).length;
  assert.equal(lod.plants + near >= records.length, true);
  look(r.x, 1.6, r.z - 3, r.x, 0.5, r.z - 30); // looking away from the house: no far plant in view
  assert.equal(far.visible, false, 'no far plant in view: the far copy is not drawn (no extra call up close)');
  const mid = (L.start + L.end) / 2;
  look(r.x, r.y, r.z - mid, r.x, r.y, r.z);
  assert.ok(r.model.visible && far.visible && lod.plants >= 1, 'inside the zone both levels draw (the dither splits the pixels)');
  look(-20, 1.6, -80, -20, 1.6, 0);
  assert.ok(records.every((q) => !q.model.visible) && far.visible && lod.plants === records.length);
  assert.equal(far.geometry.drawRange.count, far.geometry.index.count, 'all plants in the far copy');
  look(r.x, 1.6, r.z - 3, r.x, 0.5, r.z);
  const expected = records.filter((q) => Math.hypot(q.x - camera.position.x, q.y - camera.position.y, q.z - camera.position.z) > L.start - L.margin);
  assert.equal(far.geometry.drawRange.count / 3, expected.reduce((n, q) => n + triangles(q), 0), 'the index holds the far plants only');
  assert.equal(far.visible, false, 'the far ones are behind the pot we look down at');
});

test('setRange(1e6, 2e6) (and &nolod) keeps the original meshes everywhere', () => {
  lod.setRange(1e6, 2e6); look(-20, 1.6, -80, -20, 1.6, 0);
  assert.ok(records.every((q) => q.model.visible) && !far.visible && far.geometry.drawRange.count === 0);
  lod.setRange(L.start, L.end); look(-20, 1.6, -80, -20, 1.6, 0);
  assert.ok(records.every((q) => !q.model.visible) && far.visible);
});

test('materials: the entrance has its own fading copies, leaves keep the wind, shadows use the same fade', () => {
  const meshes = records.flatMap((r) => r.model.children), leaves = meshes.filter((m) => m.geometry.attributes.plantWind);
  assert.ok(leaves.length >= records.length);
  for (const m of meshes) {
    assert.ok('LOD_ORIGIN' in m.material.defines, m.name);
    assert.ok(m.customDepthMaterial && 'LOD_ORIGIN' in m.customDepthMaterial.defines);
    const s = compile(m.material), d = compile(m.customDepthMaterial), wind = !!m.geometry.attributes.plantWind;
    for (const x of [s, d]) { assert.equal(x.uniforms.uLodFar.value, 0); assert.match(x.fragmentShader, /lodBayer/); assert.equal(/plantSway/.test(x.vertexShader), wind); }
    assert.equal(!!m.customDepthMaterial.userData.plantWind, wind);
  }
  assert.equal(new Set(meshes.map((m) => m.material)).size <= 9, true, 'few materials, shared by the plants');
  const f = compile(far.material), fd = compile(far.customDepthMaterial);
  for (const x of [f, fd]) { assert.equal(x.uniforms.uLodFar.value, 1); assert.match(x.vertexShader, /LOD_CENTRE_ATTRIBUTE/); assert.equal(x.uniforms.uLodRange, lod.range); }
  assert.ok('LOD_CENTRE_ATTRIBUTE' in far.material.defines && !/plantSway/.test(f.vertexShader), 'the far copy stands still');
  assert.notEqual(far.material.customProgramCacheKey(), meshes[0].material.customProgramCacheKey());
});
