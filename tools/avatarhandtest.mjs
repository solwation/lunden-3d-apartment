// #2106: the avatars' nails, joint creases and knuckles: placed per finger from #2016's joints, deterministic, mirrored between the hands,
// and following every grip shape the way the vertex shader bends the fingers. Function-level checks (no frozen file diffs).
// node --test tools/avatarhandtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_HAND_DETAIL as H } from '../src/config.js';
import { fingerJoints, gripAngles, gripNames, gripPoint, FINGER_COUNT } from '../src/avatargrip.js';
import { fingerMarks, marksPoint, bendMark, nailPose, handVertexGLSL, handFragmentGLSL, HAND_DETAIL, handKey } from '../src/avatarhand.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('marks are deterministic and mirrored in x between the hands', () => {
  for (let f = 0; f < FINGER_COUNT; f++) {
    const a = fingerMarks(f, 1), b = fingerMarks(f, 1), r = fingerMarks(f, -1);
    assert.deepEqual([a.P.toArray(), a.e.toArray(), a.back.toArray(), a.nail, a.dip], [b.P.toArray(), b.e.toArray(), b.back.toArray(), b.nail, b.dip]);
    for (const k of ['P', 'e', 'back']) {
      assert.ok(near(a[k].x, -r[k].x) && near(a[k].y, r[k].y) && near(a[k].z, r[k].z), `finger ${f} ${k} mirrored`);
    }
    assert.deepEqual(a.nail, r.nail); assert.equal(a.dip, r.dip);
  }
});

test('each finger has a nail on its tip and creases at its joints, in order along the finger', () => {
  for (let f = 0; f < FINGER_COUNT; f++) for (const sx of [1, -1]) {
    const m = fingerMarks(f, sx), j = fingerJoints(f, sx);
    // the joints from #2016 are collinear in the bind pose; the marks' axis runs along them
    assert.ok(j.p.clone().sub(j.m).normalize().dot(m.e) > 0.9999 && j.t.clone().sub(j.p).normalize().dot(m.e) > 0.9999, `finger ${f}: one axis`);
    assert.ok(Math.abs(m.back.dot(m.e)) < 1e-9 && near(m.back.length(), 1), `finger ${f}: back ⟂ axis`);
    // the back faces away from the palm: a positive bend turns the tip the other way
    const bent = bendMark(m, { p: m.T.clone(), n: m.e.clone() }, [0, 0.3]).p.sub(m.T);
    assert.ok(bent.dot(m.back) < 0, `finger ${f}: the bend turns towards the palm, away from the back`);
    // middle joint (s = 0) < end-joint crease < nail start < nail end < tip end
    assert.ok(0 < m.dip && m.dip < m.nail[0] && m.nail[0] < m.nail[1] && m.nail[1] < m.tip, `finger ${f} order ${[m.dip, ...m.nail, m.tip]}`);
    const len = m.nail[1] - m.nail[0];
    assert.ok(len > 0.005 && len < 0.016 && len < 2.6 * m.r, `finger ${f}: nail ${len} m on a radius ${m.r} finger`);
    assert.ok(near(m.tip - m.nail[1], H.nail.end * m.r, 1e-12), 'the nail stops short of the tip');
  }
  // the thumb's nail is the longest, the little finger's the shortest
  const len = (f) => { const m = fingerMarks(f, 1); return m.nail[1] - m.nail[0]; };
  assert.ok(len(4) > len(2) && len(0) < len(2));
});

test('the nail follows every grip shape rigidly with its finger', () => {
  for (const name of gripNames()) {
    const ang = gripAngles(name);
    for (let f = 0; f < FINGER_COUNT; f++) for (const sx of [1, -1]) {
      const m = fingerMarks(f, sx), rest = marksPoint(m, (m.nail[0] + m.nail[1]) / 2), pose = nailPose(f, sx, ang);
      // the shader's bend: distal about the middle joint, then everything about the knuckle; in the hand frame of the same side
      const p = rest.p.clone().sub(m.P).applyAxisAngle(m.axis, ang[f * 2 + 1]).add(m.P).sub(m.M).applyAxisAngle(m.axis, ang[f * 2]).add(m.M);
      assert.ok(p.distanceTo(pose.p) < 1e-9, `${name} finger ${f}: nail where the skin under it goes`);
      // rigid: same distance to the knuckle and the bent middle joint; the normal turned by the sum of both bends about the one axis
      const P1 = m.P.clone().sub(m.M).applyAxisAngle(m.axis, ang[f * 2]).add(m.M);
      assert.ok(near(pose.p.distanceTo(P1), rest.p.distanceTo(m.P), 1e-9), `${name} finger ${f}: rigid`);
      assert.ok(near(pose.n.angleTo(rest.n), Math.min(Math.PI, ang[f * 2] + ang[f * 2 + 1]), 1e-6), `${name} finger ${f}: normal turns with the bend`);
    }
  }
  // closing the hand carries the nails round towards the palm side (-sx x in the hand frame) and turns them with it
  for (const name of ['cylinder', 'pistol', 'pinch']) for (const sx of [1, -1]) {
    const open = gripAngles('flat'), shut = gripAngles(name);
    for (let f = 0; f < 4; f++) {
      if (shut[f * 2] + shut[f * 2 + 1] < 1) continue; // the pistol grip's index finger stays out
      const a = nailPose(f, sx, open), b = nailPose(f, sx, shut);
      assert.ok(b.p.x * sx < a.p.x * sx && b.n.x * sx < a.n.x * sx, `${name} finger ${f} side ${sx}: the nail moves round with the curl`);
    }
  }
  // and the hand-specific shapes differ: the pistol grip leaves the index nail pointing down the fingers, a fist turns the others round
  const pistol = gripAngles('pistol'), idx = nailPose(3, 1, pistol), mid = nailPose(2, 1, pistol);
  assert.ok(idx.n.angleTo(fingerMarks(3, 1).back) < 0.5 && mid.n.angleTo(fingerMarks(2, 1).back) > 2);
});

test('GLSL: tables for all ten fingers, finite numbers, switchable', () => {
  const L = new THREE.Vector3(0.2, 0.9, 0), R = new THREE.Vector3(-0.2, 0.9, 0), part = { finger: 100 };
  const v = handVertexGLSL(L, R, 100), fr = handFragmentGLSL({ bindL: L, bindR: R, part });
  for (const s of [v.decl, v.body, fr.decl, fr.color, fr.normal]) assert.ok(s.length > 0 && !/NaN|Infinity|undefined/.test(s));
  for (const t of ['HND_P', 'HND_E', 'HND_B', 'HND_N']) assert.equal((v.decl.match(new RegExp(`${t}\\[10\\] = vec[34]\\[10\\]\\(`, 'g')) ?? []).length, 1);
  assert.ok(/uniform vec2 uFing\[10\]/.test(fr.decl), 'the fragment reads the grip from #2016\'s own uniform');
  assert.equal(fr.decl.match(/vec4\(/g).length, 10);
  // the color piece declares what the normal piece reads, at main's scope (not inside a block)
  assert.ok(/^float hndNail = 0\.0/.test(fr.color) && /hndNail\)/.test(fr.normal));
  HAND_DETAIL.on = false;
  try {
    assert.equal(handKey(), '-handoff');
    assert.deepEqual(handFragmentGLSL({ bindL: L, bindR: R, part }), { decl: '', color: '', normal: '' });
    assert.deepEqual(handVertexGLSL(L, R, 100), { decl: '', body: '' });
  } finally { HAND_DETAIL.on = true; }
  assert.equal(handKey(), '-hand2106');
});
