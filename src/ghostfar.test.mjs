import test from 'node:test';
import assert from 'node:assert/strict';
import { farBodyGeometry, farBodyFits, farLookAttributes } from './ghostfar.js';
import { GHOSTS, AVATAR } from './config.js';

test('#1966: the far figure is a few hundred triangles, a person\'s size, every vertex with a part', () => {
  const g = farBodyGeometry(), n = g.attributes.position.count / 3;
  assert.ok(n >= 300 && n <= 800, `${n} triangles (every hair variant included; one style shows ~110 fewer)`);
  g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox.min.y) < 0.01 && g.boundingBox.max.y > 1.65 && g.boundingBox.max.y < 1.85, 'feet on the ground, head at a person\'s height');
  assert.ok(g.boundingBox.max.x - g.boundingBox.min.x < 0.7);
  assert.equal(g.attributes.pl.itemSize, 3);
  const parts = new Set(); for (let i = 0; i < g.attributes.pl.count; i++) parts.add(g.attributes.pl.getX(i));
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

test('#2164: instance attributes from the appearance code: hair style, sex, sleeve and leg length, with defaults for missing tags', () => {
  assert.deepEqual(farLookAttributes({ style: 1, gender: 1, sleeves: 1, legs: 3 }), [1, 1, 1, 3]);
  assert.deepEqual(farLookAttributes({ style: 4, figure: 1, sleeves: 0, legs: 1 }), [4, 1, 0, 1]);
  assert.deepEqual(farLookAttributes({ style: 2, gender: 0, sleeves: 0, cut: 1 }), [2, 0, 2, 0], 'a tank top shows bare arms');
  assert.deepEqual(farLookAttributes({ style: 0, sleeves: 0, cut: 2 }), [0, 0, 1, 0], 'a hoodie has long sleeves');
  assert.deepEqual(farLookAttributes({}), [0, 0, 0, 0]);
  assert.deepEqual(farLookAttributes(null), [0, 0, 0, 0]);
  assert.deepEqual(farLookAttributes({ style: 9, gender: 5, legs: 'x', sleeves: undefined }), [0, 0, 0, 0], 'unknown values fall back');
});

test('#2164: the far figure has limbs to swing and one hair variant per style that collapses when not chosen', () => {
  const g = farBodyGeometry(), pl = g.attributes.pl, limbs = new Set(), hairs = new Set();
  for (let i = 0; i < pl.count; i++) { limbs.add(pl.getY(i)); hairs.add(pl.getZ(i)); }
  assert.deepEqual([...limbs].sort(), [0, 1, 2]);
  assert.deepEqual([...hairs].sort(), [0, 1, 2, 3, 4]);
});

test('#2164: hair stays behind and above the face from the front; the arms touch the torso at the shoulder', () => {
  const g = farBodyGeometry(), pl = g.attributes.pl, p = g.attributes.position;
  for (let i = 0; i < pl.count; i++) {
    const hv = pl.getZ(i), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (pl.getX(i) === 3 && (hv > 0 || (y > 1.5 && pl.getY(i) === 0))) { // hair parts (the beanie is `top`: its cuff edge is the brow)
      if (y < 1.6 && Math.abs(x) < 0.1) assert.ok(z < 0.02, `hair variant ${hv} in front of the face at y ${y.toFixed(3)}, z ${z.toFixed(3)}`);
    }
    if (hv === 1) assert.ok(z <= 0.001, `long hair vertex in front of the head's middle (z ${z.toFixed(3)})`);
  }
  let torso = 0, arm = 9;
  for (let i = 0; i < pl.count; i++) {
    const y = p.getY(i), ax = Math.abs(p.getX(i));
    if (pl.getY(i) === 0 && pl.getX(i) === 1 && pl.getZ(i) === 0 && y > 1.44 && y < 1.46) torso = Math.max(torso, ax);
    if (pl.getY(i) === 2 && y > 1.4) arm = Math.min(arm, ax);
  }
  assert.ok(torso > 0.15 && Math.abs(arm - torso) <= 0.01, `arm inner edge ${arm.toFixed(3)} vs torso shoulder ${torso.toFixed(3)}`);
});
