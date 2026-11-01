// #1767: the outdoor cats' loops are a pure function of the clock. node --test src/outdoorcatroute.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { routePlan, catAt, routeSamples, ACTIVITIES } from './outdoorcatroute.js';

const route = [[0, 0], [4, 0], [4, 3]], rest = [10, 20, 30], plan = routePlan(route, rest, 0.5);

test('a lap is the walking time plus the rests', () => {
  assert.equal(plan.legs.length, 3);
  assert.ok(Math.abs(plan.period - ((4 + 3 + 5) / 0.5 + 60)) < 1e-9);
});

test('the same clock gives the same place and activity (every client agrees)', () => {
  for (const T of [0, 7.3, 123.4, 99999]) assert.deepEqual(catAt(plan, T, 2), catAt(plan, T, 2));
  const a = catAt(plan, 50), b = catAt(plan, 50 + plan.period * 3); // the same lap every time
  assert.deepEqual([a.x, a.z, a.walking, a.leg], [b.x, b.z, b.walking, b.leg]);
});

test('walking along a leg, resting at its end', () => {
  const a = catAt(plan, 4); // 2 m along the first leg
  assert.ok(a.walking && Math.abs(a.x - 2) < 1e-9 && a.z === 0);
  const r = catAt(plan, 8 + 5); // resting at [4, 0]
  assert.ok(!r.walking && r.x === 4 && r.z === 0 && ACTIVITIES.includes(r.activity) && r.restLeft > 0);
});

test('it never leaves the loop', () => {
  const pts = routeSamples(route, 0.1);
  for (let T = 0; T < plan.period * 2; T += 0.7) {
    const s = catAt(plan, T, 1);
    assert.ok(pts.some(([x, z]) => Math.hypot(x - s.x, z - s.z) < 0.11), `T ${T}`);
  }
});
