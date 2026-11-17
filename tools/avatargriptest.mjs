// #2016: the avatars' grip shapes: category / weapon to grip, the blend on pick-up and release, the finger geometry.
// node --test tools/avatargriptest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HELD_CATEGORIES } from '../src/heldcategory.js';
import { COMBAT, AVATAR_GRIP as G } from '../src/config.js';
import { gripFor, gripAngles, easeGrip, gripPoint, gripNames, fingerJoints, fingerSegments, FINGER_COUNT } from '../src/avatargrip.js';

test('every held category and weapon resolves to a known grip shape', () => {
  for (const c of HELD_CATEGORIES) assert.ok(G.shapes[gripFor(c)], `${c} -> ${gripFor(c)}`);
  for (const w of COMBAT.weapons) assert.ok(G.shapes[gripFor('', w)], `${w} -> ${gripFor('', w)}`);
  for (const [k, v] of [...Object.entries(G.byCategory), ...Object.entries(G.byWeapon)]) assert.ok(G.shapes[v], `${k} names an unknown grip ${v}`);
});

test('the four required shapes are chosen by item type', () => {
  assert.equal(gripFor('cup'), 'cylinder');
  assert.equal(gripFor('', 'nerf'), 'pistol');
  assert.equal(gripFor('banana'), 'pinch');
  assert.equal(gripFor('plate'), 'flat');
  assert.equal(gripFor(''), 'relaxed');
  assert.equal(gripFor('__unknown__'), 'relaxed');
  assert.equal(gripFor('cup', 'nerf'), 'pistol', 'a weapon wins over a category');
  assert.deepEqual(['relaxed', 'cylinder', 'pistol', 'pinch', 'flat'].filter((n) => !gripNames().includes(n)), []);
});

test('shapes are distinct, bounded bends towards the palm', () => {
  const seen = new Set();
  for (const n of gripNames()) {
    const a = gripAngles(n); assert.equal(a.length, FINGER_COUNT * 2);
    for (const v of a) assert.ok(v >= 0 && v <= 1.6, `${n}: ${v}`);
    seen.add([...a].join());
  }
  assert.equal(seen.size, gripNames().length);
  const pistol = gripAngles('pistol'), cyl = gripAngles('cylinder'), flat = gripAngles('flat');
  assert.ok(pistol[0] > 1 && pistol[6] < 0.4 && pistol[7] < 0.4, 'pistol: the index finger stays out'); // fingers: little, ring, middle, index
  assert.ok(Math.min(...cyl.slice(0, 8)) > 0.8, 'cylinder: all four fingers closed');
  assert.ok(Math.max(...flat.slice(0, 8)) < 0.2, 'flat: all four fingers straight');
});

test('the blend is smooth: monotone, no overshoot, settles, and reverses on release', () => {
  const cur = gripAngles('relaxed'), goal = gripAngles('cylinder'), trace = [];
  for (let i = 0; i < 120; i++) { easeGrip(cur, 'cylinder', 1 / 60); trace.push(cur[0]); }
  assert.ok(trace.every((v, i) => i === 0 || v >= trace[i - 1] - 1e-9), 'monotone');
  assert.ok(trace.every((v) => v <= goal[0] + 1e-9), 'no overshoot');
  assert.ok(trace[2] - gripAngles('relaxed')[0] < (goal[0] - gripAngles('relaxed')[0]) * 0.6, 'not a jump on the first frames');
  assert.deepEqual([...cur], [...goal], 'settles exactly on the grip');
  assert.equal(easeGrip(cur, 'cylinder', 1 / 60), false, 'at rest reports no change');
  for (let i = 0; i < 120; i++) easeGrip(cur, 'relaxed', 1 / 60);
  assert.deepEqual([...cur], [...gripAngles('relaxed')], 'release goes back');
  const big = gripAngles('relaxed'); easeGrip(big, 'pistol', 10); // a long frame does not overshoot either
  assert.ok(big.every((v, i) => v <= Math.max(gripAngles('pistol')[i], gripAngles('relaxed')[i]) + 1e-9));
});

test('the grip moves a held thing towards the palm side, mirrored for the two hands', () => {
  const l = gripPoint('cylinder', 1), r = gripPoint('cylinder', -1);
  assert.ok(l[0] < 0 && r[0] > 0 && Math.abs(l[0] + r[0]) < 1e-12);
  assert.ok(gripPoint('relaxed', 1).every((v) => v === 0));
});

test('finger geometry: two segments per finger that join at the joint, mirrored hands', () => {
  for (const sx of [1, -1]) for (let f = 0; f < 5; f++) {
    const j = fingerJoints(f, sx), segs = fingerSegments(f, sx, (r, h) => new THREE.CapsuleGeometry(r, h, 1, 4));
    assert.equal(segs.length, 2);
    assert.ok(Math.abs(j.axis.length() - 1) < 1e-9);
    const mid = j.m.clone().add(j.p).multiplyScalar(0.5);
    assert.ok(new THREE.Vector3(...segs[0][1]).distanceTo(mid) < 1e-9);
    assert.ok(j.m.distanceTo(j.p) > 0.015 && j.p.distanceTo(j.t) > 0.01);
    // a positive bend swings the tip towards the palm (-sx on x) for the four fingers
    if (f < 4) { const q = new THREE.Quaternion().setFromAxisAngle(j.axis, 1), tip = j.t.clone().sub(j.m).applyQuaternion(q); assert.ok(sx * (tip.x - (j.t.x - j.m.x)) < -0.01, `finger ${f} side ${sx}`); }
  }
});
