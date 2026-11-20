import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { DetailCuller, DETAIL_HIDDEN_LAYER } from '../src/detail.js';
import { avatarLook } from '../src/config.js';
// Ghost's browser events are inert here; imported statistics timers must not keep the Node worker alive.
globalThis.location ??= { search: '' };
globalThis.addEventListener ??= () => {};
const interval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t = interval(...args); t.unref(); return t; };
const { Ghost, Ghosts } = await import('../src/ghosts.js');
globalThis.setInterval = interval;

const box = { W: 20, D: 20, roof: 7, floor1: 3, doorHeight: 2 };
const openings = { north: [], south: [], walls: [] };
test('own body created before detail collection draws at spawn without a camera step, including a replacement look', () => {
  const scene = new T.Scene(), g = new Ghost(scene, 'me', 'Spawn2211', true);
  const camera = new T.PerspectiveCamera();camera.position.set(12.5, 1.62, 26.2);camera.updateMatrixWorld(true);
  const detail = new DetailCuller(scene, box, openings);
  detail.update(camera);g.root.position.set(12.5, 0, 26);g.root.visible = true;scene.updateMatrixWorld(true);
  detail.update(camera);
  assert.equal(g.mesh.layers.mask, 1, 'body remains on the main render layer while the eye is stationary');
  assert.equal(detail.items.some(it => it.o === g.mesh), false, 'moving skinned body is outside static furnishing culling');
  g.setAvatarLook({ ...avatarLook('replacement2211'), bodyBuild: 8 });
  const next = new DetailCuller(scene, box, openings);next.update(camera);
  assert.equal(g.mesh, g.avatar.mesh);assert.equal(g.mesh.layers.mask, 1);
  assert.equal(next.items.some(it => it.o === g.mesh), false, 'replacement preserves dynamic visibility ownership');
  g.dispose();
});
test('ordinary static furnishing still keeps the existing stationary-eye culling policy', () => {
  const scene = new T.Scene(), o = new T.Mesh(new T.BoxGeometry(.3,.3,.3), new T.MeshStandardMaterial());scene.add(o);
  const camera = new T.PerspectiveCamera();camera.position.set(12.5,1.62,26.2);camera.updateMatrixWorld(true);
  const detail = new DetailCuller(scene,box,openings);detail.update(camera);
  assert.equal(o.layers.mask, 1 << DETAIL_HIDDEN_LAYER);
  o.position.set(12.5,1,26);scene.updateMatrixWorld(true);detail.update(camera);
  assert.equal(o.layers.mask, 1 << DETAIL_HIDDEN_LAYER, 'this correction does not change static invalidation');
  camera.position.x += .7;camera.updateMatrixWorld(true);detail.update(camera);assert.equal(o.layers.mask,1);
  o.geometry.dispose();o.material.dispose();
});

test('mirror passes preserve the standing and crouching main-camera body (#2263)', () => {
  const g = new Ghost(new T.Scene(), 'me', 'Mirror2263', true);
  const ghosts = Object.assign(Object.create(Ghosts.prototype), {
    myGhost: g, selfGhost: () => g, light: { apply() {} },
  });
  const accessory = new T.Mesh();
  g.root.add(accessory);
  for (const crouch of [false, true]) {
    ghosts.track({ p: [1, 0, 2], r: 0.3, look: [0, -0.7], pose: 0, c: crouch, h: '', hi: '' }, performance.now());
    g.mirrorAt = -Infinity; // settle the test's new crouch pose immediately
    ghosts.showStandBody();
    const offset = g.root.position.clone(), mask = g.avatar.material.userData.u.uSelfView.value;
    assert.ok(Math.abs(offset.distanceTo(ghosts.mine.p) - (crouch ? .3 : .2)) < 1e-6);
    for (const mirrored of [true, false]) {
      ghosts.mirrored = () => mirrored;
      ghosts.beforeMirror();
      assert.equal(g.root.visible, mirrored);
      assert.deepEqual(mask.toArray(), [0, 0]);
      if (mirrored) {
        assert.deepEqual(g.root.position.toArray(), ghosts.mine.p.toArray());
        assert.ok(accessory.visible, 'the unclipped mirror body includes its accessories');
      }
      ghosts.afterMirror(); // also runs from the reflector's finally on an early return
      assert.ok(g.root.visible);
      assert.equal(accessory.visible, false);
      assert.deepEqual(g.root.position.toArray(), offset.toArray());
      assert.deepEqual(mask.toArray(), [2.12, 1]);
    }
  }
  g.dispose();
  accessory.geometry.dispose();
  accessory.material.dispose();
});
