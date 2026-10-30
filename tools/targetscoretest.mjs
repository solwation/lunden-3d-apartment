import test from 'node:test';
import assert from 'node:assert/strict';
import { creditTarget, targetScoreOf } from '../src/targetscore.js';
import { TARGET_SCORE, SCORE } from '../src/config.js';
// #1708: the target is worth little game score, with a daily cap, whatever the weapon.
test('a single perfect shot (10 x 4 = 40 target points) gives a few game points', () => {
  const s = { target: 0 };
  const g = creditTarget(s, 40, '2026-10-30');
  assert.ok(g >= 1 && g <= 5, `gain ${g}`);
  assert.equal(s.targetScore, g);
});
test('a minute of rifle fire (a hit every 0.25 s, best rings) gives at most the daily cap', () => {
  const s = { target: 0 }; let total = 0;
  for (let i = 0; i < 240; i++) { total += creditTarget(s, 40, '2026-10-30'); s.target += 40; }
  assert.ok(total <= 30 + 1e-9 && total >= 29, `total ${total}`);
  assert.equal(s.target, 9600); // the board's own statistic is untouched
});
test('the cap resets on a new local day and an old save converts once, capped', () => {
  const s = { target: 0 };
  for (let i = 0; i < 100; i++) creditTarget(s, 40, 'a');
  creditTarget(s, 40, 'b');
  assert.ok(Math.abs(s.targetScore - (TARGET_SCORE.perDay + 4)) < 1e-9);
  assert.equal(targetScoreOf({ target: 5000 }), TARGET_SCORE.perDay);
  assert.ok(Math.abs(targetScoreOf({ target: 20 }) - 2) < 1e-9);
  assert.equal(SCORE.each.target, 0); // no uncapped path through the generic per-event loop
});
