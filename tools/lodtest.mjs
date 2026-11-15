// #1958: node --test tools/lodtest.mjs  (the distance-LOD helper's level/zone math and its buffer packing; no browser)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { lodFade, lodMembership, ditherThreshold, ditherKeeps, packOrder, InstanceLod } from '../src/lod.js';
import { SEASON } from '../src/config.js';
import { registerTrees, applySeason } from '../src/seasons.js';

test('fade is 0 before the zone, 1 after it, linear inside and monotonic', () => {
  assert.equal(lodFade(10, 46, 54), 0); assert.equal(lodFade(46, 46, 54), 0);
  assert.equal(lodFade(50, 46, 54), 0.5); assert.equal(lodFade(54, 46, 54), 1); assert.equal(lodFade(200, 46, 54), 1);
  let last = 0; for (let d = 40; d < 60; d += 0.25) { const f = lodFade(d, 46, 54); assert.ok(f >= last); last = f; }
});
test('membership: near buffer until end + margin, far buffer from start - margin; a zone instance is in both', () => {
  assert.deepEqual(lodMembership(20, 46, 54, 2), { near: true, far: false });
  assert.deepEqual(lodMembership(50, 46, 54, 2), { near: true, far: true });
  assert.deepEqual(lodMembership(56.1, 46, 54, 2), { near: false, far: true });
  assert.deepEqual(lodMembership(44.1, 46, 54, 2), { near: true, far: true });
  assert.deepEqual(lodMembership(43.9, 46, 54, 2), { near: true, far: false });
  // the shader's exact fade never needs an instance outside its buffer while the camera moved less than the margin
  for (let d = 0; d < 100; d += 0.5) { const f = lodFade(d, 46, 54), m = lodMembership(d + 1.9, 46, 54, 2), m2 = lodMembership(d - 1.9, 46, 54, 2); if (f < 1) assert.ok(m.near && m2.near); if (f > 0) assert.ok(m.far && m2.far); }
});
test('dither: near and far keep complementary pixels, every pixel drawn once, the share follows the fade', () => {
  for (const f of [0, 0.1, 0.25, 0.5, 0.8, 1]) {
    let near = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const t = ditherThreshold(x, y), a = ditherKeeps(false, f, t), b = ditherKeeps(true, f, t);
      assert.notEqual(a, b); if (a) near++;
    }
    assert.ok(Math.abs(near / 16 - (1 - f)) <= 1 / 16 + 1e-9, `fade ${f}: near share ${near / 16}`);
  }
  assert.equal(new Set(Array.from({ length: 16 }, (_, i) => ditherThreshold(i & 3, i >> 2))).size, 16);
});
test('packOrder moves the wanted ids to the front, stably', () => {
  const r = packOrder(Int32Array.from([0, 1, 2, 3, 4]), Uint8Array.from([0, 1, 0, 1, 1]));
  assert.deepEqual([...r.order], [1, 3, 4, 0, 2]); assert.equal(r.count, 3); assert.equal(r.changed, true);
  assert.equal(packOrder(r.order, Uint8Array.from([0, 1, 0, 1, 1])).changed, false);
});

const build = (n) => {
  const near = new T.InstancedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial(), n), far = new T.InstancedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial(), n);
  const seeds = [];
  for (let i = 0; i < n; i++) {
    const sd = { pos: new T.Vector3(i * 10, 0, 0), rot: new T.Quaternion(), scale: new T.Vector3(1, 1, 1), r1: i / n, r2: 0.5, r3: 0.5, r4: 1 };
    seeds.push(sd); near.setMatrixAt(i, new T.Matrix4().compose(sd.pos, sd.rot, sd.scale)); near.setColorAt(i, new T.Color(i / n, 0, 0));
  }
  near.computeBoundingSphere();
  return { near, far, seeds };
};
test('InstanceLod: draws each instance at the level(s) its distance needs and keeps seeds aligned with the buffers', () => {
  const { near, far, seeds } = build(12), lod = new InstanceLod([{ mesh: near, seeds }], far, { start: 46, end: 54, margin: 2, step: 1 });
  lod.update(new T.Vector3(0, 0, 0), true); // instances at x = 0, 10 … 110
  // near: d < 56 -> x 0..50 (6); far: d > 44 -> x 50..110 (7); x = 50 is in both
  assert.deepEqual(lod.state(), { near: 6, far: 7 });
  const m = new T.Matrix4(), p = new T.Vector3();
  for (let i = 0; i < 12; i++) { near.getMatrixAt(i, m); p.setFromMatrixPosition(m); assert.equal(p.x, seeds[i].pos.x, `seed ${i} matches its instance`); }
  assert.equal(far.visible, true);
  lod.update(new T.Vector3(110, 0, 0), true); // near: d < 56 -> x 60..110 (6); far: d > 44 -> x 0..60 (7)
  assert.deepEqual(lod.state(), { near: 6, far: 7 });
  for (let i = 0; i < 12; i++) { near.getMatrixAt(i, m); p.setFromMatrixPosition(m); assert.equal(p.x, seeds[i].pos.x); }
  lod.update(new T.Vector3(0, 0, 0), true);
  assert.deepEqual(lod.state(), { near: 6, far: 7 });
});
test('InstanceLod: the far copy follows seasons.js (colours, winter hides it), one packing per camera step', () => {
  const { near, far, seeds } = build(8), lod = new InstanceLod([{ mesh: near, seeds }], far, { start: 20, end: 28, margin: 2, step: 1 });
  registerTrees(near, seeds);
  lod.update(new T.Vector3(0, 0, 0), true);
  applySeason(7);
  assert.ok(far.count > 0 && far.visible);
  const m = new T.Matrix4(), s = new T.Vector3(), q = new T.Quaternion(), p = new T.Vector3();
  far.getMatrixAt(0, m); m.decompose(p, q, s); assert.ok(s.x > 0.5, 'summer scale');
  // far colour = the season's colour of that very tree
  const c = new T.Color(); far.getColorAt(0, c);
  const idx = seeds.findIndex((sd) => Math.abs(sd.pos.x - p.x) < 1e-6); near.getColorAt(idx, c.set(0)); const nearC = new T.Color(); near.getColorAt(idx, nearC); const farC = new T.Color(); far.getColorAt(0, farC);
  assert.ok(Math.abs(nearC.r - farC.r) < 1e-6 && Math.abs(nearC.g - farC.g) < 1e-6, 'colour copied');
  assert.ok(SEASON.trees[1][3] === 0);
  applySeason(1);
  assert.equal(near.visible, false); assert.equal(far.visible, false);
  applySeason(7);
  assert.equal(far.visible, true);
  const before = far.instanceMatrix.version; lod.update(new T.Vector3(0.3, 0, 0)); assert.equal(far.instanceMatrix.version, before, 'moved under a step: no repack');
});
test('InstanceLod: an emptied mesh is culled by its sphere; a view-limited far level holds only what the camera sees', () => {
  const { near, far, seeds } = build(12), lod = new InstanceLod([{ mesh: near, seeds }], far, { start: 46, end: 54, margin: 2, step: 1 });
  const cam = new T.PerspectiveCamera(60, 1, 0.1, 500); cam.position.set(110, 0, 0); cam.lookAt(200, 0, 0); cam.updateMatrixWorld(); // looking away from every instance
  const view = { frustum: new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)), dir: new T.Vector3(1, 0, 0) };
  lod.update(new T.Vector3(110, 0, 0), true, view);
  assert.equal(far.count, 0, 'nothing in view, nothing far');
  assert.ok(far.boundingSphere.center.y < -1e5 && !far.visible, 'empty far mesh is culled');
  cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); view.frustum.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); view.dir.set(-1, 0, 0);
  lod.update(new T.Vector3(110, 0, 0), false, view); // a 180 degree turn without moving repacks
  assert.equal(far.count, 7);
  lod.update(new T.Vector3(1000, 0, 0), true); // everything far: the near mesh is empty and culled
  assert.equal(near.count, 0); assert.ok(near.boundingSphere.center.y < -1e5);
});
