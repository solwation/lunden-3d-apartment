// #2192: node --test tools/catresttest.mjs  (where a cat sleeps: sun patch from the window, warm zone, the plan of the moment)
import test from 'node:test';
import assert from 'node:assert/strict';
import { windowsOf, sunStrength, sunOnFloor, inWarmZone, isEvening, restPlan, pickOne } from '../src/catrest.js';
import { sunDirection } from '../src/daycycle.js';

// a south window (room to the north of it): glass z 6.0, inner z 5.8, x 2 … 4, sill 0.9 … 2.1 over a floor at 0
const south = { x0: 2, x1: 4, y0: 0.9, y1: 2.1, glass: 6.0, inner: 5.8, room: -1 };
const sun = (y, x = 0, z = 1) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };

test('windowsOf keeps windows only', () => {
  const w = windowsOf({ north: [{ x0: 1, x1: 2, y0: 1, y1: 2, win: {}, glass: 0.1, inner: 0.3 }, { x0: 0, x1: 1, y0: 0, y1: 2, entryPane: true }], south: [{ x0: 3, x1: 4, y0: 1, y1: 2, win: {}, glass: 8, inner: 7.8 }] });
  assert.equal(w.length, 2); assert.equal(w[0].room, 1); assert.equal(w[1].room, -1);
  assert.deepEqual(windowsOf(null), []);
});

test('sun patch: the floor in line with the window is lit, beside it and behind a wall is not', () => {
  const d = sun(0.5); // from the south, 30 deg up: rays land ~ z - dz on the floor
  // floor point 2.5 m in from the window, ray rises 0.5/0.866 per m of z: reaches y 0.9 … 2.1 at t where... pick by geometry
  const lit = [], dark = [];
  for (let z = 2; z < 5.7; z += 0.1) for (let x = 0; x < 6; x += 0.1) (sunOnFloor(d, [south], x, 0, z) ? lit : dark).push([x, z]);
  assert.ok(lit.length > 20, 'a patch exists');
  assert.ok(lit.every(([x]) => x > 1.5 && x < 4.5), 'inside the window width plus the oblique shift');
  assert.ok(dark.some(([x]) => x < 1), 'beside the window is dark');
  // the patch moves with the sun: a lower sun reaches further in
  const far = (s) => Math.min(...[...Array(60)].map((_, i) => 5.7 - i * 0.1).filter((z) => sunOnFloor(s, [south], 3, 0, z)));
  assert.ok(far(sun(0.25)) < far(sun(0.8)), 'a low sun reaches deeper');
});

test('no patch with the sun down, behind the window or with no windows', () => {
  assert.equal(sunOnFloor(sun(-0.2), [south], 3, 0, 4), false);
  assert.equal(sunOnFloor(sun(0.5, 0, -1), [south], 3, 0, 4), false, 'sun on the other side of the house');
  assert.equal(sunOnFloor(sun(0.5), [], 3, 0, 4), false);
  assert.equal(sunOnFloor(null, [south], 3, 0, 4), false);
});

test('real sun: over a summer day some hour lights the floor through a window, midnight never', () => {
  const north = { ...south, glass: 0.0, inner: 0.2, room: 1 }, lit = (d, w) => { let n = 0; for (let z = 0.3; z < 5.7; z += 0.1) for (let x = 0; x < 6; x += 0.1) if (sunOnFloor(d, [w], x, 0, z)) n++; return n; };
  const hours = [...Array(24)].map((_, h) => h);
  assert.equal(hours.filter((h) => sunDirection(h, 180).y < 0).reduce((n, h) => n + lit(sunDirection(h, 180), south) + lit(sunDirection(h, 180), north), 0), 0);
  assert.ok(hours.some((h) => lit(sunDirection(h, 180), south) > 0 || lit(sunDirection(h, 180), north) > 0));
});

test('warm zone is the floor strip in front of the window', () => {
  assert.equal(inWarmZone([south], 3, 5.5), true);
  assert.equal(inWarmZone([south], 3, 4.0), false);
  assert.equal(inWarmZone([south], 3, 6.2), false, 'outside the wall');
  assert.equal(inWarmZone([south], 5, 5.5), false);
});

test('plan of the moment: sun, then evening bed, else radiator; clouds cancel the sun', () => {
  assert.equal(restPlan({ sunDir: sun(0.7), overcast: 0, hour: 14 }).mode, 'sun');
  assert.equal(restPlan({ sunDir: sun(0.7), overcast: 0.9, hour: 14 }).mode, 'warm');
  assert.equal(restPlan({ sunDir: sun(-0.3), hour: 19 }).mode, 'bed');
  assert.equal(restPlan({ sunDir: sun(-0.3), hour: 3 }).mode, 'bed');
  assert.equal(restPlan({ sunDir: sun(-0.3), hour: 10 }).mode, 'warm');
  assert.equal(isEvening(17.4), false); assert.equal(isEvening(17.5), true);
});

test('finite and bounded for any input', () => {
  for (const v of [NaN, Infinity, -Infinity, 1e9, undefined]) {
    const s = sunStrength({ y: v }, v); assert.ok(s >= 0 && s <= 1);
    assert.equal(typeof sunOnFloor({ x: v, y: v, z: v }, [south], v, v, v), 'boolean');
    assert.ok(['sun', 'bed', 'warm'].includes(restPlan({ sunDir: { y: v }, overcast: v, hour: v }).mode));
  }
  assert.equal(pickOne([1, 2, 3], 0), 1); assert.equal(pickOne([1, 2, 3], 1), 3); assert.equal(pickOne([], 0.5), undefined); assert.equal(pickOne([1, 2], NaN), 1);
});
