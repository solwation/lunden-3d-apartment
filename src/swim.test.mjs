// #1943: the pure swimming rules: the current runs downstream along the centre line, the same input is faster with it than against
// it, an idle swimmer drifts, and the edge decision (climb / last-resort rescue).   node --test src/swim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIM, SITE } from './config.js';
import { currentDir, current, swimVelocity, exitDecision, swimEye } from './swim.js';

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
