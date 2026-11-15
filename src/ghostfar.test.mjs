import test from 'node:test';
import assert from 'node:assert/strict';
import { farBodyGeometry, farBodyFits } from './ghostfar.js';
import { GHOSTS, AVATAR } from './config.js';

test('#1966: the far figure is a few hundred triangles, a person\'s size, every vertex with a part', () => {
  const g = farBodyGeometry(), n = g.attributes.position.count / 3;
  assert.ok(n >= 150 && n <= 320, `${n} triangles`);
  g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox.min.y) < 0.01 && g.boundingBox.max.y > 1.65 && g.boundingBox.max.y < 1.85, 'feet on the ground, head at a person\'s height');
  assert.ok(g.boundingBox.max.x - g.boundingBox.min.x < 0.7);
  const parts = new Set(g.attributes.part.array);
  assert.deepEqual([...parts].sort(), [0, 1, 2, 3, 4]);
  assert.ok(g.attributes.normal && !g.attributes.uv);
});

test('#1966: only a plain upright player gets the far figure; the zone starts where the pose stops', () => {
  const plain = { pose: 0, gx: null, bikeMesh: null, air: 0, swim: false, dance: 0, jp: 0, crouch: 0, hug: null, avatar: { suit: false } };
  assert.equal(farBodyFits(plain), true);
  for (const [k, v] of [['pose', 2], ['gx', {}], ['bikeMesh', {}], ['air', 1], ['swim', true], ['dance', 1], ['jp', 1], ['crouch', 1], ['hug', {}]]) assert.equal(farBodyFits({ ...plain, [k]: v }), false, k);
  assert.equal(farBodyFits({ ...plain, avatar: { suit: true } }), false);
  assert.ok(GHOSTS.lod.start >= AVATAR.poseFar && GHOSTS.lod.end > GHOSTS.lod.start);
});
