import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
import { record, clampCounters, buildLists, medalStanding, MIN_GAP, MAX_ROWS } from './boards.js';
import { COUNTERS, BOARD_LISTS, boardCounters } from '../src/boardcatalog.js';

// Alternative top lists (#1710): one stored row per player id, rate-capped counters, collected writes, 'first' by server time.
function storage() {
  const map = new Map(); let puts = 0;
  return { map, get puts() { return puts; }, async get(k) { return map.get(k); }, async put(k, v) { puts++; map.set(k, v); }, async delete(k) { map.delete(k); },
    async list(o = {}) { return new Map([...map].filter(([k]) => k.startsWith(o.prefix ?? ''))); } };
}
let n = 0;
const call = (env, method, body) => worker.fetch(new Request('https://w.test/boards', { method, body: body === undefined ? undefined : JSON.stringify(body),
  headers: { Origin: 'https://solwation.github.io', 'Content-Type': 'text/plain', 'CF-Connecting-IP': `8.8.8.${++n % 250}` } }), env);
const ME = 'player-aaaa1', YOU = 'player-bbbb2';

test('every list has a known counter with limits; ids are unique', () => {
  assert.equal(new Set(BOARD_LISTS.map((l) => l.id)).size, BOARD_LISTS.length);
  for (const l of BOARD_LISTS) { assert.ok(l.kind.startsWith('medals') || COUNTERS[l.counter], l.id); assert.ok(l.title && ['most', 'first', 'medals-total', 'medals-top'].includes(l.kind)); }
  assert.deepEqual(boardCounters({ squirrelFeeds: 3.9, petted: 0, vacuumed: 12.5, nope: 5 }), { squirrelFeeds: 3, vacuumed: 12 });
});

test('a new row is capped at its start, later growth at perMin per minute (+1), and counters never fall', () => {
  const now = 1e12;
  assert.equal(clampCounters({ squirrelFeeds: 1e9, bogus: 5, petted: -3, doors: 'x' }, null, now).squirrelFeeds, COUNTERS.squirrelFeeds.start);
  assert.deepEqual(Object.keys(clampCounters({ squirrelFeeds: 5, bogus: 5, petted: -3, doors: 'x' }, null, now)), ['squirrelFeeds']);
  const old = { c: { squirrelFeeds: 100 }, t: now };
  assert.equal(clampCounters({ squirrelFeeds: 100000 }, old, now + 60_000).squirrelFeeds, 100 + COUNTERS.squirrelFeeds.perMin * 2);
  assert.equal(clampCounters({ squirrelFeeds: 3 }, old, now + 60_000).squirrelFeeds, 100);
});

test('writes are collected: a post inside the gap or an unchanged post costs no write; one row per id', async () => {
  const s = storage(), t0 = 1.8e12;
  assert.equal(await record(s, { id: ME, name: 'Eva', c: { squirrelFeeds: 3 } }, t0), true);
  assert.equal(await record(s, { id: ME, name: 'Eva', c: { squirrelFeeds: 4 } }, t0 + 5000), false); // too soon
  assert.equal(await record(s, { id: ME, name: 'Eva', c: { squirrelFeeds: 3 } }, t0 + MIN_GAP + 1), false); // nothing changed
  assert.equal(await record(s, { id: ME, name: '', c: { squirrelFeeds: 7 } }, t0 + MIN_GAP + 2), true); // anonymous post keeps the name
  assert.equal(s.puts, 2); assert.equal(s.map.size, 1);
  assert.equal(s.map.get(`b:${ME}`).name, 'Eva');
});

test('the oldest row makes room at the row cap', async () => {
  const s = storage();
  for (let i = 0; i < MAX_ROWS; i++) s.map.set(`b:x${i}`, { id: `x${i}`, c: {}, f: {}, t: 1000 + i });
  await record(s, { id: ME, c: { doors: 1 } }, 5e12);
  assert.equal(s.map.size, MAX_ROWS); assert.ok(!s.map.has('b:x0')); assert.ok(s.map.has(`b:${ME}`));
});

test('GET /boards: most lists rank by count, first lists by the server time; ids never leak; names are cleaned', async () => {
  const env = { boardStorage: storage() };
  const t = Date.now();
  await record(env.boardStorage, { id: ME, name: 'Ev<a>', c: { squirrelFeeds: 10, catButts: 2 } }, t - 120_000);
  await record(env.boardStorage, { id: YOU, name: 'Ola', c: { squirrelFeeds: 20 } }, t - 60_000);
  await record(env.boardStorage, { id: YOU, name: 'Ola', c: { squirrelFeeds: 25, catButts: 1 } }, t - 20_000);
  const r = await call(env, 'GET');
  assert.equal(r.status, 200);
  const { lists } = await r.json();
  assert.deepEqual(lists['flest-squirrelFeeds'].map((x) => [x.name, x.value]), [['Ola', 25], ['Eva', 10]]);
  assert.deepEqual(lists['forst-catButts'].map((x) => x.name), ['Eva', 'Ola']); // Eva's first sync with it was earlier
  assert.deepEqual(lists['flest-doors'], []);
  assert.ok(!JSON.stringify(lists).includes(ME)); assert.match(lists['flest-squirrelFeeds'][0].key, /^[0-9a-f]{16}$/);
});

test('POST /boards validates, answers ok and stores via the board storage', async () => {
  const env = { boardStorage: storage() };
  assert.equal((await call(env, 'POST', { id: 'x', c: {} })).status, 400);
  assert.equal((await call(env, 'POST', { id: ME, c: { petted: 5 } })).status, 200);
  assert.equal(env.boardStorage.map.get(`b:${ME}`).c.petted, 5);
  assert.equal((await call({}, 'GET')).status, 503); // no storage bound: refused, nothing falls back to KV
  assert.equal((await call(env, 'POST', { id: ME, pad: 'x'.repeat(5000) })).status, 413);
});

test('the Worker forwards /boards to the DrawingRoom storage when it has the binding', async () => {
  const env = { boardStorage: undefined, DRAWINGS: { idFromName: () => 'x', get: () => ({ fetch: async () => new Response('{"fwd":1}') }) } };
  assert.equal((await (await call(env, 'GET')).json()).fwd, 1);
});

// Medal lists (#1749): derived server-side from medalsOf, ties go to whoever got there first.
test('medal lists: sum of levels, highest single level, ties by time, migrated rows, client claims ignored', async () => {
  const row = (id, c, mt, t = 5000) => ({ id, name: id.slice(0, 6), c, f: {}, ...(mt ? { mt } : {}), t });
  // butts base 100 -> level 1 at 100, level 2 at 250; cats base 100 -> same curve
  const a = row('aaaaaa-1', { catButts: 250 }, { butts: [100, 200] });                    // 2 levels, top butts 2 @200
  const b = row('bbbbbb-2', { petted: 250 }, { cats: [100, 150] });                       // 2 levels, top cats 2 @150 -> beats a on both lists
  const c = row('cccccc-3', { petted: 100, catButts: 100, ponyPets: 100 }, { cats: [300], butts: [310], ponies: [320] }); // 3 levels (sum), top level 1
  const d = row('dddddd-4', { catButts: 100 });                                           // legacy row without mt: butts level 1 (at row time) ... old base 25 -> level 4
  const forged = { ...row('eeeeee-5', {}), medals: { butts: 50 }, m: { butts: [1] } };    // a client-made level is not in the row's counters
  const lists = await buildLists([a, b, c, d, forged]);
  assert.deepEqual(lists['medaljer-total'].map((r) => [r.name, r.value]), [['dddddd', 4], ['cccccc', 3], ['bbbbbb', 2], ['aaaaaa', 2]]); // b before a: its sum came earlier
  assert.deepEqual(lists['medaljer-hogsta'].map((r) => [r.name, r.value, r.medal]), [['dddddd', 4, 'butts'], ['bbbbbb', 2, 'cats'], ['aaaaaa', 2, 'butts'], ['cccccc', 1, 'cats']]);
  assert.ok(!lists['medaljer-total'].some((r) => r.name === 'eeeeee')); assert.ok(!JSON.stringify(lists).includes('aaaaaa-1"')); // ids never leak
});

test('medalStanding: equal sums go to the one whose last level came first; equal top level to the earliest time', () => {
  const x = { id: 'x', c: { petted: 250 }, mt: { cats: [10, 20] }, t: 1 }, y = { id: 'y', c: { catButts: 250 }, mt: { butts: [5, 30] }, t: 1 };
  assert.deepEqual([medalStanding(x).total, medalStanding(x).totalAt, medalStanding(y).totalAt], [2, 20, 30]);
  assert.deepEqual(medalStanding(x).top, { medal: 'cats', level: 2, at: 20 });
  assert.equal(medalStanding({ id: 'z', c: {}, t: 1 }).top, null);
});

test('GET /boards carries both medal lists from a recorded row, with no extra write', async () => {
  const s = storage();
  await record(s, { id: ME, name: 'Eva', c: { catButts: 260, medals: { butts: 50 } } }, 1.8e12);
  const env = { boardStorage: s, __proto__: null }; const before = s.puts;
  const lists = (await (await call(env, 'GET')).json()).lists;
  assert.deepEqual(lists['medaljer-total'].map((r) => r.value), [2]);
  assert.deepEqual(lists['medaljer-hogsta'].map((r) => [r.value, r.medal]), [[2, 'butts']]);
  assert.equal(s.puts, before);
});
