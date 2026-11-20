// #2233: Olof is 186 cm and his AVATAR_AGE step follows his birth date (OLOF.born) on the real local date.   node --test tools/olofage2233test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { OLOF, AVATAR_AGE, ageInYears, ageStepFromYears, avatarHeightCm, ageStepOf } from '../src/config.js';
import { olofLook } from '../src/olof.js';

const d = (y, m, day) => new Date(y, m - 1, day, 12);

test('age in years: the birthday counts, the day before does not', () => {
  assert.deepEqual(OLOF.born, [1983, 1, 6]);
  assert.equal(ageInYears(OLOF.born, d(2026, 11, 20)), 43);
  assert.equal(ageInYears(OLOF.born, d(2027, 1, 5)), 43);
  assert.equal(ageInYears(OLOF.born, d(2027, 1, 6)), 44);
  assert.equal(ageInYears(OLOF.born, d(2027, 1, 7)), 44);
  assert.equal(ageInYears(OLOF.born, d(2026, 1, 5)), 42);
  assert.equal(ageInYears(OLOF.born, d(2026, 1, 6)), 43);
  assert.equal(ageInYears(OLOF.born, d(2027, 12, 31)), 44);
});

test('years to step: 0 up to 25, one step per 5 years, capped', () => {
  const s = (y) => ageStepFromYears(y);
  assert.deepEqual([0, 10, 25].map(s), [0, 0, 0]);
  assert.deepEqual([26, 30, 31, 35, 36].map(s), [1, 1, 2, 2, 3]);
  assert.deepEqual([43, 44, 45, 46].map(s), [4, 4, 4, 5]);
  assert.equal(s(70), 9); assert.equal(s(71), AVATAR_AGE.steps - 1);
  assert.equal(s(120), AVATAR_AGE.steps - 1, 'the cap');
  assert.equal(s(NaN), 0); assert.equal(s(-3), 0);
  for (let y = 0; y < 150; y++) assert.ok(s(y) >= s(y - 1 < 0 ? 0 : y - 1) && s(y) < AVATAR_AGE.steps, 'monotonic, in range');
});

test('around 6 January he steps up only when the years pass a step border', () => {
  const step = (y, m, day) => olofLook(d(y, m, day)).age;
  assert.equal(step(2026, 11, 20), 4);
  assert.equal(step(2027, 1, 5), 4);
  assert.equal(step(2027, 1, 6), 4, '44: same step as 43');
  assert.equal(step(2028, 1, 5), 4); assert.equal(step(2028, 1, 6), 4, '45');
  assert.equal(step(2029, 1, 5), 4); assert.equal(step(2029, 1, 6), 5, '46: the first day of the next step');
  assert.equal(step(2053, 1, 5), 9, '69'); assert.equal(step(2054, 1, 5), 9, '70'); assert.equal(step(2054, 1, 6), 10, '71: the cap step');
  assert.equal(step(2200, 6, 1), AVATAR_AGE.steps - 1);
});

test('Olof\'s look: 186 cm, a valid age step, no new wire field', () => {
  const lk = olofLook(d(2026, 11, 20));
  assert.equal(lk.height, 186); assert.equal(avatarHeightCm(lk), 186);
  assert.equal(ageStepOf(lk), 4);
  assert.equal(olofLook().height, 186);
});
