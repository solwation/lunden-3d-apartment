// #1944: the dive: crouch held goes down to SWIM.dive.eyeOverBed over the bed, released always comes up, a rising bed lifts the diver.
// #1943: the pure swimming rules: the current runs downstream along the centre line, the same input is faster with it than against
// it, an idle swimmer drifts, and the edge decision (climb / last-resort rescue).   node --test src/swim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIM, SITE } from './config.js';
import { currentDir, current, swimVelocity, exitDecision, swimEye, diveMax, diveStep, isDiving } from './swim.js';

// A river frame like riverbridge.js riverAt builds for the segment a -> b: normal (-dz, dx) / len.
const frame = ([ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); return { nx: -dz / l, nz: dx / l, dx: dx / l, dz: dz / l }; };
const R = SITE.river, path = R.path.concat(R.downstream?.path ?? []);

test('the current follows the centre line downstream on every segment (east -> west, the way the water level falls)', () => {
  assert.ok(R.fall.perM > 0, 'the water line falls with the chainage');
  assert.ok(path[0][0] > path.at(-1)[0], 'the path starts upstream in the east and ends at the west edge');
  for (let i = 1; i < path.length; i++) {
    const f = frame(path[i - 1], path[i]), d = currentDir(f), c = current(f);
    assert.ok(Math.abs(d.x - f.dx) < 1e-12 && Math.abs(d.z - f.dz) < 1e-12, `segment ${i}: along the path`);
    assert.ok(Math.abs(Math.hypot(c.x, c.z) - SWIM.current) < 1e-12);
  }
});

test('downstream is noticeably faster than upstream for the same input; sideways keeps the drift', () => {
  const f = frame(path[8], path[9]), d = currentDir(f);
  const down = swimVelocity(d.x, d.z, 1, f), vDown = Math.hypot(down.x, down.z);
  const up = swimVelocity(-d.x, -d.z, 1, f), vUp = Math.hypot(up.x, up.z);
  assert.ok(Math.abs(vDown - (SWIM.speed + SWIM.current)) < 1e-9 && Math.abs(vUp - (SWIM.speed - SWIM.current)) < 1e-9);
  assert.ok(vDown > vUp * 1.5, `down ${vDown} vs up ${vUp}`);
  assert.ok(up.x * d.x + up.z * d.z < 0, 'a full stroke still makes way against the current');
  const across = swimVelocity(f.nx, f.nz, 1, f);
  assert.ok(Math.abs(across.x * d.x + across.z * d.z - SWIM.current) < 1e-9, 'carried downstream while crossing');
  assert.ok(Math.abs(across.x * f.nx + across.z * f.nz - SWIM.speed) < 1e-9);
});

test('an idle swimmer drifts slowly downstream; the input amount scales only the stroke; no sprint', () => {
  const f = frame(path[3], path[4]), d = currentDir(f);
  const idle = swimVelocity(0, 0, 0, f);
  assert.ok(Math.abs(idle.x - d.x * SWIM.current) < 1e-12 && Math.abs(idle.z - d.z * SWIM.current) < 1e-12);
  assert.ok(SWIM.current > 0.1 && SWIM.current < SWIM.speed, 'slight: a swimmer can beat it');
  const half = swimVelocity(d.x * 3, d.z * 3, 0.5, f); // (any length of the direction)
  assert.ok(Math.abs(Math.hypot(half.sx, half.sz) - SWIM.speed / 2) < 1e-9);
  const over = swimVelocity(d.x, d.z, 7, f);
  assert.ok(Math.abs(Math.hypot(over.sx, over.sz) - SWIM.speed) < 1e-9, 'amount is clamped: nothing swims faster than SWIM.speed');
});

test('the edge: climb where a bank is in reach, rescue only after SWIM.rescueAfter s against an edge with no way up', () => {
  const st = {};
  assert.equal(exitDecision(st, { blocked: false, pushing: true, bank: null, dt: 0.1 }), 'swim');
  assert.equal(exitDecision(st, { blocked: true, pushing: false, bank: { x: 0, z: 0 }, dt: 0.1 }), 'swim', 'drifting against a bank is no wish to get out');
  assert.equal(exitDecision(st, { blocked: true, pushing: true, bank: { x: 0, z: 0 }, dt: 0.1 }), 'climb');
  let n = 0, last = 'swim';
  while (last === 'swim' && n < 1000) { last = exitDecision(st, { blocked: true, pushing: true, bank: null, dt: 0.1 }); n++; }
  assert.equal(last, 'rescue');
  assert.ok(Math.abs(n * 0.1 - SWIM.rescueAfter) < 0.11, `after ${n * 0.1} s`);
  assert.equal(st.stuck, 0);
  for (let i = 0; i < 20; i++) exitDecision(st, { blocked: true, pushing: true, bank: null, dt: 0.1 });
  exitDecision(st, { blocked: false, pushing: true, bank: null, dt: 0.1 }); // free again: the count starts over
  assert.equal(st.stuck, 0);
});

test('the eye floats just above the surface; a depth lowers it (the dive hook)', () => {
  for (let t = 0; t < 3; t += 0.05) { const e = swimEye(t); assert.ok(e > 0.05 && e < 0.25, `eye ${e}`); }
  assert.ok(swimEye(0, 1) < 0);
});

// #1944
const DEEP = 0.6 + SITE.bridges.pool; // the water's depth at the centre line (riverbridge.js riverGround)
const eyeOver = (depth) => SWIM.eye - depth; // the eye over the water line (without the bob)

test('the dive: held crouch goes down at SWIM.dive.rate to SWIM.dive.eyeOverBed over the bed and stays there', () => {
  assert.ok(DEEP >= 1.5, `mid-channel is deep enough to dive in (${DEEP} m)`);
  let d = 0, t = 0; const dt = 1 / 60;
  assert.ok(!isDiving(d));
  d = diveStep(d, true, DEEP, dt); assert.ok(Math.abs(d - SWIM.dive.rate * dt) < 1e-12);
  while (t < 5) { d = diveStep(d, true, DEEP, dt); t += dt; assert.ok(eyeOver(d) + DEEP >= SWIM.dive.eyeOverBed - 1e-9, 'never closer to the bed'); }
  assert.ok(Math.abs(eyeOver(d) + DEEP - SWIM.dive.eyeOverBed) < 1e-9, 'at the bed limit');
  assert.equal(d, diveMax(DEEP));
  assert.ok(isDiving(d) && eyeOver(d) < -1, `the eye is ${-eyeOver(d)} m under the surface`);
  assert.ok(swimEye(0, d) < -1);
});

test('the dive: letting go always reaches the surface, from any depth, in bounded time', () => {
  for (const water of [0.3, 0.6, 1, DEEP, 5]) {
    let d = diveMax(water), t = 0; const dt = 1 / 30;
    while (d > 0 && t < 10) { d = diveStep(d, false, water, dt); t += dt; }
    assert.equal(d, 0); assert.ok(t <= diveMax(water) / SWIM.dive.rate + 2 * dt, `up from ${water} m in ${t} s`);
    assert.ok(!isDiving(d) && swimEye(0, d) > 0);
  }
});

test('the dive: a rising bed lifts the diver at once; the shallows allow no dive', () => {
  let d = diveMax(DEEP);
  d = diveStep(d, true, 0.8, 0); // (dt 0: the limit alone, as player.js applies it after the stroke)
  assert.equal(d, diveMax(0.8)); assert.ok(eyeOver(d) + 0.8 >= SWIM.dive.eyeOverBed - 1e-9);
  assert.equal(diveMax(0.2), 0); assert.equal(diveStep(0.5, true, 0.2, 1 / 60), 0, 'no room: at the surface');
  assert.equal(diveStep(0, false, DEEP, 1), 0);
  assert.ok(!isDiving(SWIM.eye) && isDiving(SWIM.eye + SWIM.dive.under + 0.01), 'diving = the eye SWIM.dive.under m below the water line');
});
