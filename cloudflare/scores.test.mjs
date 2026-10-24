import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

// The leaderboard and presence for anonymous players (#677): empty name accepted, one row per id, escaping, ordering.
function kv() {
  const store = new Map();
  return {
    store,
    async get(k, type) { const e = store.get(k); if (!e) return null; return type === 'json' ? JSON.parse(e.v) : e.v; },
    async put(k, v) { store.set(k, { v }); },
    async delete(k) { store.delete(k); },
    async list(o = {}) { return { keys: [...store.keys()].filter((k) => k.startsWith(o.prefix ?? '')).map((name) => ({ name })), list_complete: true }; },
  };
}
const ORIGIN = 'https://solwation.github.io';
let n = 0;
const call = (env, path, method, body) => worker.fetch(new Request(`https://w.test${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body),
  headers: { Origin: ORIGIN, 'Content-Type': 'text/plain', 'CF-Connecting-IP': `9.9.9.${++n % 250}` } }), env);
const post = (env, b) => call(env, '/scores', 'POST', b);

test('an anonymous score (empty name) gets its own row per id', async () => {
  const env = { LUNDEN: kv() };
  assert.equal((await post(env, { id: 'anon-aaaaaa', name: '', score: 120 })).status, 200);
  const top = await (await post(env, { id: 'anon-bbbbbb', name: '', score: 80 })).json();
  assert.deepEqual(top.map((x) => [x.name, x.score]), [['', 120], ['', 80]]);
  assert.equal((await (await post(env, { id: 'anon-aaaaaa', name: '', score: 150 })).json()).length, 2); // same id: same row
});

test('naming an anonymous row renames it (same id); an anonymous post never strips a name', async () => {
  const env = { LUNDEN: kv() };
  await post(env, { id: 'player-1234', name: '', score: 50 });
  let top = await (await post(env, { id: 'player-1234', name: 'Olof', score: 60 })).json();
  assert.deepEqual(top.map((x) => [x.name, x.score]), [['Olof', 60]]);
  top = await (await post(env, { id: 'player-1234', name: '', score: 70 })).json();
  assert.deepEqual(top.map((x) => [x.name, x.score]), [['Olof', 70]]);
});

test('bad posts are still refused; names are cleaned; equal points list the named first', async () => {
  const env = { LUNDEN: kv() };
  assert.equal((await post(env, { id: 'x', name: '', score: 1 })).status, 400);
  assert.equal((await post(env, { id: 'player-1234', name: 'a', score: -1 })).status, 400);
  assert.equal((await post(env, { id: 'player-1234', name: '<b>', score: 1.5 })).status, 400);
  await post(env, { id: 'anon-cccccc', name: '', score: 100 });
  const top = await (await post(env, { id: 'named-dddddd', name: 'Ev<i>a&"', score: 100 })).json();
  assert.equal(top[0].name, 'Evia'); assert.equal(top[1].name, '');
  const big = await (await post(env, { id: 'anon-eeeeee', name: '', score: 9_999_999 })).json();
  assert.ok(big.find((x) => x.score > 100).score <= 3000); // plausibility cap as for named
});

test('presence: anonymous visitors are counted and listed one by one, named ones by name', async () => {
  const env = { LUNDEN: kv() };
  await call(env, '/presence/aaaaaaaa', 'PUT', { name: '', score: 10 });
  await call(env, '/presence/bbbbbbbb', 'PUT', { name: '', score: 20 });
  await call(env, '/presence/cccccccc', 'PUT', { name: 'Olof<x>', score: 30 });
  const d = await (await call(env, '/presence/dddddddd', 'PUT', { name: 'Olof<x>', score: 40 })).json();
  assert.equal(d.count, 4); assert.equal(d.anon, 2); assert.deepEqual(d.names, ['Olofx']);
  assert.deepEqual(d.players.map((p) => [p.name, p.score]), [['', 10], ['', 20], ['Olofx', 40]]);
  const g = await (await call(env, '/presence', 'GET')).json(); // reading does not join
  assert.equal(g.count, 4);
});

test('presence portraits preserve validated complete codes for named and anonymous visitors', async () => {
  const env = { LUNDEN: kv() }, avatar = '240302101h8q3d1s2';
  await call(env, '/presence/portrait-a', 'PUT', { name: 'Olof', score: 10, avatar });
  const data = await (await call(env, '/presence/portrait-b', 'PUT', { name: '', score: 20, avatar: '053124101h2q1' })).json();
  assert.deepEqual(data.players, [{ name:'Olof', score:10, avatar }, { name:'', score:20, avatar:'053124101h2q1' }]);
  assert.equal(JSON.parse(await env.LUNDEN.get('presence:portrait-a')).avatar, avatar);
});

test('presence portraits omit malformed, oversized and legacy codes without hiding players', async () => {
  const env = { LUNDEN: kv() };
  for (const [i, avatar] of [undefined, '<img>', '999999999', '240302101q', '240302101'+'h123'.repeat(20)].entries()) {
    await call(env, `/presence/invalid-${i}`, 'PUT', { name:`Player ${i}`, score:5, avatar });
  }
  const data = await (await call(env, '/presence', 'GET')).json();
  assert.equal(data.players.length,5); assert.ok(data.players.every(p => !('avatar' in p)));
});

test('presence same-name aggregation keeps the best-score players own portrait', async () => {
  const env = { LUNDEN: kv() };
  await call(env, '/presence/portrait-a', 'PUT', { name:'Olof', score:10, avatar:'240302101h8q3' });
  const data = await (await call(env, '/presence/portrait-b', 'PUT', { name:'Olof', score:20, avatar:'053124101h2q1' })).json();
  assert.deepEqual(data.players,[{name:'Olof',score:20,avatar:'053124101h2q1'}]);
});

// #1585: avatar thumbnails and public row keys.
const LOOK = '210331011175e2h1', LOOK2 = '3102200';
test('the look code is stored with the row and returned; an invalid one is ignored, never refuses the score', async () => {
  const env = { LUNDEN: kv() };
  let top = await (await post(env, { id: 'look-aaaaaa', name: 'Ada', score: 10, avatar: LOOK })).json();
  assert.equal(top[0].avatar, LOOK);
  const bad = await post(env, { id: 'look-bbbbbb', name: 'Bea', score: 5, avatar: '99<img>' });
  assert.equal(bad.status, 200);
  top = await (await call(env, '/scores', 'GET')).json();
  assert.deepEqual(top.map((r) => [r.name, r.avatar]), [['Ada', LOOK], ['Bea', undefined]]);
  for (const avatar of ['x', '1'.repeat(80), '2104310111z', 42]) assert.equal((await post(env, { id: 'look-cccccc', name: '', score: 1, avatar })).status, 200);
  assert.equal((await (await call(env, '/scores', 'GET')).json()).find((r) => r.score === 1).avatar, undefined);
  // an older client (no avatar) keeps the row's earlier look; a new valid code replaces it
  top = await (await post(env, { id: 'look-aaaaaa', name: 'Ada', score: 12 })).json();
  assert.equal(top.find((r) => r.name === 'Ada').avatar, LOOK);
  top = await (await post(env, { id: 'look-aaaaaa', name: 'Ada', score: 13, avatar: LOOK2 })).json();
  assert.equal(top.find((r) => r.name === 'Ada').avatar, LOOK2);
});

test('the same name from two ids is two rows with their own keys and looks; GET never returns a private id', async () => {
  const env = { LUNDEN: kv() };
  await post(env, { id: 'device-one-1', name: 'Sam', score: 30, avatar: LOOK });
  await post(env, { id: 'device-two-2', name: 'Sam', score: 20, avatar: LOOK2 });
  const res = await call(env, '/scores', 'GET'), text = await res.clone().text(), top = await res.json();
  assert.deepEqual(top.map((r) => [r.name, r.score, r.avatar]), [['Sam', 30, LOOK], ['Sam', 20, LOOK2]]);
  assert.ok(top.every((r) => /^[0-9a-f]{16}$/.test(r.key)) && top[0].key !== top[1].key);
  assert.ok(!text.includes('device-one-1') && !text.includes('device-two-2') && !top.some((r) => 'id' in r));
  const { rowKey } = await import('../src/rowkey.js');
  assert.equal(top[0].key, await rowKey('device-one-1')); // the client can find its own row
  // admin removal by id works as before
  const admin = { ...env, ADMIN_TOKEN: 't' };
  await worker.fetch(new Request('https://w.test/admin/scores?id=device-one-1', { method: 'DELETE', headers: { Authorization: 'Bearer t' } }), admin);
  assert.deepEqual((await (await call(env, '/scores', 'GET')).json()).map((r) => r.score), [20]);
});

test('old stored rows without a look are still served', async () => {
  const env = { LUNDEN: kv() };
  await env.LUNDEN.put('scores', JSON.stringify([{ id: 'legacy-aaaaaa', name: 'Gammal', score: 99, updated: 1 }]));
  const top = await (await call(env, '/scores', 'GET')).json();
  assert.deepEqual(top.map((r) => [r.name, r.score, r.avatar, typeof r.key]), [['Gammal', 99, undefined, 'string']]);
});
