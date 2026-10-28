import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Billiards } from '../src/billiards.js';

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) };

test('all six pocket mouths stay clear with solid wooden backing outside them', () => {
  const b = new Billiards(), c = b.c, ray = new T.Raycaster();
  b.table.updateMatrixWorld(true);
  const top = (x, z) => {
    ray.set(b.object.localToWorld(new T.Vector3(x, c.height + .3, z)), new T.Vector3(0, -1, 0));
    return ray.intersectObject(b.table)[0]?.point.y;
  };
  for (const [x, z] of b.physics.pockets) {
    assert.ok(top(x, z) < c.height + .005, 'pocket centre stays below cushion height');
    const corner = Math.abs(x) > c.length / 4;
    const angles = corner ? [-.6, .4, 1.5, 2.6] : [.2, 1.2, 2.8];
    const r = (c.pocketR + c.rail) / 2;
    for (const angle of angles) {
      const px = x + (Math.sign(x) || 1) * Math.cos(angle) * r;
      const pz = z + Math.sign(z) * Math.sin(angle) * r;
      assert.ok(top(px, pz) > c.height + c.railH - .003, `backing at ${x},${z} / ${angle}`);
    }
  }
  assert.equal(b.object.children.filter(m => m.isMesh && m.material.visible !== false).length, 4);
  assert.ok(b.table.geometry.attributes.position.count / 3 < 12000, 'bounded merged table geometry');
  console.log('table triangles', b.table.geometry.attributes.position.count / 3);
});
