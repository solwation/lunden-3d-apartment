import test from 'node:test';
import assert from 'node:assert/strict';
import { addCount } from '../src/statcount.js';
// #1761: bump() must only count numbers; an object stored under the same key stays as it was.
test('ordinary counters count as before, a missing key starts at 0', () => {
  const s = { doors: 2 };
  assert.equal(addCount(s, 'doors'), true);
  assert.equal(addCount(s, 'doors', 3), true);
  assert.equal(addCount(s, 'steps'), true);
  assert.deepEqual(s, { doors: 6, steps: 1 });
});
test('an object, string or NaN under the key is not overwritten', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const quest = { step: 2 };
  const s = { fishQuest: quest, name: 'x', broken: NaN };
  assert.equal(addCount(s, 'fishQuest'), false);
  assert.equal(addCount(s, 'name'), false);
  assert.equal(addCount(s, 'broken'), false);
  assert.equal(s.fishQuest, quest);
  assert.deepEqual(s.fishQuest, { step: 2 });
  assert.equal(s.name, 'x');
  assert.ok(Number.isNaN(s.broken));
  assert.equal(warn.mock.callCount(), 3);
});
