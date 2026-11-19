// #2146: Olof at the wheel comes alive: steering angle from the path's curvature, where he looks (visitor / shoulder / road), the reverse look's rhythm,
// the hands going round with the wheel and the body's motion. Pure helpers (src/olofdrive.js).   node --test tools/olofdrivetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { curvature, wheelAngle, curveWindow, wheelHands, shoulderWeight, driverFocus, headToward, bodyMotion, wrapAngle } from '../src/olofdrive.js';
import { OLOF_DRIVE as D } from '../src/config.js';

test('curvature: sign and the heading wrap', () => {
  assert.ok(curvature(0, 0.4, 0, 4) > 0, 'a left turn (yaw grows) is positive');
  assert.ok(curvature(0.4, 0, 0, 4) < 0);
  assert.ok(Math.abs(curvature(3.0, -3.0, 0, 4) - wrapAngle(-6.0) / 4) < 1e-9, 'across ±π');
  assert.equal(curvature(0, 1, 2, 2), 0, 'no length: zero');
});

test('wheel angle follows the bend, flips when backing up, centres on a straight and is capped', () => {
  assert.equal(wheelAngle(0), 0);
  const l = wheelAngle(0.1), r = wheelAngle(-0.1);
  assert.ok(l > 0.3 && r < -0.3 && Math.abs(l + r) < 1e-9, `left ${l} right ${r}`);
  assert.ok(wheelAngle(0.05) < l, 'a gentler bend turns less');
  assert.ok(Math.abs(wheelAngle(0.1, true) + l) < 1e-9, 'reversing: the other way for the same bend');
  assert.equal(wheelAngle(5), D.maxWheel);
  assert.equal(wheelAngle(-5), -D.maxWheel);
});

test('curve window stays on one side of the reversing cusp and inside the path', () => {
  let [a, b] = curveWindow(10, 100, 12);
  assert.ok(a < 10 && b < 12 && b > 10 && a >= 0);
  [a, b] = curveWindow(12, 100, 12);
  assert.ok(a > 12 && b > a, 'at the cusp: the forward side');
  [a, b] = curveWindow(99.5, 100, 12);
  assert.ok(b <= 100 && a < b);
  [a, b] = curveWindow(0, 100, 0);
  assert.ok(a >= 0 && b > a);
});

test('the hands go round with the wheel (a left turn takes the left hand down) and stay a wheel radius apart from the centre', () => {
  const c = [0, 0.56, 0.4], [l0, r0] = wheelHands(c, 0.15, 0.42, 0);
  assert.deepEqual(l0, [0.15, 0.56, 0.4]); assert.deepEqual(r0, [-0.15, 0.56, 0.4]);
  const [l, r] = wheelHands(c, 0.15, 0.42, 0.8);
  assert.ok(l[1] < c[1] - 0.05 && r[1] > c[1] + 0.05, 'left hand down, right hand up');
  for (const h of [l, r]) assert.ok(Math.abs(Math.hypot(h[0] - c[0], h[1] - c[1], h[2] - c[2]) - 0.15) < 1e-9, 'stays on the rim');
  const [l2] = wheelHands(c, 0.15, 0.42, -0.8);
  assert.ok(l2[1] > c[1] + 0.05, 'turning right: the left hand goes up');
});

test('gaze target: the visitor when greeted or when parked close by, the shoulder while reversing, else the road', () => {
  assert.equal(driverFocus({ state: 'joke', parked: true, reversing: false, dist: 2 }), 'visitor');
  assert.equal(driverFocus({ state: 'joke', parked: true, reversing: false, dist: 40 }), 'visitor', 'greeted: always');
  assert.equal(driverFocus({ state: 'drive', parked: true, reversing: false, dist: D.range - 0.1 }), 'visitor');
  assert.equal(driverFocus({ state: 'drive', parked: true, reversing: false, dist: D.range + 1 }), 'road');
  assert.equal(driverFocus({ state: 'drive', parked: false, reversing: false, dist: 1 }), 'road', 'driving: eyes on the road');
  assert.equal(driverFocus({ state: 'drive', parked: false, reversing: true, dist: 1 }), 'shoulder');
  assert.equal(driverFocus({ state: 'joke', parked: false, reversing: true, dist: 1 }), 'shoulder', 'reversing wins');
  assert.equal(driverFocus({ state: 'drive', parked: true, reversing: false, dist: NaN }), 'road');
});

test('head toward a visitor: the head takes its share, within its limits, the sign follows the side', () => {
  const left = headToward(1, 0, 1), right = headToward(-1, 0, 1), ahead = headToward(0, 0, 2);
  assert.ok(left.turn > 0.5 && right.turn < -0.5 && Math.abs(left.turn + right.turn) < 1e-9);
  assert.ok(Math.abs(ahead.turn) < 1e-9 && Math.abs(ahead.pitch) < 1e-9);
  assert.ok(Math.abs(headToward(5, 0, -1).turn) <= D.maxTurn + 1e-9, 'capped');
  assert.ok(headToward(0, 1, 1).pitch > 0 && headToward(0, -1, 1).pitch < 0, 'up is positive');
  assert.ok(Math.abs(headToward(0, 9, 0.1).pitch) <= D.maxPitch + 1e-9);
});

test('look over the shoulder: held, with a short glance back to the road every few seconds', () => {
  assert.equal(shoulderWeight(0), 1);
  assert.equal(shoulderWeight(1), 1);
  const dip = shoulderWeight(D.forwardEvery - D.forwardFor / 2);
  assert.ok(dip < 0.2, `the glance forward at its middle: ${dip}`);
  assert.ok(Math.abs(shoulderWeight(D.forwardEvery) - 1) < 1e-9, 'back again at the next period');
  for (let t = 0; t < 20; t += 0.05) { const w = shoulderWeight(t); assert.ok(w >= 0 && w <= 1 + 1e-9); }
});

test('body motion: forward on braking, back on starting, to the outside of a bend, capped', () => {
  assert.ok(bodyMotion(2, 0).lean > 0 && bodyMotion(-2, 0).lean < 0);
  assert.ok(bodyMotion(0, 2).roll > 0 && bodyMotion(0, -2).roll < 0);
  assert.equal(bodyMotion(0, 0).lean, 0);
  assert.equal(bodyMotion(100, 100).lean, D.maxLean);
  assert.equal(bodyMotion(-100, -100).roll, -D.maxRoll);
});
