// #2172: the avatars' stair gait: lean / knee lift / shorter steps from the ground slope and direction, and the handrail target from registered geometry.
// node --test tools/avatarstairstest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { stairTerms, stepStair, newStair, slopeAlong, nearestRail, railTarget, registerRail, thinRail, clearRails, railCount, toFigure } from '../src/avatarstairs.js';
import { AVATAR_STAIRS as K } from '../src/config.js';

test('flat ground and a gentle ramp: no stair gait', () => {
  for (const c of [0, 0.05, -0.1, 0.15]) {
    const o = stairTerms(c, 1.2);
    assert.equal(o.lean, 0); assert.equal(o.lift, 0); assert.equal(o.shrink, 1); assert.equal(o.hip, 0);
  }
});

test('up a stair: forward lean, extra knee lift, a slightly shorter stride, sunk hips', () => {
  const o = stairTerms(0.55, 1.1);
  assert.ok(Math.abs(o.lean - K.upLean) < 1e-9 && o.lean > 0.1, `lean ${o.lean}`);
  assert.ok(Math.abs(o.lift - K.upLift) < 1e-9 && o.lift > 0.04, `lift ${o.lift}`);
  assert.ok(o.shrink < 1 && o.shrink > K.downShrink, `shrink ${o.shrink}`);
  assert.ok(o.hip > 0);
});

test('down a stair: backward lean, shorter careful steps than going up, bent knees', () => {
  const u = stairTerms(0.55, 1.1), d = stairTerms(-0.55, 1.1);
  assert.ok(d.lean < -0.05 && d.lean > -u.lean, `lean ${d.lean}`);
  assert.ok(d.shrink < u.shrink && d.shrink < 0.85, `shrink ${d.shrink}`);
  assert.ok(d.lift < u.lift && d.hip > u.hip);
});

test('it scales with the walking speed: standing / creeping gives nothing, a steady walk full strength', () => {
  assert.equal(stairTerms(0.55, 0).lean, 0);
  const slow = stairTerms(0.55, 0.4).lean, fast = stairTerms(0.55, 1.2).lean;
  assert.ok(slow > 0 && slow < fast && Math.abs(fast - K.upLean) < 1e-9);
});

test('the slope is read from the ground ahead and behind; the sign of travel decides up or down', () => {
  assert.ok(Math.abs(slopeAlong(0.31, 0, 0.4) - 0.3875) < 1e-9);
  assert.ok(Number.isNaN(slopeAlong(NaN, 0, 0.4)));
  const dt = 1 / 60, up = newStair(), back = newStair();
  let a, b;
  for (let i = 0; i < 60; i++) { a = stepStair(up, dt, { slope: 0.5, dir: 1, speed: 1.1 }); b = stepStair(back, dt, { slope: 0.5, dir: -1, speed: 1.1 }); }
  assert.ok(a.lean > 0.15 && b.lean < -0.05, 'walking backwards up the slope is a descent for the body');
  for (let i = 0; i < 90; i++) a = stepStair(up, dt, { slope: 0, dir: 1, speed: 1.1 });
  assert.ok(Math.abs(a.lean) < 1e-3, 'back on the flat it fades out');
  for (let i = 0; i < 90; i++) a = stepStair(up, dt, { slope: 0.5, dir: 1, speed: 1.1, on: false });
  assert.equal(a.lean, 0, 'off (air, crouch...) no terms');
});

// a straight rail up the +z direction 0.5 m to the figure's left (x = +0.4 world at yaw 0 is... the figure at yaw 0 faces +z, its left is +x)
test('rail target: a rail within reach on the left gives the left hand at the rail point, in the figure frame', () => {
  clearRails();
  registerRail([[0.4, 1.0, 0], [0.4, 1.4, 3]]);
  const t = railTarget([0, 0, 0], 0, 1);
  assert.ok(t && t.side === 1, 'left hand');
  assert.ok(Math.abs(t.at[0] - 0.4) < 1e-6 && Math.abs(t.at[2] - K.ahead) < 1e-6, `at ${t.at}`);
  assert.ok(t.at[1] > 1.0 && t.at[1] < 1.1, `height ${t.at[1]}`); // the rail 0.3 m ahead is 1.04 m over the root
  clearRails();
  registerRail([[-0.4, 1.0, 0], [-0.4, 1.4, 3]]);
  assert.equal(railTarget([0, 0, 0], 0, 1).side, -1, 'right hand');
});

test('rail target: none when too far, too high / low (another storey) or no rail registered', () => {
  clearRails();
  assert.equal(railTarget([0, 0, 0], 0, 1), null);
  registerRail([[1.5, 1.0, 0], [1.5, 1.4, 3]]); // 1.5 m away
  assert.equal(railTarget([0, 0, 0], 0, 1), null);
  clearRails();
  registerRail([[0.4, 3.9, 0], [0.4, 4.2, 3]]); // the next storey's rail
  assert.equal(railTarget([0, 0, 0], 0, 1), null);
  clearRails();
  registerRail([[0.05, 1.0, 0], [0.05, 1.3, 3]]); // through the body
  assert.equal(railTarget([0, 0, 0], 0, 1), null);
});

test('rail target follows the figure heading and slides along the rail as it walks', () => {
  clearRails();
  registerRail([[3, 1, 0], [3, 2, 6]]); // x = 3, rising towards +z
  // a figure at x = 2.6 heading +x... use heading +z (yaw 0): rail is at +x = its left
  const a = railTarget([2.6, 0.5, 0], 0.5, 1), b = railTarget([2.6, 2.5, 0], 0.7, 1);
  assert.ok(a && b && b.world[2] > a.world[2] + 1.5, 'the grip point moves up the rail with the figure');
  // turned round (yaw pi): the same rail is on its right
  assert.equal(railTarget([2.6, 2.5, Math.PI], 0.7, 1).side, -1);
});

test('registering the same rail twice keeps one; thinRail keeps the ends', () => {
  clearRails();
  const r = [[0, 1, 0], [0, 1.1, 1]];
  registerRail(r); registerRail(r.map((p) => p.slice()));
  assert.equal(railCount(), 1);
  const dense = Array.from({ length: 301 }, (_, i) => [0, 1, i * 0.01]), th = thinRail(dense, 0.2);
  assert.deepEqual(th[0], dense[0]); assert.deepEqual(th.at(-1), dense.at(-1)); assert.ok(th.length < 20);
  assert.ok(Math.abs(toFigure(1, 0, 0, 1)[0] - 1) < 1e-9);
});
