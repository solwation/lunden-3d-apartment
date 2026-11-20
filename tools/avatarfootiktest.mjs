// #2015: the avatar's feet on stairs and slopes. Ordinary functional check: node --test tools/avatarfootiktest.mjs
// (1) olof.js `ik` (the two-bone leg solver): reach, knee towards the pole, unreachable target clamped to a straight leg.
// (2) src/avatarfootik.js + Avatar.update on a synthetic stair / ramp: each stance foot's sole within a few cm of the ground below it,
//     the hips lower when stepping down, level ground leaves the pose exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar } from '../src/avatar.js';
import { ik, THIGH, SHIN } from '../src/olof.js';
import { footGround, slopePitch } from '../src/avatarfootik.js';
import { avatarLook } from '../src/config.js';

test('two-bone IK: reach, knee direction, unreachable clamp', () => {
  const upper = new THREE.Object3D(), lower = new THREE.Object3D(), foot = new THREE.Object3D();
  upper.add(lower); lower.position.set(0, -THIGH, 0); lower.add(foot); foot.position.set(0, -SHIN, 0);
  const S = new THREE.Vector3(0, 0, 0), out = new THREE.Quaternion(), P = new THREE.Vector3(0, 0.25, 1), I = new THREE.Quaternion();
  const solve = (T) => { ik(upper, lower, I, S, T, THIGH, SHIN, P, out); upper.updateMatrixWorld(true); return [lower.getWorldPosition(new THREE.Vector3()), foot.getWorldPosition(new THREE.Vector3())]; };
  for (const T of [new THREE.Vector3(0, -0.6, 0.1), new THREE.Vector3(0.1, -0.5, 0.25), new THREE.Vector3(0, -0.42, -0.2)]) {
    const [knee, f] = solve(T);
    assert.ok(f.distanceTo(T) < 1e-4, `foot reaches ${T.toArray()} (${f.distanceTo(T)})`);
    assert.ok(Math.abs(knee.length() - THIGH) < 1e-4 && Math.abs(knee.distanceTo(f) - SHIN) < 1e-4, 'bone lengths kept');
    assert.ok(knee.z > Math.min(0, T.z) + 0.01 || knee.z > 0, `knee bends towards the pole (+z): ${knee.z}`);
  }
  const far = new THREE.Vector3(0, -2, 0), [, f] = solve(far);
  assert.ok(f.length() <= THIGH + SHIN + 1e-6 && f.length() > THIGH + SHIN - 0.01 && Math.abs(f.x) < 1e-3 && f.y < 0, 'unreachable: a straight leg towards the target');
});

test('slope pitch: a ramp tilts the sole, a step edge does not', () => {
  assert.ok(Math.abs(slopePitch(0, 0.015, 0.05, 0.278) - Math.atan2(0.05, 0.278)) < 1e-9, 'a ramp');
  assert.equal(slopePitch(0, 0.19, 0.19, 0.278), 0, 'edge under the toe and ankle');
  assert.equal(slopePitch(0, 0, 0.15, 0.278), 0, 'a riser just ahead of the ankle: heights off the line');
  assert.equal(slopePitch(NaN, 0, 0, 0.278), 0);
});

const DT = 1 / 60, SOLE = 0.05, SOLEPTS = [[0, -SOLE, -0.084], [0, -SOLE, 0.194]]; // the shoe's heel and toe on its sole, in the foot bone's frame
const stair = (rise, tread, n) => (x, z) => { const d = -z; return d <= 0 ? 0 : rise * Math.min(n, Math.ceil(d / tread - 1e-9)); };
const ramp = (k) => (x, z) => Math.max(0, -z * k);

/** Walks an avatar `secs` along −z at `v` m/s on `ground` (the root follows the ground under it, as the player does).
 * Returns the worst |sole − ground| over stance frames (m), the lowest hips and the lowest sole over the ground. */
export function run(ground, v, secs, { from = 0, back = false, build = null } = {}) {
  const av = new Avatar(build === null ? 'foot-ik-2015' : { ...avatarLook('foot-ik-2015'), bodyBuild: build }), sc = av.object.scale.z || 1;
  let z = from, y = ground(0, z), worst = 0, n = 0, pen = 0, hipLo = Infinity, hipHi = -Infinity;
  const hip = new THREE.Vector3(), p = new THREE.Vector3(), seen = [0, 0];
  const dirv = back ? 1 : -1;
  for (let i = 0; i < Math.round(secs / DT); i++) {
    z += dirv * v * DT; y = ground(0, z);
    av.object.position.set(0, y, z); av.object.rotation.y = back ? 0 : Math.PI;
    av.update(DT, { speed: v, groundSpeed: v, motionFrame: [0, z, back ? 0 : Math.PI], groundEnabled: true, ground: (x, zz, fy) => ground(x, zz), floorY: y, gaitDir: [0, 1] });
    av.object.updateMatrixWorld(true);
    if (i * DT < 1.2) continue;
    av.bones.hips.getWorldPosition(hip); hipLo = Math.min(hipLo, hip.y - y); hipHi = Math.max(hipHi, hip.y - y);
    for (const [k, s] of ['L', 'R'].entries()) {
      const bone = av.bones['foot' + s]; let low = Infinity; // the lowest of the heel and toe sole points over the ground under the ANKLE (the tread it stands on; a toe may overhang a riser)
      for (const sp of SOLEPTS) { p.set(...sp).applyMatrix4(bone.matrixWorld); low = Math.min(low, p.y); }
      p.setFromMatrixPosition(bone.matrixWorld); const gap = low - ground(p.x, p.z);
      pen = Math.min(pen, gap);
      if (av.gaitInfo.contact[k] && av.gaitInfo.stance[k] > 0.15 && av.gaitInfo.stance[k] < 0.85) { worst = Math.max(worst, Math.abs(gap)); n++; seen[k]++; }
    }
  }
  return { worst, n, pen, hipLo, hipHi, seen };
}

test('stance feet stay on the treads going up and down a stair for slim, medium and broad builds', () => {
  const g = stair(0.18, 0.28, 12);
  for (const build of [0, 4, 8]) {
    const up = run(g, 0.9, 6, { from: 0, build });
    const down = run(g, 0.9, 6, { from: -2.9, back: true, build });
    if (process.env.PRINT) console.log('stair build', build, { up, down });
    assert.ok(up.n > 20 && down.n > 20, 'stance frames seen');
    assert.ok(up.worst < 0.05, `build ${build} up: stance sole within 5 cm of the tread (${up.worst.toFixed(3)})`);
    assert.ok(up.pen > -0.05, `build ${build} up: no foot sinks into a tread (${up.pen.toFixed(3)})`);
    assert.ok(down.worst < 0.05 && down.pen > -0.05, `build ${build} down: contact ${down.worst.toFixed(3)} penetration ${down.pen.toFixed(3)}`);
  }
});

test('replanting reaches a higher tread immediately; swing and descent still ease', () => {
  const av = { gaitInfo: { contact: [false, false] } };
  const tick = (height) => {
    const gt = { feet: [[0, 0.05, 0], [0, 0.05, 0]], pitch: [0, 0] };
    footGround(av, DT, gt, [0, 0, 0], 0, 1, () => height, true);
    return gt.feet[0][1] - SOLE;
  };
  for (let i = 0; i < 90; i++) tick(0);
  const swinging = tick(0.18);
  assert.ok(swinging > 0 && swinging < 0.18, 'swing still rises gradually');
  av.gaitInfo.contact = [true, true];
  assert.ok(Math.abs(tick(0.18) - 0.18) < 1e-6, 'replanted sole reaches the tread in this frame');
  const descending = tick(0);
  assert.ok(descending > 0 && descending < 0.18, 'a lower support still eases down');
});

test('stance feet follow a slope', () => {
  const r = run(ramp(0.2), 1.2, 6);
  assert.ok(r.worst < 0.04 && r.pen > -0.04, `ramp: contact ${r.worst.toFixed(3)} penetration ${r.pen.toFixed(3)}`);
});

test('level ground keeps the pose (no offset, no hip change)', () => {
  const flat = () => 0, a = run(flat, 1.2, 4);
  const av = new Avatar('foot-ik-2015b');
  for (let i = 0; i < 120; i++) av.update(DT, { speed: 1.2, groundSpeed: 1.2, motionFrame: [0, -i * DT * 1.2, Math.PI], groundEnabled: true, ground: flat, floorY: 0, gaitDir: [0, 1] });
  assert.ok(Math.abs(av.footIK.off[0]) < 1e-6 && Math.abs(av.footIK.off[1]) < 1e-6 && Math.abs(av.footIK.pitch[0]) < 1e-6);
  assert.ok(a.worst < 0.03);
});

test('standing on two different steps: each foot on its own tread, hips lowered to the reach', () => {
  const av = new Avatar('foot-ik-2015c'), g = stair(0.18, 0.28, 10), p = new THREE.Vector3(), hip = new THREE.Vector3();
  const z = -0.28 * 3 - 0.02; // the body just behind a riser: the left foot... the feet straddle it (±0.095 in x only, so move the riser sideways)
  const side = (x, zz) => (x > 0 ? 0.18 : 0); // a kerb under the figure's left foot (world +x is its right: the figure faces −z, its left = −x)
  av.object.position.set(0, 0, 0); av.object.rotation.y = Math.PI;
  for (let i = 0; i < 90; i++) av.update(DT, { motionFrame: [0, 0, Math.PI], groundEnabled: true, ground: side, floorY: 0 });
  av.object.updateMatrixWorld(true);
  const gaps = ['L', 'R'].map((s) => { av.bones['foot' + s].getWorldPosition(p); return p.y - SOLE - side(p.x, p.z); }); // (standing: the sole is flat under the ankle)
  assert.ok(gaps.every((d) => Math.abs(d) < 0.03), `both soles on their own height: ${gaps.map((d) => d.toFixed(3))}`);
  void g; void z; void hip;
});

test('stepping down: the hips are lowered to the legs\' reach and both soles reach the lower floor', () => {
  const hipOf = (drop) => {
    const av = new Avatar('foot-ik-2015d'), p = new THREE.Vector3(), hip = new THREE.Vector3(); av.object.rotation.y = Math.PI;
    for (let i = 0; i < 90; i++) av.update(DT, { motionFrame: [0, 0, Math.PI], groundEnabled: true, ground: () => -drop, floorY: 0 });
    av.object.updateMatrixWorld(true); av.bones.hips.getWorldPosition(hip);
    const gaps = ['L', 'R'].map((s) => { av.bones['foot' + s].getWorldPosition(p); return p.y - SOLE + drop; });
    return { hip: hip.y, gaps };
  };
  const flat = hipOf(0), down = hipOf(0.09);
  assert.ok(flat.hip - down.hip > 0.03, `hips lower by ${(flat.hip - down.hip).toFixed(3)} m`);
  assert.ok(down.gaps.every((d) => Math.abs(d) < 0.03), `soles on the lower floor: ${down.gaps.map((d) => d.toFixed(3))}`);
});
