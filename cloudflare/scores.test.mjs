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
