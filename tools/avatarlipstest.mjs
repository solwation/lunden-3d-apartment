import test from 'node:test';
import assert from 'node:assert/strict';
import { lipPoint, lipSeamPoint } from '../src/avatarlips.js';

const front = (x, y) => 0.1 - x * x + y * 0.03;
test('#2065 rounded lips seal to their skin bridge and keep closed corners', () => {
  for (const u of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    for (const upper of [true, false]) {
      assert.deepEqual(lipPoint(u, 1, upper, false, front), lipPoint(u, 0, upper, true, front));
      for (const skin of [false, true]) for (const v of [0, 0.5, 1]) {
        assert(lipPoint(u, v, upper, skin, front).every(Number.isFinite));
      }
    }
    assert.deepEqual(lipPoint(u, 0, true, false, front), lipPoint(u, 0, false, false, front));
  }
});
test('#2065 a fuller lower lip projects in profile while the dark seam stays behind the belly', () => {
  const upper = lipPoint(0.5, 0.5, true, false, front), lower = lipPoint(0.5, 0.5, false, false, front);
  const seam = lipSeamPoint(0.5, 0.5, front);
  assert(lower[2] > upper[2] + 0.001);
  assert(upper[2] > seam[2] + 0.001);
  assert(lower[2] > seam[2] + 0.003);
});
