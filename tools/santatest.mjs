import test from 'node:test';
import assert from 'node:assert/strict';
import { santaState } from '../src/santaconfig.js';

test('Santa follows Christmas Eve boundaries, including backwards clock changes', () => {
  const day = { month: 12, date: 24, hour: 0 };
  for (const [hour, state] of [[14.999, 'away'], [15, 'sitting'], [15.999, 'sitting'], [16, 'sleeping'], [20.999, 'sleeping'], [21, 'away'], [16, 'sleeping'], [15, 'sitting'], [14, 'away']]) {
    day.hour = hour;
    assert.equal(santaState(day), state, `hour ${hour}`);
  }
  for (const [month, date] of [[12, 23], [12, 25], [11, 24], [1, 24]]) {
    assert.equal(santaState({ month, date, hour: 15.5 }), 'away');
  }
});
