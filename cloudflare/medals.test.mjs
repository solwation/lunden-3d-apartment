import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
import { record, medalsOf, MIN_GAP } from './boards.js';
import { COUNTERS, boardCounters } from '../src/boardcatalog.js';
import { MEDALS, levelOf, levelsFrom, levelsOfStats, bonusFor, MAX_LEVEL } from '../src/medalcatalog.js';
import { evaluate, mergeServer, medalView } from '../src/medals.js';

// Medals with levels (#1711): level maths, the bonus exactly once (also after a server restore), server-side derivation.
function storage() {
  const map = new Map();
  return { map, async get(k) { return map.get(k); }, async put(k, v) { map.set(k, v); }, async delete(k) { map.delete(k); },
    async list(o = {}) { return new Map([...map].filter(([k]) => k.startsWith(o.prefix ?? ''))); } };
}
let n = 0;
const call = (env, body) => worker.fetch(new Request('https://w.test/boards', { method: 'POST', body: JSON.stringify(body),
  headers: { Origin: 'https://solwation.github.io', 'Content-Type': 'text/plain', 'CF-Connecting-IP': `7.7.7.${++n % 250}` } }), env);
const ME = 'player-medal1', fresh = () => ({ medals: {}, taskCounts: {} });
const medal = (id) => MEDALS.find((m) => m.id === id);

test('catalogue: unique ids, every counter is one the Worker accepts, task medals read taskCounts', () => {
  assert.equal(new Set(MEDALS.map((m) => m.id)).size, MEDALS.length);
  for (const m of MEDALS) { assert.ok(COUNTERS[m.counter], m.id); assert.ok(m.name && m.icon && m.base > 0, m.id); }
  assert.ok(MEDALS.some((m) => m.secret), 'there are secret medals');
  assert.ok(MEDALS.some((m) => m.counter === 'tasks') && MEDALS.some((m) => m.counter === 'task_makeBed'));
  assert.equal(boardCounters({ taskCounts: { makeBed: 12.7 }, tasks: 3 }).task_makeBed, 12);
});

test('levels: reached at multiples of base, always a next one, capped', () => {
  const sq = medal('squirrels');
  assert.equal(levelOf(sq, 49), 0); assert.equal(levelOf(sq, 50), 1); assert.equal(levelOf(sq, 149), 2); assert.equal(levelOf(sq, 1e9), MAX_LEVEL);
  assert.deepEqual(levelsOfStats({ squirrelFeeds: 100, taskCounts: { washDish: 10 }, tasks: 19 }), { squirrels: 2, 't-washDish': 1 });
  assert.deepEqual(levelsFrom({ steps: 40000, falls: 3 }), { steps: 2 });
  assert.equal(bonusFor(3), 30);
});

test('a live level pays its bonus once; repeated checks and a restart pay nothing more', () => {
  const stats = { ...fresh(), squirrelFeeds: 10 }; let paid = 0; const pay = (p) => { paid += p; };
  assert.deepEqual(evaluate(stats, { seeded: false, pay }).gained, []); // first run: nothing to show
  stats.squirrelFeeds = 50;
  const r = evaluate(stats, { seeded: true, pay });
  assert.deepEqual(r.gained, [{ id: 'squirrels', level: 1, bonus: 10 }]); assert.equal(paid, 10);
  for (let i = 0; i < 3; i++) evaluate(stats, { seeded: true, pay });
  assert.equal(paid, 10);
  const reloaded = JSON.parse(JSON.stringify(stats)); // saved and loaded again
  evaluate(reloaded, { seeded: true, pay }); assert.equal(paid, 10);
  stats.squirrelFeeds = 160; // two levels at once: both paid, one celebration (the top level)
  const r2 = evaluate(stats, { seeded: true, pay });
  assert.deepEqual(r2.gained, [{ id: 'squirrels', level: 3, bonus: 20 + 30 }]); assert.equal(paid, 60);
});

test('starting levels are silent: no bonus, no animation, counted once for the summary', () => {
  const stats = { ...fresh(), squirrelFeeds: 400, petted: 1000, steps: 100000 }; let paid = 0;
  const r = evaluate(stats, { seeded: false, pay: (p) => { paid += p; } });
  assert.equal(paid, 0); assert.deepEqual(r.gained, []); assert.equal(r.silent, 8 + 10 + 5);
  assert.equal(stats.medals.squirrels.l, 8);
});

test('server levels restore silently on another device and the bonus is not paid again', () => {
  const stats = fresh(); let paid = 0;
  assert.equal(mergeServer(stats, { squirrels: [1000, 2000], bogus: [1], cats: 'x' }), 2); // unknown medals / bad shapes are ignored
  assert.equal(stats.medals.squirrels.l, 2); assert.deepEqual(stats.medals.squirrels.t, [1000, 2000]);
  stats.squirrelFeeds = 100; // the counters on the new device catch up to the same levels
  assert.deepEqual(evaluate(stats, { seeded: true, pay: (p) => { paid += p; } }).gained, []); assert.equal(paid, 0);
  stats.squirrelFeeds = 150; assert.equal(evaluate(stats, { seeded: true, pay: (p) => { paid += p; } }).gained[0].level, 3); assert.equal(paid, 30);
  assert.equal(mergeServer(stats, { squirrels: [5, 6] }), 0); // an older answer never lowers a level; earliest time wins
  assert.equal(stats.medals.squirrels.l, 3); assert.equal(stats.medals.squirrels.t[0], 5);
});

test('the grid view: locked medals show progress, secrets stay hidden until unlocked', () => {
  const stats = { ...fresh(), squirrelFeeds: 70, falls: 4 };
  const v = medalView(stats, medal('squirrels')); assert.equal(v.level, 1); assert.equal(v.next, 100); assert.equal(v.have, 70);
  assert.equal(medalView(stats, medal('falls')).shown, false);
  stats.falls = 10; assert.equal(medalView(stats, medal('falls')).shown, true);
  assert.equal(medalView(stats, medal('cats')).level, 0);
});

test('server: levels come from validated counters only, times are the server\'s, a client cannot invent a level', async () => {
  const s = storage(), t0 = 1.9e12;
  await record(s, { id: ME, name: 'Eva', c: { squirrelFeeds: 1e9 }, m: { cats: [1, 2, 3] }, mt: { cats: [1] } }, t0);
  const row = s.map.get(`b:${ME}`);
  assert.equal(row.c.squirrelFeeds, COUNTERS.squirrelFeeds.start); // the start cap
  assert.deepEqual(Object.keys(medalsOf(row)), ['squirrels']); // 'm' from the client is ignored
  assert.equal(medalsOf(row).squirrels.length, levelOf(medal('squirrels'), COUNTERS.squirrelFeeds.start));
  assert.ok(medalsOf(row).squirrels.every((t) => t === t0));
  // later growth is capped per minute and a new level is stamped with the later server time
  const s2 = storage();
  await record(s2, { id: ME, c: { squirrelFeeds: 60 } }, t0); // level 1 now
  const t1 = t0 + 10 * 60_000;
  await record(s2, { id: ME, c: { squirrelFeeds: 1e9 } }, t1);
  const grown = medalsOf(s2.map.get(`b:${ME}`)).squirrels;
  assert.equal(grown.length, levelOf(medal('squirrels'), 60 + COUNTERS.squirrelFeeds.perMin * 11));
  assert.ok(grown.length >= 3); assert.equal(grown[0], t0); assert.equal(grown[grown.length - 1], t1);
});

test('POST /boards answers the medals, restore is read-only and creates no row', async () => {
  const env = { boardStorage: storage() };
  let r = await (await call(env, { id: ME, restore: true })).json();
  assert.deepEqual(r.m, {}); assert.equal(env.boardStorage.map.size, 0);
  r = await (await call(env, { id: ME, name: 'Eva', c: { petted: 250 } })).json();
  assert.equal(r.wrote, true); assert.deepEqual(Object.keys(r.m), ['cats']); assert.equal(r.m.cats.length, 2);
  const again = await (await call(env, { id: ME, c: { petted: 900 } })).json(); // inside the write gap: ok, no write, same medals
  assert.equal(again.wrote, false); assert.equal(again.m.cats.length, 2);
  const back = await (await call(env, { id: ME, restore: true })).json(); // another device
  assert.deepEqual(back.m, r.m);
  assert.equal(env.boardStorage.map.size, 1);
  assert.equal((await call(env, { id: 'x', restore: true })).status, 400);
});

test('a row from before medals gets its levels with the row\'s time', () => {
  const row = { id: ME, c: { petted: 100 }, t: 777 };
  assert.deepEqual(medalsOf(row), { cats: [777] });
});
