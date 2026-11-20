// #2158: seated legs from the real seat height (src/seatlegs.js), function level, plus the real figure's IK reaching the feet.
//   node --test tools/seatlegs2158test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { seatedLegs, localFloor, seatPump } from '../src/seatlegs.js';
import { SEAT_LEGS, REST } from '../src/config.js';
import { Avatar } from '../src/avatar.js';
import { poseOlof, seatedPose, THIGH, SHIN } from '../src/olof.js';

const SEAT = REST.avatarSeat, HY = SEAT + 0.075, HZ = SEAT_LEGS.hipZ;
const reach = (f) => Math.hypot(HY - f[1], f[2] - HZ, Math.abs(f[0]) - 0.085);
// Real seats against the nominal 0.45: sofa 0.36, cinema chair 0.39, gaming chair 0.5, car seat 0.54 over a 0.315 cabin floor
const SEATS = { sofa: 0.45 - 0.36, cinema: 0.45 - 0.39, gaming: 0.45 - 0.5, car: 0.45 - (0.54 - 0.315) };

test('the nominal floor keeps seatedPose\'s feet', () => {
  const n = seatedPose(SEAT).feet, f = seatedLegs(SEAT, 0).feet;
  for (const i of [0, 1]) {
    assert.equal(f[i][0], n[i][0]);
    assert.ok(Math.abs(f[i][1] - n[i][1]) < 1e-9, 'ankle height');
    assert.ok(Math.abs(f[i][2] - n[i][2]) < 0.005, 'forward within 5 mm: ' + f[i][2]);
  }
});

test('feet rest on the real floor on low and slightly high seats; knees rise on low seats', () => {
  for (const [name, floor] of Object.entries(SEATS)) {
    const r = seatedLegs(SEAT, floor);
    assert.equal(r.dangle, 0, name);
    assert.ok(Math.abs(r.feet[0][1] - (floor + SEAT_LEGS.ankle)) < 1e-9, name + ': on the floor');
    assert.ok(reach(r.feet[0]) < THIGH + SHIN - 0.005 && reach(r.feet[0]) > Math.abs(THIGH - SHIN), name + ': reachable without a locked knee');
  }
  const sofa = seatedLegs(SEAT, SEATS.sofa), car = seatedLegs(SEAT, SEATS.car), nominal = seatedLegs(SEAT, 0), gaming = seatedLegs(SEAT, SEATS.gaming);
  assert.ok(car.thigh < sofa.thigh && sofa.thigh < nominal.thigh && nominal.thigh < gaming.thigh, 'the lower the seat, the higher the knees');
  assert.ok(car.feet[0][2] > sofa.feet[0][2] && sofa.feet[0][2] > nominal.feet[0][2], 'low seats put the feet further forward');
  assert.ok(car.feet[0][1] - nominal.feet[0][1] > 0.2, 'car: the feet on the cabin floor, ~0.22 m over the old floor-through position');
});

test('high seats: the feet reach down, then hang free', () => {
  const near = seatedLegs(SEAT, -0.06), far = seatedLegs(SEAT, -0.4);
  assert.equal(near.dangle, 0); assert.ok(Math.abs(near.feet[0][1] - (-0.06 + SEAT_LEGS.ankle)) < 1e-9, 'stretching to the floor');
  assert.equal(far.dangle, 1); assert.ok(far.feet[0][1] > -0.4 + SEAT_LEGS.ankle + 0.25, 'dangling well above the floor');
  assert.ok(reach(far.feet[0]) < THIGH + SHIN, 'reachable');
});

test('no jumps as the floor moves (1 mm steps from a bar stool to a car)', () => {
  let prev = null;
  for (let f = -0.6; f <= 0.3; f += 0.001) {
    const p = seatedLegs(SEAT, f).feet[0];
    if (prev) assert.ok(Math.hypot(p[1] - prev[1], p[2] - prev[2]) < 0.01, 'continuous at ' + f.toFixed(3));
    prev = [...p];
  }
});

test('swing pump: shins out going forward, tucked going back, never through the floor', () => {
  const floor = -0.03, still = seatedLegs(SEAT, floor).feet[0].slice(), fwd = seatedLegs(SEAT, floor, 1).feet[0].slice(), back = seatedLegs(SEAT, floor, -1).feet[0].slice();
  assert.ok(fwd[2] > still[2] + 0.15 && fwd[1] > still[1] + 0.05, 'forward: out and up');
  assert.ok(back[2] < still[2] - 0.1, 'backward: tucked under');
  assert.ok(back[1] >= floor + SEAT_LEGS.ankle - 1e-9, 'not through the floor');
  assert.equal(seatPump(0.5, 9), 0, 'vehicle speed: no pump');
  assert.equal(seatPump(-5, 2), -1); assert.ok(seatPump(0.55, 0.55) > 0.4);
});

test('localFloor: scaled, and nothing / above the hips falls back to the nominal floor', () => {
  assert.ok(Math.abs(localFloor(0, -0.09, 1) - 0.09) < 1e-12);
  assert.ok(Math.abs(localFloor(0, -0.09, 0.75) - 0.12) < 1e-12);
  assert.equal(localFloor(-Infinity, 0, 1), 0); assert.equal(localFloor(NaN, 0, 1), 0); assert.equal(localFloor(0.8, 0, 1), 0);
});

test('the real figure\'s IK puts the ankles where seatedLegs asks', () => {
  const av = new Avatar('seat2158');
  for (const [name, floor] of Object.entries(SEATS)) {
    const feet = seatedLegs(SEAT, floor).feet;
    poseOlof(av, { ...seatedPose(SEAT), feet });
    av.object.updateMatrixWorld(true);
    for (const [i, s] of [[0, 'L'], [1, 'R']]) {
      const at = av.object.worldToLocal(av.bones['foot' + s].getWorldPosition(new THREE.Vector3()));
      assert.ok(at.distanceTo(new THREE.Vector3(...feet[i])) < 0.01, `${name} ${s}: ${at.toArray().map((v) => v.toFixed(3))}`);
    }
  }
});

test('0.60 m seat (the storage box): an adult reaches the floor, a child dangles', () => {
  const rootY = 0, seatWorld = 0.6; // the root follows REST.avatarSeat * scale under the seat top
  for (const k of [1, 0.95, 1.05]) {
    const r = seatedLegs(SEAT, localFloor(0 - (seatWorld - SEAT * k), 0, k, SEAT));
    assert.equal(r.dangle, 0, 'adult scale ' + k);
    assert.ok(Math.abs(r.feet[0][1] - (localFloor(0 - (seatWorld - SEAT * k), 0, k, SEAT) + SEAT_LEGS.ankle)) < 1e-9, 'on the floor, scale ' + k);
  }
  const cf = localFloor(0 - (seatWorld - SEAT * 0.6), 0, 0.6, SEAT), child = seatedLegs(SEAT, cf);
  assert.ok(child.dangle > 0 && child.feet[0][1] - cf > 0.1, 'child (scale 0.6) dangles: ' + child.dangle);
});
