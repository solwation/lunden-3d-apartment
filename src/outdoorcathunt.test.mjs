import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTDOOR_CATS } from './config.js';
import { findOutdoorCat, huntProgress, huntState, huntText, huntNames } from './outdoorcathunt.js';
import { MEDALS, MAX_LEVEL, levelOf, thresholdOf, bonusFor, levelsFrom } from './medalcatalog.js';
import { evaluate, mergeServer, medalView } from './medals.js';
import { COUNTERS, boardCounters } from './boardcatalog.js';
import { clampCounters, record, medalsOf, MIN_GAP } from '../cloudflare/boards.js';

// #1885: "Hitta alla utekatter" — rounds, the "N av X" badge, one medal level per round, the bonus once, the Worker's validation.
const NAMES = huntNames(), X = NAMES.length, medal = MEDALS.find((m) => m.id === 'outdoorcats');
const fresh = () => ({ medals: {}, taskCounts: {} });
const findAll = (stats, names = NAMES) => names.map((n) => findOutdoorCat(stats, n, names));

test('X comes from OUTDOOR_CATS.cats; the medal is linear with a large, rising bonus', () => {
  assert.equal(X, OUTDOOR_CATS.cats.length); assert.equal(X, 12);
  assert.ok(medal && medal.counter === 'outdoorCatRounds' && COUNTERS.outdoorCatRounds);
  for (let l = 1; l <= MAX_LEVEL; l++) { assert.equal(thresholdOf(medal, l), l); assert.equal(levelOf(medal, l), l); assert.equal(levelOf(medal, l - 1), l - 1); }
  assert.equal(levelOf(medal, 1000), MAX_LEVEL);
  const bonuses = Array.from({ length: MAX_LEVEL }, (_, i) => bonusFor(i + 1, medal));
  assert.deepEqual(bonuses.slice(0, 3), [500, 1000, 1500]);
  for (let i = 1; i < bonuses.length; i++) assert.ok(bonuses[i] > bonuses[i - 1]);
  const others = MEDALS.filter((m) => m !== medal);
  assert.ok(others.every((m) => bonusFor(1, m) < bonusFor(1, medal)), 'far above the ordinary medal bonuses');
});

test('"N av X" counts only new cats in the round; repeats and unknown names say nothing', () => {
  const s = fresh();
  const r1 = findOutdoorCat(s, 'Sotis');
  assert.deepEqual(r1, { count: 1, total: X, done: false }); assert.equal(huntText(r1, MAX_LEVEL), `🐈 1 av ${X} utekatter hittade`);
  assert.equal(findOutdoorCat(s, 'Sotis'), null, 'an already found cat gives no badge');
  assert.equal(findOutdoorCat(s, 'Miele'), null, 'not an outdoor cat');
  const r2 = findOutdoorCat(s, 'Pelle'); assert.equal(r2.count, 2);
  assert.equal(huntText(findOutdoorCat(s, 'Kanel'), MAX_LEVEL), `🐈 3 av ${X} utekatter hittade`);
  assert.deepEqual(huntProgress(s).found, ['Sotis', 'Kanel', 'Pelle']); assert.equal(s.outdoorCatRounds, 0);
});

test('the level unlocks only when every cat is found; the round then restarts at 0 and the bonus is paid once', () => {
  const s = fresh(); let paid = 0; const pay = (p) => { paid += p; };
  evaluate(s, { seeded: true, pay });
  const rs = findAll(s);
  assert.ok(rs.slice(0, -1).every((r) => !r.done), 'not before the last cat');
  assert.equal(rs[X - 2].count, X - 1);
  const last = rs[X - 1];
  assert.deepEqual(last, { count: X, total: X, done: true, rounds: 1 });
  assert.equal(huntText(last, MAX_LEVEL), `🎉 Alla ${X} utekatter hittade! Nivå 2 börjar`);
  assert.equal(s.outdoorCatRounds, 1); assert.deepEqual(s.outdoorCatsFound, []); assert.equal(huntProgress(s).count, 0);
  let g = evaluate(s, { seeded: true, pay }).gained;
  assert.deepEqual(g, [{ id: 'outdoorcats', level: 1, bonus: 500 }]); assert.equal(paid, 500);
  assert.deepEqual(evaluate(s, { seeded: true, pay }).gained, []); assert.equal(paid, 500, 'once per level');
  // round 2: the same cats count again, as new ones
  assert.equal(findOutdoorCat(s, 'Sotis').count, 1);
  findAll(s);
  assert.equal(s.outdoorCatRounds, 2);
  g = evaluate(s, { seeded: true, pay }).gained; assert.equal(g[0].level, 2); assert.equal(paid, 1500);
  // a server restore of the levels on another device pays nothing
  const other = fresh(); mergeServer(other, { outdoorcats: [1, 2] }); other.outdoorCatRounds = 2;
  let paid2 = 0; assert.deepEqual(evaluate(other, { seeded: true, pay: (p) => { paid2 += p; } }).gained, []); assert.equal(paid2, 0);
  // after the top level: the rounds go on, the text names the round instead
  assert.equal(huntText({ done: true, total: X, count: X, rounds: MAX_LEVEL }, MAX_LEVEL), `🎉 Alla ${X} utekatter hittade! Omgång ${MAX_LEVEL + 1} börjar`);
});

test('a cat added later joins the round without taking back reached levels', () => {
  const s = fresh(); evaluate(s, { seeded: true, pay: () => {} });
  findAll(s); assert.equal(s.outdoorCatRounds, 1); evaluate(s, { seeded: true, pay: () => {} });
  const more = [...NAMES, 'Nyfiken'];
  for (const n of NAMES) findOutdoorCat(s, n, more); // all the old ones again …
  assert.equal(s.outdoorCatRounds, 1, '… is not enough with 13 cats');
  assert.equal(huntProgress(s, more).total, X + 1); assert.equal(huntProgress(s, more).count, X);
  const r = findOutdoorCat(s, 'Nyfiken', more); assert.equal(r.done, true); assert.equal(r.total, X + 1); assert.equal(s.outdoorCatRounds, 2);
  assert.equal(medalView(s, medal).level, 2); assert.equal(s.medals.outdoorcats.l, 1, 'level 1 kept; level 2 comes from the counter');
});

test('odd saved data is repaired; the medal view shows the round in progress', () => {
  const s = { ...fresh(), outdoorCatRounds: 'x', outdoorCatsFound: ['Sotis', 7, 'Sotis', 'Kanel', null] };
  huntState(s); assert.equal(s.outdoorCatRounds, 0); assert.deepEqual(s.outdoorCatsFound, ['Sotis', 'Kanel']);
  const v = medalView(s, medal);
  assert.equal(v.have, 2); assert.equal(v.next, X); assert.equal(v.from, 0); assert.deepEqual(v.cats, ['Sotis', 'Kanel']); assert.ok(v.bar);
  s.outdoorCatRounds = MAX_LEVEL; assert.equal(medalView(s, medal).bar, true, 'still shown after the top level');
  assert.equal(boardCounters({ ...s, outdoorCatRounds: 3 }).outdoorCatRounds, 3);
});

test('Worker: a new row brings at most `start` rounds, then one more per everyMin minutes since the last raise', async () => {
  const spec = COUNTERS.outdoorCatRounds, now = 1.9e12, gap = spec.everyMin * 60_000;
  assert.equal(clampCounters({ outdoorCatRounds: 10 }, null, now).outdoorCatRounds, spec.start);
  const store = new Map(), s = { async get(k) { return store.get(k); }, async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); },
    async list() { return new Map(store); } }, ID = 'player-hunt1', row = () => store.get(`b:${ID}`);
  await record(s, { id: ID, c: { outdoorCatRounds: 10, steps: 100 } }, now);
  assert.equal(row().c.outdoorCatRounds, 1); assert.equal(medalsOf(row()).outdoorcats.length, 1, 'a cheat cannot unlock levels at once');
  // frequent writes of other counters do not let it climb faster
  let t = now;
  for (let i = 1; i <= 8; i++) { t += MIN_GAP + 1000; await record(s, { id: ID, c: { outdoorCatRounds: 10, steps: 100 + i * 100 } }, t); }
  assert.equal(row().c.outdoorCatRounds, 1, `nothing more within ${spec.everyMin} min`);
  t = now + gap; await record(s, { id: ID, c: { outdoorCatRounds: 10, steps: 5000 } }, t);
  assert.equal(row().c.outdoorCatRounds, 2); assert.equal(medalsOf(row()).outdoorcats.length, 2);
  t += gap * 3; await record(s, { id: ID, c: { outdoorCatRounds: 10, steps: 6000 } }, t);
  assert.equal(row().c.outdoorCatRounds, 5);
  // an honest row is accepted; an older row without the counter may bring `start` on its first raise
  const old = { c: { steps: 50 }, t: now };
  assert.equal(clampCounters({ outdoorCatRounds: 1, steps: 60 }, old, now + 40_000).outdoorCatRounds, 1);
  assert.equal(clampCounters({ outdoorCatRounds: 2 }, { c: { outdoorCatRounds: 1 }, r: { outdoorCatRounds: now }, t: now }, now + 60_000).outdoorCatRounds, 1);
  assert.deepEqual(levelsFrom({ outdoorCatRounds: 3 }), { outdoorcats: 3 });
});
