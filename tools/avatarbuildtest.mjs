// #2141: the body build as a body shape (src/avatarbuild.js), headless: node --test tools/avatarbuildtest.mjs (needs `three` resolvable,
// e.g. a node_modules link to the pinned 0.170.0 package). Function-level checks of the region offsets per build and gender, the head /
// hands / feet of the real avatar geometry unchanged, old looks mapped to their nearest step, and self-intersection proxies on the real
// posed skeleton (CPU skinning of the offset bind pose): the hanging hands beside the hips, the thighs apart and the belly over the thighs
// when sitting and crouching.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar } from '../src/avatar.js';
import { poseOlof, seatedPose } from '../src/olof.js';
import { AVATAR_BUILD as B, AVATAR_SURFACE, AVATAR_BODY_SHAPE as BS } from '../src/config.js';
import { bodyShape, bodyOffset, classWeights, trunkGain, limbGain } from '../src/avatarbuild.js';
import { shoulderMetrics } from './avatarshouldervolume.mjs';

const STEPS = [...Array(B.steps).keys()];
const look = (gender, bodyBuild) => ({ gender, bodyBuild });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('#2141 medium build: no build gain; slim and heavy grow monotonically per region, both genders', () => {
  for (const gender of [0, 1]) {
    const shapes = STEPS.map((k) => bodyShape(look(gender, k)));
    assert.equal(shapes[B.mid].g, 0);
    assert.deepEqual(shapes[B.mid].limb, [0, 0, 0, 0]);
    for (let k = 1; k < shapes.length; k++) {
      const a = shapes[k - 1], b = shapes[k];
      for (let i = 0; i < 4; i++) {
        assert.ok(b.x[i] > a.x[i] && b.z[i] > a.z[i], `trunk knot ${i} grows at step ${k} (${gender})`);
        assert.ok(b.limb[i] > a.limb[i], `limb ${i} grows at step ${k}`);
      }
      assert.ok(b.belly > a.belly && b.bust > a.bust, `belly/bust grow at step ${k}`);
      for (const j of ['shoulder', 'hip', 'hand']) assert.ok(b.spread[j] >= a.spread[j] && b.spread[j] > a.spread[j], `${j} spread grows at step ${k}`);
    }
    // ordinary bodies at the ends: no region more than ±30 % wider, no bump beyond 4.5 cm
    for (const s of [shapes[0], shapes.at(-1)]) {
      for (const v of [...s.x, ...s.z, ...s.limb]) assert.ok(Math.abs(v) <= 0.3, `gain ${v}`);
      assert.ok(Math.abs(s.belly) <= 0.045 && Math.abs(s.bust) <= 0.045, `bumps ${s.belly} ${s.bust}`);
    }
  }
});

test('#2141 clearer gender proportions: waist-to-hip and shoulder-to-hip differ at every build; a heavy man grows most at the belly', () => {
  for (const k of STEPS) {
    const f = bodyShape(look(1, k)), m = bodyShape(look(0, k));
    assert.ok(f.x[0] - f.x[1] > m.x[0] - m.x[1] + 0.01, `female hips over waist at ${k}`);
    assert.ok(m.x[3] - m.x[0] > f.x[3] - f.x[0] + 0.01, `male shoulders over hips at ${k}`);
  }
  const fh = bodyShape(look(1, B.steps - 1)), mh = bodyShape(look(0, B.steps - 1));
  assert.ok(mh.belly > fh.belly + 0.01 && fh.x[0] > mh.x[0] + 0.03 && fh.limb[2] > mh.limb[2]);
});

test('#2141 old looks: no chosen step keeps the seeded build\'s step (0.93 / 1 / 1.08 → the same shape as steps 2 / 4 / 6)', () => {
  for (const gender of [0, 1]) for (const [build, step] of [[0, 2], [1, 4], [2, 6]]) {
    assert.deepEqual(bodyShape({ gender, build }), bodyShape({ gender, bodyBuild: step }));
  }
  assert.deepEqual(bodyShape({}), bodyShape({ gender: 0, bodyBuild: B.mid }), 'a look without build or gender is the medium male');
});

test('#2141 the field fades: zero above the neck, zero at the wrist and the ankle, continuous at the knots', () => {
  const sh = bodyShape(look(0, B.steps - 1));
  assert.equal(trunkGain(sh.x, 0.7), 0); assert.equal(trunkGain(sh.z, 0.64), 0);
  assert.equal(limbGain(sh, true, 0.9), 0); assert.equal(limbGain(sh, true, 1.45), 0);
  assert.equal(limbGain(sh, false, 0.1), 0);
  for (let y = -0.1; y < 0.7; y += 0.001) assert.ok(Math.abs(trunkGain(sh.x, y + 0.001) - trunkGain(sh.x, y)) < 0.01, `trunk gain jumps at ${y}`);
  for (let y = 0.85; y < 1.5; y += 0.001) assert.ok(Math.abs(limbGain(sh, true, y + 0.001) - limbGain(sh, true, y)) < 0.01, `arm gain jumps at ${y}`);
});

// the real avatar geometry: every vertex's offset from its own skin weights
const figures = new Map();
function figure(gender, step) {
  const key = `${gender}-${step}`;
  if (!figures.has(key)) {
    const avatar = new Avatar({ ...new Avatar('build-2141').look, gender, bodyBuild: step, height: undefined, tall: 1, cut: 0, legs: 0, style: 0, hat: 0 });
    figures.set(key, avatar);
  }
  return figures.get(key);
}
const weightsOf = (g, i) => {
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  return { index: [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], weight: [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)] };
};
const share = (w, bones) => w.index.reduce((s, b, k) => s + (bones.includes(b) ? w.weight[k] : 0), 0);

test('#2141 head, hands and feet of the real geometry never move; nothing moves more than 6 cm', () => {
  for (const gender of [0, 1]) for (const step of [0, B.steps - 1]) {
    const av = figure(gender, step), g = av.mesh.geometry, p = g.attributes.position, sh = av.bodyShape;
    let fixed = 0, moved = 0;
    for (let i = 0; i < p.count; i++) {
      const w = weightsOf(g, i), y = p.getY(i), off = bodyOffset([p.getX(i), y, p.getZ(i)], classWeights(w.index, w.weight, y), sh);
      const len = Math.hypot(...off);
      assert.ok(len < 0.06, `vertex ${i} moves ${len}`);
      const extremity = share(w, [5, 8, 13, 14]), head = share(w, [2]);
      if (extremity > 0.999 || (head > 0.999 && y > 1.5)) { assert.equal(len, 0, `vertex ${i} (hand/foot/head) moves`); fixed++; }
      else if (len > 0.005) moved++;
    }
    assert.ok(fixed > 1000 && moved > 500, `${fixed} fixed, ${moved} moved (${gender}, ${step})`);
    assert.ok(Math.abs(av.object.scale.x - 1) < 1e-12 && Math.abs(av.object.scale.z - 1) < 1e-12, 'no sideways object scale any more');
  }
});

// --- self-intersection proxies on the posed skeleton --------------------------------------------------------------------
const V = new THREE.Vector3(), A = new THREE.Vector3(), Bv = new THREE.Vector3();
const world = (av, name) => av.bones[name].getWorldPosition(new THREE.Vector3());
const segDist = (p, a, b) => { const ab = Bv.copy(b).sub(a), t = Math.max(0, Math.min(1, A.copy(p).sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(A.copy(a).addScaledVector(ab, t)); };
// the thigh as a capsule of its widest top ring; its front (+z in the bind pose: the side a crouch folds onto the belly) grows by leg.front
const thighR = (sh, front = BS.leg.front) => Math.max(...AVATAR_SURFACE.leg.slice(0, 4).map((r) => Math.max(r[1], r[2]))) * (1 + sh.limb[2] * front);
function pose(av, kind) {
  av.object.rotation.y = 0; av.object.position.set(0, 0, 0);
  if (kind === 'sit') poseOlof(av, seatedPose(0.45));
  else for (let n = 0; n < 30; n++) { av.time = 0; av.noIdle = true; av.update(1 / 30, { crouch: kind === 'crouch' ? 1 : 0 }); }
  av.object.updateMatrixWorld(true);
}
/** The posed, offset trunk front between the hip crease and the lower chest (world). */
function belly(av) {
  const g = av.mesh.geometry, p = g.attributes.position, out = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i), w = weightsOf(g, i);
    if (z < 0.05 || y < 0.98 || y > 1.25 || share(w, [0, 1]) < 0.999) continue;
    const off = bodyOffset([p.getX(i), y, z], classWeights(w.index, w.weight, y), av.bodyShape);
    V.set(p.getX(i) + off[0], y + off[1], z + off[2]);
    av.mesh.applyBoneTransform(i, V); out.push(V.clone().applyMatrix4(av.mesh.matrixWorld));
  }
  return out;
}
const into = (av, pts) => {
  const r = thighR(av.bodyShape), legs = ['L', 'R'].map((s) => [world(av, 'thigh' + s).lerp(world(av, 'knee' + s), 0.25), world(av, 'knee' + s)]); // (away from the groin, where the thigh starts inside the pelvis)
  return Math.max(0, ...pts.flatMap((q) => legs.map(([a, b]) => r - segDist(q, a, b))));
};

for (const kind of ['sit', 'crouch']) test(`#2141 ${kind}: the thighs stay apart and the belly rests on them about as deep as the medium figure's`, () => {
  for (const gender of [0, 1]) {
    const medium = figure(gender, B.mid); pose(medium, kind);
    const base = into(medium, belly(medium));
    for (const step of [0, B.steps - 1]) {
      const av = figure(gender, step); pose(av, kind);
      const r = thighR(av.bodyShape, 1), gap = segDist(world(av, 'thighL').lerp(world(av, 'kneeL'), 0.15), world(av, 'thighR'), world(av, 'kneeR')) - 2 * r;
      assert.ok(gap > -0.004, `${kind} thighs overlap ${gap} (${gender}, ${step})`);
      const depth = into(av, belly(av));
      // a heavy belly may rest a little deeper on the thighs in a full crouch (contact, not pass-through): at most 12 mm over the medium figure
      assert.ok(depth <= base + 0.012, `${kind} belly into the thighs ${depth} vs medium ${base} (${gender}, ${step})`);
    }
  }
});

test('#2141 standing: the hanging hands clear the hips at least as well as the medium figure', () => {
  const clearance = (av) => {
    pose(av, 'stand');
    const g = av.mesh.geometry, p = g.attributes.position;
    let hip = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), w = weightsOf(g, i);
      if (y < 0.85 || y > 1.0 || share(w, [0, 1]) < 0.999) continue;
      const off = bodyOffset([p.getX(i), y, p.getZ(i)], classWeights(w.index, w.weight, y), av.bodyShape);
      V.set(p.getX(i) + off[0], y + off[1], p.getZ(i) + off[2]); av.mesh.applyBoneTransform(i, V);
      hip = Math.max(hip, Math.abs(V.x));
    }
    const hands = ['handL', 'handR'].map((n) => { av.mesh.worldToLocal(V.copy(world(av, n))); return Math.abs(V.x); });
    return Math.min(...hands) - hip;
  };
  for (const gender of [0, 1]) {
    const base = clearance(figure(gender, B.mid));
    for (const step of [0, 2, 6, B.steps - 1]) {
      const c = clearance(figure(gender, step));
      assert.ok(c >= base - 0.006, `hand clearance ${c} vs medium ${base} (${gender}, ${step})`);
    }
  }
});

test('#2141 the IK reaches its targets with the spread joints (a seated hand lands where the seat pose puts it)', () => {
  const av = figure(1, B.steps - 1), p = seatedPose(0.45);
  pose(av, 'sit');
  const hand = av.mesh.worldToLocal(world(av, 'handL'));
  assert.ok(hand.distanceTo(new THREE.Vector3(...p.hands[0].at)) < 0.05, `hand ${hand.toArray()} vs ${p.hands[0].at}`);
  assert.ok(Math.abs(av.bones.shoulderL.position.x - 0.2 * av.spread.shoulder) < 1e-12);
});

// tools/avatarshouldertest.mjs pins its exact before-#2013 numbers to the medium build; the slim / heavy joints keep the armpit sound.
test('#2141 slim and heavy shoulders: no tearing or collapsed triangles when the arms lift, reach or cross', () => {
  for (const gender of [0, 1]) for (const bodyBuild of [0, B.steps - 1]) {
    const m = shoulderMetrics({ ...new Avatar('vol2013').look, gender, sleeves: 0, cut: 0, bodyBuild });
    for (const [pose, v] of Object.entries(m)) {
      assert.equal(v.stretched, 0, `${pose}: no tearing stretch (${gender}, ${bodyBuild})`);
      assert.ok(v.edgeP99 <= 1.8 && v.areaP1 >= 0.15, `${pose}: edge ${v.edgeP99}, area ${v.areaP1} (${gender}, ${bodyBuild})`);
    }
  }
});
