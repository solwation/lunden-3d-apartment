import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
import { record, clampCounters, MIN_GAP, MAX_ROWS } from './boards.js';
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
  for (const l of BOARD_LISTS) { assert.ok(COUNTERS[l.counter], l.id); assert.ok(l.title && ['most', 'first'].includes(l.kind)); }
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
