import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { addCarLod, updateCarLods, carLodState } from '../src/viewlod.js';
import { addShadowTiles } from '../src/shadowtiles.js';
import { garageBikeRowLod } from '../src/garagelods.js';
import { lodCamera, lodFade } from '../src/lod.js';
import { GARAGE, VIEW_LOD } from '../src/config.js';
import { hasNativeVertexCompile } from '../src/vertexcompile.js';

const compile = m => { const s = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <clipping_planes_fragment>' }; m.onBeforeCompile(s, {}); return s; };
function cars(xs, reach = VIEW_LOD.carNear, tiles = false) {
  const root = new T.Group(), sources = [], batches = [];
  for (let j = 0; j < 4; j++) {
    const source = new T.MeshStandardMaterial(), b = new T.InstancedMesh(new T.BoxGeometry(4, 1.5, 1.7), source, xs.length);
    b.castShadow = true;
    xs.forEach((x, i) => { b.setMatrixAt(i, new T.Matrix4().makeTranslation(x, 0, 0)); if (!j) b.setColorAt(i, new T.Color(i / xs.length, .2, .4)); });
    root.add(b); sources.push(source); batches.push(b); if (tiles) assert.ok(addShadowTiles(b) > 1);
  }
  const ix = carLodState().length, lo = addCarLod(batches, reach), camera = new T.PerspectiveCamera();
  return { root, sources, batches, lo, camera, state: () => carLodState()[ix], at(x) { camera.position.set(x, 0, 0); camera.updateMatrixWorld(true); updateCarLods(camera); } };
}
const positions = mesh => Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 12]);
test('four material layers count as the same cars: one near/far copy per car through the zone, colours/matrices stay aligned', () => {
  const f = cars([0, 30, 70]); f.at(0);
  assert.deepEqual(f.state(), { near: 2, far: 2, cars: 3, transition: 1, start: 26, end: 34 });
  for (const b of f.batches) assert.deepEqual(positions(b), [0, 30]);
  assert.deepEqual(positions(f.lo), [30, 70]);
  const color = new T.Color(); f.lo.getColorAt(0, color); assert.ok(Math.abs(color.r - 1 / 3) < 1e-6);
  f.at(100); for (const b of f.batches) assert.deepEqual(positions(b), [70]);
  f.batches[0].getColorAt(0, color); assert.ok(Math.abs(color.r - 2 / 3) < 1e-6);
  assert.deepEqual(positions(f.lo), [0, 30, 70]);
  f.at(0); assert.deepEqual(positions(f.lo), [30, 70]);
});
test('normal near/far views use only the original level, with empty levels frustum-culled; the main-camera uniform keeps moving between packing steps', () => {
  const f = cars([0, 2, 4, 6], VIEW_LOD.carNearDesktop); f.at(0);
  assert.equal(f.state().near, 4); assert.equal(f.state().far, 0); assert.ok(f.lo.boundingSphere.center.y < -1e5);
  const version = f.batches[0].instanceMatrix.version; f.at(.5);
  assert.equal(f.batches[0].instanceMatrix.version, version); assert.equal(lodCamera.value.x, .5);
  f.at(120); assert.equal(f.state().near, 0); assert.equal(f.state().far, 4);
  for (const b of f.batches) assert.ok(b.boundingSphere.center.y < -1e5);
  assert.equal(f.state().start, 56); assert.equal(f.state().end, 64);
});
test('car colour/depth shaders share the exact distance range and complementary levels; unrelated shared materials stay native', () => {
  const f = cars([0, 30]);
  for (const [m, far] of [...f.batches.map(b => [b, false]), [f.lo, true]]) {
    const c = compile(m.material), d = compile(m.customDepthMaterial);
    assert.equal(c.uniforms.uLodRange, d.uniforms.uLodRange); assert.equal(c.uniforms.uLodFar.value, far ? 1 : 0); assert.equal(d.uniforms.uLodFar.value, far ? 1 : 0);
    assert.match(c.fragmentShader, /lodBayer/); assert.match(d.fragmentShader, /lodBayer/); assert.ok(hasNativeVertexCompile(m.material));
  }
  for (const source of f.sources) assert.ok(!source.customProgramCacheKey().includes('dither-lod'));
});
test('phone shadow tiles retain original full-car matrices/materials while view buffers are repacked', () => {
  const f = cars([0, 10, 20, 40, 50, 70, 90, 120], 30, true);
  const tiles = f.batches.flatMap(b => b.children.filter(c => c.userData.shadowTile));
  const matrices = tiles.map(t => [...t.instanceMatrix.array]), materials = tiles.map(t => t.material);
  f.at(200); f.at(0);
  assert.ok(f.batches.every(b => !b.castShadow)); assert.equal(f.lo.castShadow, false);
  assert.deepEqual(tiles.map(t => [...t.instanceMatrix.array]), matrices); assert.deepEqual(tiles.map(t => t.material), materials);
  assert.ok(tiles.every(t => !t.customDepthMaterial && !t.material.customProgramCacheKey().includes('dither-lod')));
});
test('garage rows retain actual geometry, row-radius/horizontal distance, one level outside the zone and shared live lighting', () => {
  const hi = new T.Mesh(new T.BoxGeometry(6, 1, 2)), lo = new T.Mesh(new T.BoxGeometry(6, 1, 2));
  hi.castShadow = lo.castShadow = true;
  const shell = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide }), row = garageBikeRowLod(hi, lo, shell), hiGeo = hi.geometry, loGeo = lo.geometry;
  const mid = GARAGE.bikeLodNear + row.r, pos = d => new T.Vector3(row.c.x + d, 8, row.c.z);
  row.update(pos(mid - GARAGE.bikeLodFade)); assert.ok(hi.visible && !lo.visible);
  row.update(pos(mid)); assert.ok(hi.visible && lo.visible); assert.equal(lodFade(mid, row.range.value.x, row.range.value.y), .5);
  row.update(pos(mid + GARAGE.bikeLodFade)); assert.ok(!hi.visible && lo.visible);
  assert.equal(hi.geometry, hiGeo); assert.equal(lo.geometry, loGeo); assert.equal(row.centre.value.y, 8);
  for (const mesh of [hi, lo]) {
    assert.equal(mesh.material.color, shell.color); assert.notEqual(mesh.material, shell);
    const c = compile(mesh.material), d = compile(mesh.customDepthMaterial);
    assert.equal(c.uniforms.uLodCentre, row.centre); assert.equal(c.uniforms.uLodRange, row.range); assert.equal(c.uniforms.uLodFar.value, d.uniforms.uLodFar.value);
    assert.ok('LOD_CENTRE' in mesh.material.defines);
  }
  shell.color.setScalar(.035); assert.equal(hi.material.color.r, .035); assert.equal(lo.material.color.r, .035);
  shell.color.setScalar(1); assert.equal(hi.material.color.r, 1); assert.equal(lo.material.color.r, 1);
});
