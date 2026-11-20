import test from 'node:test';
import assert from 'node:assert/strict';
import { mistDensity, mistFog, veilPlan } from './valleymist.js';

const calmMorning = { temp: 6, wind: 0.8, rain: 0, overcast: 0.1, sunY: 0.02, morning: true };
// a date the seeded chance accepts (autumn)
const dayWith = (extra) => { for (let d = 1; d < 29; d++) { const v = mistDensity({ ...calmMorning, ...extra, date: { year: 2026, month: 10, date: d } }); if (v > 0.3) return { year: 2026, month: 10, date: d }; } return null; };

test('fog code gives dense mist whatever the hour; wind only thins it', () => {
  assert.ok(mistDensity({ fog: 1, sunY: 1, morning: false, wind: 2 }) > 0.95);
  assert.ok(mistDensity({ fog: 1, wind: 14 }) < mistDensity({ fog: 1, wind: 2 }));
  assert.ok(mistDensity({ fog: 1, wind: 14 }) >= 0.49);
  assert.equal(mistDensity({ fog: 1, rain: 1 }), 0);
});
test('a calm cool clear morning has mist on some days and burns off as the sun rises', () => {
  const date = dayWith({}); assert.ok(date, 'some October day has morning mist');
  const at = (o) => mistDensity({ ...calmMorning, ...o, date });
  assert.ok(at({}) > 0.3 && at({}) <= 0.62);
  assert.ok(at({ sunY: 0.2 }) < at({ sunY: 0.02 }) && at({ sunY: 0.4 }) === 0);
  assert.equal(at({ wind: 6 }), 0); assert.equal(at({ temp: 20 }), 0); assert.equal(at({ overcast: 1 }), 0); assert.equal(at({ morning: false }), 0);
  assert.ok(at({ temp: 12 }) < at({ temp: 6 }));
});
test('only some days have morning mist (seeded per date, deterministic)', () => {
  let n = 0; for (let d = 1; d <= 30; d++) if (mistDensity({ ...calmMorning, date: { year: 2026, month: 10, date: d } }) > 0) n++;
  assert.ok(n > 8 && n < 28, `${n} of 30`);
  assert.equal(mistDensity({ ...calmMorning, date: { year: 2026, month: 10, date: 5 } }), mistDensity({ ...calmMorning, date: { year: 2026, month: 10, date: 5 } }));
});
test('fog distance: unchanged at 0, ~80 m at 1, in between a few hundred', () => {
  assert.deepEqual(mistFog(45, 650, 0), { far: 650, near: 45 });
  const f1 = mistFog(45, 650, 1), h = mistFog(45, 650, 0.5);
  assert.ok(Math.abs(f1.far - 80) < 1e-6 && f1.near < 10);
  assert.ok(h.far > 150 && h.far < 300);
  assert.ok(mistFog(45, 650, 0.6).far < mistFog(45, 650, 0.3).far);
});
test('veil plan: spacing scales the count, none at 0, deterministic, cards stay on the path', () => {
  assert.equal(veilPlan(900, 0).length, 0);
  const a = veilPlan(900, 60), b = veilPlan(900, 150);
  assert.ok(a.length > b.length && b.length >= 4);
  assert.deepEqual(veilPlan(900, 60), a);
  for (const c of a) assert.ok(c.s > 0 && c.s < 900 && c.len > 0 && c.wid > 0);
});
