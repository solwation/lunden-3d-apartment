// #2190: node --test tools/ambientbedtest.mjs  (the ambient bed's pure helpers: distance to a polyline, babble by distance / indoors,
// traffic level by hour, city hum by hour / indoors).
import test from 'node:test';
import assert from 'node:assert/strict';
const { AMBIENT_BED: A } = await import('../src/config.js');
const B = await import('../src/ambientbed.js');

test('distToPolyline: perpendicular, end-point and degenerate cases', () => {
  const path = [[0, 0], [10, 0], [10, 10]];
  assert.equal(B.distToPolyline(path, 5, 3), 3);
  assert.equal(B.distToPolyline(path, 13, 4), 3);
  assert.ok(Math.abs(B.distToPolyline(path, -3, -4) - 5) < 1e-9);
  assert.equal(B.distToPolyline([[1, 1]], 0, 0), Infinity);
  assert.equal(B.distToPolyline([[2, 2], [2, 2]], 5, 6), 5);
});

test('babble: full at the river, monotonically fading, silent at range, duller far away', () => {
  let prev = Infinity;
  for (const d of [0, 3, 6, 15, 30, 50, 70, 200]) { const g = B.riverBabbleParams({ dist: d }).gain; assert.ok(g <= prev + 1e-12, `rises at ${d}`); prev = g; }
  assert.equal(B.riverBabbleParams({ dist: 0 }).gain, A.river.gain);
  assert.equal(B.riverBabbleParams({ dist: A.river.range }).gain, 0);
  assert.equal(B.riverBabbleParams({}).gain, 0);
  assert.ok(B.riverBabbleParams({ dist: 8 }).hz > B.riverBabbleParams({ dist: 50 }).hz);
});

test('babble indoors: quieter and low-passed, still zero far away', () => {
  const o = B.riverBabbleParams({ dist: 5 }), i = B.riverBabbleParams({ dist: 5, indoors: true });
  assert.ok(i.gain < o.gain * 0.2 && i.hz <= A.indoor.hz);
});

test('traffic: night floor, day base, rush hours above midday, wraps the clock, stays 0…1', () => {
  const t = B.trafficLevel;
  assert.ok(t(3) < 0.2 && t(3) < t(12) / 3, 'nearly silent at night');
  assert.ok(t(8) > t(12) && t(17) > t(12) && t(8) > t(3) * 4, 'rush hour swells');
  assert.ok(Math.abs(t(27) - t(3)) < 1e-9 && Math.abs(t(-1) - t(23)) < 1e-9);
  for (let h = 0; h < 24; h += 0.25) { assert.ok(t(h) >= 0 && t(h) <= 1); }
});

test('city hum: louder and brighter by day than at night; indoors dulled once (own factor)', () => {
  const day = B.cityHumParams({ hour: 8 }), night = B.cityHumParams({ hour: 3 }), indoor = B.cityHumParams({ hour: 8, indoors: true });
  assert.ok(day.gain > 3 * night.gain && day.hz > night.hz);
  assert.ok(Math.abs(indoor.gain - day.gain * A.indoor.city) < 1e-12 && indoor.hz <= A.indoor.hzCity);
});
