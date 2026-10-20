// #1397: node --test tools/ponyblankettest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { blanketGeometry, ponyBlankets } from '../src/ponyblanket.js';
import { applySeason } from '../src/seasons.js';

test('the rug covers the torso with an open neck/underside, finite normals and a bounded cost', () => {
  const g = blanketGeometry(), p = g.attributes.position, n = g.attributes.normal;
  g.computeBoundingBox(); const b = g.boundingBox;
  assert.equal(p.count / 3, 70);
  assert.ok(b.min.y >= 0.69 && b.max.y < 1.4 && b.max.z <= 0.51 && b.min.z > -0.8, 'head, neck, tail and legs are outside the rug');
  assert.ok(b.min.x < -0.28 && b.max.x > 0.28, 'both flanks are covered');
  assert.ok([...p.array, ...n.array].every(Number.isFinite));
  for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-6);
});
test('both rugs reuse the real moving/scaled torso buffer and share its parent culling', () => {
  const body = new T.InstancedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial(), 2);
  body.boundingSphere = new T.Sphere(new T.Vector3(12, 3, 4), 85);
  const rugs = ponyBlankets(body), m = new T.Matrix4().compose(new T.Vector3(8, 2, -3), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 1.2), new T.Vector3(1.1, 1.1, 1.1));
  body.setMatrixAt(1, m); const actual = new T.Matrix4(); rugs.getMatrixAt(1, actual);
  assert.deepEqual(actual.elements, Array.from(new Float32Array(m.elements)));
  assert.equal(rugs.instanceMatrix, body.instanceMatrix); assert.equal(rugs.parent, body);
  assert.deepEqual(rugs.boundingSphere, body.boundingSphere); assert.notEqual(rugs.boundingSphere, body.boundingSphere);
  assert.notDeepEqual(Array.from(rugs.instanceColor.array.slice(0, 3)), Array.from(rugs.instanceColor.array.slice(3, 6)));
  assert.deepEqual(rugs.raycast(), undefined);
});
test('winter/summer changes reuse the same buffers and restore the two rugs', () => {
  const body = new T.InstancedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial(), 2);body.boundingSphere = new T.Sphere();
  const r = ponyBlankets(body), g = r.geometry, m = r.material;
  applySeason(1);assert.ok(r.visible);applySeason(7);assert.ok(!r.visible);applySeason(12);assert.ok(r.visible);
  assert.equal(r.geometry, g);assert.equal(r.material, m);assert.equal(r.count, 2);
});
