import test from 'node:test';
import assert from 'node:assert/strict';
import { newSpear, fireSpear, stepSpear, stickSpear, recallSpear, reelSpear, spearHit } from './harpoonflight.js';

const C = { speed: 20, drag: 1, sink: 0.5, gravity: 9.81, line: 10, flight: 2.5, stuck: 0.3, reel: 10 };
const M = { x: 0, y: 0, z: 0 };

test('fires only from the gun, at full speed along the aim', () => {
  const st = newSpear();
  assert.equal(fireSpear(st, [0, 0, 0], [0, 0, -2], C), true);
  assert.equal(st.phase, 'out');
  assert.deepEqual([st.vx, st.vy, st.vz], [0, 0, -20]);
  assert.equal(fireSpear(st, [0, 0, 0], [1, 0, 0], C), false, 'no second shot while it is out');
  assert.equal(fireSpear(newSpear(), [0, 0, 0], [0, 0, 0], C), false, 'no direction');
});

test('under water it is slowed and stops at the end of the line, never beyond', () => {
  const st = newSpear(); fireSpear(st, [0, 0, 0], [1, 0, 0], C);
  let ev = null, far = 0, n = 0;
  while (!ev && n++ < 1000) { ev = stepSpear(st, 0.02, M, true, C); far = Math.max(far, Math.hypot(st.x, st.y, st.z)); }
  assert.equal(ev, 'taut'); assert.equal(st.phase, 'back');
  assert.ok(far <= C.line + 1e-9, `within the line (${far})`);
  assert.ok(far > 8, `it got most of the way (${far})`);
});

test('in the air it falls; in the water it barely sinks', () => {
  const air = newSpear(), wet = newSpear();
  fireSpear(air, [0, 0, 0], [1, 0, 0], C); fireSpear(wet, [0, 0, 0], [1, 0, 0], C);
  for (let i = 0; i < 10; i++) { stepSpear(air, 0.02, M, false, C); stepSpear(wet, 0.02, M, true, C); }
  assert.ok(air.y < -0.15 && wet.y > -0.03 && wet.y < 0, `${air.y} ${wet.y}`);
  assert.ok(wet.x < air.x, 'the water slows it');
});

test('the line is measured from where the gun is now', () => {
  const st = newSpear(); fireSpear(st, [0, 0, 0], [1, 0, 0], C);
  stepSpear(st, 0.1, M, true, C);
  assert.equal(stepSpear(st, 0.01, { x: -9, y: 0, z: 0 }, true, C), 'taut'); // (the shooter backed away: the line is out)
  assert.ok(Math.abs(Math.hypot(st.x + 9, st.y, st.z) - C.line) < 1e-9);
});

test('stuck in something solid, then reeled all the way back before the next shot', () => {
  const st = newSpear(); fireSpear(st, [0, 0, 0], [0, 0, 1], C);
  stepSpear(st, 0.05, M, true, C);
  assert.equal(stickSpear(st, { x: 0, y: -1, z: 3 }), true);
  assert.equal(reelSpear(st, 0.2, M, C), false); assert.equal(st.phase, 'stuck');
  assert.equal(reelSpear(st, 0.2, M, C), false); assert.equal(st.phase, 'back');
  let back = false, n = 0;
  while (!back && n++ < 200) { assert.equal(fireSpear(st, [0, 0, 0], [0, 0, 1], C), false); back = reelSpear(st, 0.02, M, C); }
  assert.equal(back, true); assert.equal(st.phase, 'ready');
  assert.ok(n >= 15 && n <= 17, `~3.16 m at 10 m/s (${n} frames)`);
  assert.equal(fireSpear(st, [0, 0, 0], [0, 0, 1], C), true);
});

test('a hit recalls it at once', () => {
  const st = newSpear();
  assert.equal(recallSpear(st), false);
  fireSpear(st, [0, 0, 0], [0, 0, 1], C);
  assert.equal(recallSpear(st), true); assert.equal(st.phase, 'back');
});

test('spearHit: the first target along the step within its radius', () => {
  const a = { x: 0, y: 0, z: 0 }, b = { x: 2, y: 0, z: 0 };
  assert.equal(spearHit(a, b, []), null);
  assert.equal(spearHit(a, b, [{ x: 1, y: 0.5, z: 0, r: 0.3 }]), null);
  assert.deepEqual(spearHit(a, b, [{ x: 1.5, y: 0.1, z: 0, r: 0.3 }, { x: 0.5, y: 0, z: 0.2, r: 0.3 }]), { i: 1, k: 0.25 });
  assert.equal(spearHit(a, b, [{ x: 2.2, y: 0, z: 0, r: 0.3 }]).k, 1, 'just past the end counts at the end');
  assert.equal(spearHit(a, b, [{ x: 3, y: 0, z: 0, r: 0.3 }]), null);
  assert.deepEqual(spearHit(a, a, [{ x: 0.1, y: 0, z: 0, r: 0.3 }]), { i: 0, k: 0 }, 'a zero-length step');
});
