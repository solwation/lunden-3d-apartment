// #1754: the hidden fishing quest: steps in order, paid exactly once, hidden until completed, repaired state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FishQuest, questState, FISH_QUEST } from './fishquest.js';

const make = (stats = {}) => { const log = { saves: 0, paid: 0, done: 0 }; const q = new FishQuest({ stats, save: () => log.saves++, pay: () => log.paid++, onDone: () => log.done++, now: () => 1234 }); return { q, log, stats }; };

test('hidden until completed, then paid once', () => {
  const { q, log, stats } = make();
  assert.equal(q.view(), null);
  assert.equal(q.step('catch'), false, 'no catch before the rod');
  assert.equal(q.step('rod'), true); assert.equal(q.step('rod'), false);
  assert.equal(q.step('cook'), false, 'no cooking before a catch');
  q.step('catch'); assert.equal(q.view(), null); assert.equal(log.paid, 0);
  q.step('cook');
  assert.equal(log.paid, 1); assert.equal(log.done, 1); assert.equal(stats.fishQuestSteps.t, 1234);
  const v = q.view(); assert.equal(v.title, FISH_QUEST.title); assert.deepEqual(v.steps.map((s) => s.done), [true, true, true, false]);
  q.step('eat'); assert.equal(log.paid, 1, 'the optional step pays nothing more');
  assert.ok(q.view().steps.at(-1).done && q.view().steps.at(-1).optional);
  assert.ok(log.saves >= 4, 'every step persisted');
});

test('a reload of a completed quest never pays again', () => {
  const { q, log } = make({ fishQuestSteps: { s: ['rod', 'catch', 'cook'], t: 99 } });
  assert.equal(q.done, true); q.step('cook'); q.step('eat'); assert.equal(log.paid, 0);
});

test('odd saved data is repaired', () => {
  const s = { fishQuestSteps: { s: ['rod', 'x', 'rod', 5], t: -3 } };
  assert.deepEqual(questState(s), { s: ['rod'], t: 0 });
  assert.deepEqual(questState({ fishQuestSteps: [1], fishQuest: 1 }), { s: [], t: 0 });
});
