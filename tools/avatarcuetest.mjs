// #2162: the billiard aiming pose of a remote figure: bridge hand near the cue tip, stroke hand on the butt, pull-back grows with power,
// forward on the shot, a bounded lean. Run: node --test tools/avatarcuetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cueArms, strokePull, newCueArms } from '../src/avatarcue.js';
import { CUE_ARM as C, PLAYROOM } from '../src/config.js';

const B = PLAYROOM.billiards;
// a cue pointing forward (+z) from the figure: tip 0.6 m ahead at 0.95 m, the butt toward the figure (axis tip→butt = -z, rising 0.12)
const u = [0, 0.12 / Math.hypot(1, 0.12), -1 / Math.hypot(1, 0.12)], tip = [0, 0.95, 0.62];
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const at = (s, pull = 0) => tip.map((v, i) => v + u[i] * (s + pull));

test('bridge hand sits near the tip (left), stroke hand further back on the cue (right)', () => {
  const A = cueArms(tip, u, 0);
  assert.ok(d(A.L.at, at(C.bridgeS)) < 0.02, 'bridge on the cue line, bridgeS from the tip');
  assert.ok(d(A.R.at, at(C.gripS)) < 0.02, 'stroke hand at the grip');
  assert.ok(d(A.L.at, tip) < d(A.R.at, tip), 'bridge nearer the tip than the butt hand');
  assert.ok(A.L.pole[0] > 0 && A.R.pole[0] < 0, 'elbows out to their own side');
});
test('pull-back: the stroke hand goes back with power, the bridge hand stays put', () => {
  const a0 = cueArms(tip, u, 0, newCueArms()), a1 = JSON.parse(JSON.stringify(cueArms(tip, u, B.chargePull)));
  assert.ok(d(a1.R.at, a0.R.at) > B.chargePull * 0.9, 'right hand moved about the pull');
  assert.ok(a1.R.at[2] < a0.R.at[2], 'back (towards the figure)');
  assert.deepEqual(a1.L.at, a0.L.at);
  const mid = cueArms(tip, u, B.chargePull / 2);
  assert.ok(mid.R.at[2] < a0.R.at[2] && mid.R.at[2] > a1.R.at[2], 'monotone in the power');
});
test('stroke: from the pulled position forward through the ball, then done; no stroke before or after', () => {
  const p0 = B.chargePull;
  assert.equal(strokePull(p0, -0.1), null); assert.equal(strokePull(p0, 5), null);
  assert.ok(Math.abs(strokePull(p0, 0) - p0) < 1e-9);
  assert.ok(strokePull(p0, B.strokeSeconds * 0.5) < p0 * 0.5, 'coming forward');
  assert.ok(strokePull(p0, B.strokeSeconds * 0.5) < strokePull(p0, B.strokeSeconds * 0.2));
  assert.ok(strokePull(p0, B.strokeSeconds * 0.8) < 0, 'the cue goes past the rest tip (through the ball)');
  const f = cueArms(tip, u, strokePull(p0, B.strokeSeconds * 0.8));
  assert.ok(f.R.at[2] > cueArms(tip, u, p0).R.at[2], 'the stroke hand ends further forward than where it started');
});
test('lean: forward, at least the base bend, bounded however far the table is', () => {
  const near = cueArms(tip, u, 0);
  assert.ok(near.lean <= -C.leanBase + 1e-9 && near.lean >= -C.leanMax);
  const far = cueArms([0, 0.95, 3], u, 0.14);
  assert.ok(far.lean >= -C.leanMax - 1e-12 && far.lean <= near.lean, 'bends more, never beyond the cap');
  const nan = cueArms([0, 0.95, 0], [0, 0, 1], 0);
  assert.ok(Number.isFinite(nan.lean) && nan.lean < 0);
});
test('hands never ask more than the arm reach from the shoulder', () => {
  for (const z of [0.3, 0.6, 1, 2, 5]) {
    const a = cueArms([0, 0.95, z], u, 0.1);
    assert.ok(d(a.L.at, [C.shoulderX, C.shoulderY, 0]) <= C.reach + 1e-9);
    assert.ok(d(a.R.at, [-C.shoulderX, C.shoulderY, 0]) <= C.reach + 1e-9);
  }
});
