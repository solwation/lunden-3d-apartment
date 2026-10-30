// The shared spray paint (#1724): validation and size of a block, the room's union (dedup, 72 h, cap), the per-connection and
// per-room limits, and two clients (real GraffitiSync + Graffiti store) through the real Worker + PlayerRoom (devws.mjs), also
// across a hibernation.   node --test cloudflare/graffiti.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRAY } from '../src/config.js';
import { RoomGraffiti, cleanGraffiti, cleanSpot, spotKey, GRAFFITI_SYNC as G } from './graffiti.js';
import { PLAYERS, GRAFFITI_SYNC } from './players.js';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';

const H = 3600;
const T0 = Date.UTC(2026, 9, 30, 12);
const spot = (i, t = T0 / 1000, c = 0) => [r(i * 0.05), 1.5, r(-i * 0.03), 0, 0, 1, c, 30, Math.round(t)];
const r = (v) => Math.round(v * 100) / 100;
const msg = (s) => JSON.stringify({ t: 'gf', s });

test('the server limits are exported from players.js and equal the client\'s', () => {
  assert.equal(GRAFFITI_SYNC, G);
  assert.equal(G.block, SPRAY.share.block, 'block size kept equal by hand');
  assert.ok(SPRAY.share.every >= G.every, 'the client never sends faster than the room accepts');
});

test('cleanGraffiti: a full block of the widest spots fits maxBytes; malformed blocks are refused', () => {
  const wide = Array.from({ length: G.block }, () => [-4999.99, -4999.99, -4999.99, -0.58, -0.58, -0.58, SPRAY.cans.length - 1, 100, 9999999999]);
  const text = msg(wide);
  assert.ok(text.length <= G.maxBytes, `${text.length} ≤ ${G.maxBytes}`);
  assert.equal(cleanGraffiti(text).s.length, G.block);
  assert.ok(G.maxBytes > PLAYERS.maxBytes, 'the one bigger message type');
  const good = spot(1);
  assert.deepEqual(cleanSpot([1.234, 2, 3, 0, 1, 0, 2, 40, 5]), [1.23, 2, 3, 0, 1, 0, 2, 40, 5]);
  for (const bad of [
    msg([]), msg(Array(G.block + 1).fill(good)), msg([good, [1, 2, 3]]), msg([good, [...good.slice(0, 6), SPRAY.cans.length, 30, 1]]),
    msg([[...good.slice(0, 7), 101, 1]]), msg([[...good.slice(0, 7), 1, 1]]), msg([[0, 0, 0, 0, 0, 0, 0, 30, 1]]), msg([[0, 0, 0, 2, 0, 0, 0, 30, 1]]),
    msg([[6000, 0, 0, 0, 1, 0, 0, 30, 1]]), msg([[0, 'x', 0, 0, 1, 0, 0, 30, 1]]), msg([[0, 0, 0, 0, 1, 0, 0.5, 30, 1]]), msg([[0, 0, 0, 0, 1, 0, 0, 30, 1.5]]),
    JSON.stringify({ t: 'gf' }), JSON.stringify({ t: 'gf', s: 'x' }), '{"t":"gf",', 'nope', JSON.stringify({ t: 'm', s: [good] }),
    msg(Array(G.block).fill(good)).replace('{"t":"gf"', '{"t":"gf","pad":"' + 'x'.repeat(G.maxBytes) + '"'),
  ]) assert.equal(cleanGraffiti(bad), null, bad.slice(0, 120));
});

// --- the room in memory ---
function room() {
  const peers = [], inbox = new Map();
  const g = new RoomGraffiti(() => peers, (ws, text) => inbox.get(ws).push(JSON.parse(text)));
  const join = (id, now = T0) => { const p = { ws: { id }, a: { i: id, t: now } }; inbox.set(p.ws, []); const others = [...peers]; peers.push(p); g.join(p.ws, others, now); return p; };
  const box = (p) => inbox.get(p.ws);
  return { g, peers, join, box };
}
const up = (R, p, s, now) => R.g.handle(p.ws, p.a, cleanGraffiti(msg(s)), now);

test('union: a newcomer gets every spot, new ones go to the others, duplicates are free and not passed on', () => {
  const R = room(), a = R.join('A');
  assert.deepEqual(R.box(a)[0], { t: 'gf', w: 1, s: [] }, 'an empty snapshot is still sent');
  assert.equal(up(R, a, [spot(1), spot(2)], T0 + 1000), 2);
  const b = R.join('B', T0 + 2000);
  assert.deepEqual(R.box(b)[0].s, [spot(1), spot(2)]);
  assert.equal(up(R, b, [spot(2), spot(3)], T0 + 3000), 1, 'only the new one');
  assert.deepEqual(R.box(a).at(-1), { t: 'gf', s: [spot(3)] });
  assert.equal(R.box(b).length, 1, 'never echoed to the sender');
  assert.equal(R.g.count, 3);
  assert.equal(spotKey(spot(3)), `${spot(3)[0]},1.5,${spot(3)[2]},0,${spot(3)[8]}`);
});

test('72 h: expired spots are refused and pruned, future ones refused', () => {
  const R = room(), a = R.join('A'), now = T0 + 1000, sec = now / 1000;
  assert.equal(up(R, a, [spot(1, sec - SPRAY.hours * H - 1), spot(2, sec + G.future + 5), spot(3, sec - SPRAY.hours * H + 60)], now), 1);
  const later = now + 61_000, b = R.join('B', later);
  assert.equal(R.box(b)[0].s.length, 0, 'the 72 h old spot is gone for a newcomer');
  assert.equal(R.g.count, 0);
});

test('cap: the room keeps the newest SPRAY.max spots', () => {
  const R = room(), peers = Array.from({ length: 12 }, (_, i) => R.join(`P${i}`)), per = G.block;
  let now = T0, n = 0;
  for (let k = 0; n < SPRAY.max + 200; k++) {
    const p = peers[k % peers.length]; now += 1000;
    const s = Array.from({ length: per }, (_, j) => spot(n + j, T0 / 1000 - 3600 + n + j));
    n += up(R, p, s, now);
  }
  assert.equal(R.g.count, SPRAY.max);
  const list = R.g.list();
  assert.equal(list[0][8], T0 / 1000 - 3600 + n - SPRAY.max, 'the oldest went first');
  assert.equal(up(R, peers[0], [spot(99999, T0 / 1000 - 7200)], now + 5000), 0, 'an older spot than the whole full union is not passed on');
  assert.equal(R.g.count, SPRAY.max);
});

test('limits: one block per connection a second, a bucket per connection, a budget per room', () => {
  const R = room(), a = R.join('A');
  let now = T0 + 1000;
  assert.equal(up(R, a, [spot(1)], now), 1);
  assert.equal(up(R, a, [spot(2)], now + 500), 0, 'too soon');
  // the bucket: SPRAY.max at once, then perSecond a second
  let got = 0, i = 10;
  for (let k = 0; k < 20; k++) { now += 1000; got += up(R, a, Array.from({ length: G.block }, () => spot(i++)), now); }
  assert.ok(got <= G.burst + 20 * G.perSecond && got >= G.burst - 1, `bucket: ${got}`);
  now += 1000;
  const after = up(R, a, Array.from({ length: G.block }, () => spot(i++)), now);
  assert.ok(after <= G.perSecond + 1, `refill ≤ ${G.perSecond}/s: ${after}`);
  // the room's minute: many connections together stop at roomPerMinute
  const R2 = room(), ps = Array.from({ length: 30 }, (_, k) => R2.join(`Q${k}`));
  let sum = 0, j = 0; now = T0 + 1000;
  for (let round = 0; round < 3; round++) { now += 1000; for (const p of ps) sum += up(R2, p, Array.from({ length: G.block }, () => spot(j++, T0 / 1000)), now); }
  assert.ok(sum <= G.roomPerMinute, `room budget: ${sum}`);
  assert.equal(R2.g.rn, G.roomPerMinute, 'the room stopped at its minute budget');
});

test('memory lost (hibernation): the first newcomer makes the most recently active player send everything', () => {
  const R = room(), a = R.join('A'), b = R.join('B');
  assert.ok(![...R.box(a), ...R.box(b)].some((m) => m.k === 'ask'), 'a room that saw its players arrive asks nobody');
  a.a.t = T0 + 10; b.a.t = T0 + 20;
  const c = { ws: { id: 'C' }, a: { i: 'C', t: T0 + 30 } }, mine = [];
  const woken = new RoomGraffiti(() => [...R.peers, c], (ws, text) => (ws === c.ws ? mine : R.peers.some((p) => p.ws === ws) ? R.box(R.peers.find((p) => p.ws === ws)) : []).push(JSON.parse(text)));
  woken.handle(a.ws, a.a, cleanGraffiti(msg([spot(7)])), T0 + 25); // a live spot reaches the woken room before anybody joins
  woken.join(c.ws, R.peers, T0 + 30);
  assert.deepEqual(R.box(b).at(-1), { t: 'gf', k: 'ask' }, 'B (most recently active) is asked');
  assert.ok(!R.box(a).some((m) => m.k === 'ask'), 'only one player is asked');
  assert.deepEqual(mine.at(-1), { t: 'gf', w: 1, s: [spot(7)] }, 'the newcomer gets what the woken room has; the asked player fills in the rest');
  woken.join({ id: 'D' }, [...R.peers, c], T0 + 40);
  assert.equal(R.box(b).filter((m) => m.k === 'ask').length, 1, 'asked once per lost memory');
});

// --- two real clients through the Worker ---
installRuntime();
let now = T0;
Date.now = () => now;
const tick = () => new Promise((res) => setTimeout(res, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };

const { readSpots, writeSpots, mergeSpots, wireKey, spotWire } = await import('../src/graffitiwire.js');
const { GraffitiSync } = await import('../src/graffitisync.js');
/** The client's paint store without three.js (src/graffiti.js's `add` / `merge` / `save` / `load` / `prune` on the same records). */
class Store {
  constructor(storage) { this.storage = storage; this.load(); }
  get count() { return this.spots.length; }
  load() { this.spots = readSpots(this.storage.get('g') ?? '', now); }
  save() { this.storage.set('g', writeSpots(this.spots)); }
  add(i, c) { this.spots.push({ p: [i * 0.1, 1.2, 3], n: [0, 0, 1], c, s: 0.3, t: now }); this.onSpot?.(); }
  merge(list) { const r = mergeSpots(this.spots, list, now); this.spots = r.spots; return r.added; }
  prune() { this.spots = this.spots.filter((s) => now - s.t < SPRAY.hours * H * 1000); }
}
const mem = () => { const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, v) }; };

async function client(env, storage) {
  const g = new Store(storage);
  const c = { g, storage, ws: null, me: null, sent: 0 };
  c.sync = new GraffitiSync(g, { ready: () => !!c.ws, me: () => c.me, send: (m) => { c.ws.send(JSON.stringify(m)); c.sent++; return true; } });
  c.connect = async () => {
    const res = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
    c.ws = res.webSocket;
    c.ws.addEventListener('message', (e) => { if (e.data === 'q') return; const m = JSON.parse(e.data); if (m.t === 'w') c.me = m.i; if (m.t === 'gf') c.sync.receive(m); });
    await settle(env);
  };
  c.paint = (i, col = 0) => g.add(i, col);
  c.run = async (secs) => { for (let t = 0; t < secs; t += 0.2) { now += 200; c.sync.tick(0.2); await settle(env); } };
  return c;
}
const keys = (c) => c.g.spots.map((s) => wireKey(spotWire(s))).sort();

test('two clients see each other\'s spots, keep them after a reload, lose them after 72 h; a hibernated room recovers', async () => {
  const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
  const A = await client(env, mem()), B = await client(env, mem());
  for (let i = 0; i < 30; i++) { now += 60; A.paint(i, 0); }   // A painted before connecting: stored locally
  await A.connect(); await A.run(2);
  await B.connect(); await B.run(2);
  assert.equal(B.g.count, 30, 'B got A\'s stored spots on joining');
  for (let i = 0; i < 25; i++) { now += 50; B.paint(100 + i, 1); }
  await B.run(3); await A.run(1);
  assert.equal(A.g.count, 55, 'A got B\'s new spots');
  assert.deepEqual(keys(A), keys(B), 'the same spots on both');
  assert.ok(A.sent <= 2 && B.sent <= 2, `few messages: A ${A.sent}, B ${B.sent}`);
  // a reload: B's store is read back from localStorage
  B.g.save();
  const B2 = new Store(B.storage);
  assert.equal(B2.count, 55, 'kept after a reload');
  // the room hibernates (memory lost), a newcomer C joins: A or B is asked and re-sends; C gets everything
  env.PLAYERS.hibernate('world');
  const C = await client(env, mem());
  await C.connect(); await C.run(1); await A.run(3); await B.run(3); await C.run(1);
  assert.equal(C.g.count, 55, 'C got the union after the hibernation');
  assert.equal(env.PLAYERS.object('world').graffiti.count, 55);
  // 72 h later everything is gone (locally and in the room)
  now += SPRAY.hours * H * 1000 + 60_000;
  C.g.prune(); assert.equal(C.g.count, 0);
  B2.load(); assert.equal(B2.count, 0, 'gone after 72 h, also from the store');
  const D = await client(env, mem()); await D.connect();
  assert.equal(D.g.count, 0, 'the room hands out nothing older than 72 h');
});

test('through the Worker: a graffiti block may exceed PLAYERS.maxBytes up to its own limit; bigger closes the socket (1009)', async () => {
  const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
  const open = async () => {
    const res = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
    const c = { ws: res.webSocket, got: [], code: null };
    c.ws.addEventListener('message', (e) => c.got.push(JSON.parse(e.data)));
    c.ws.addEventListener('close', (e) => { c.code = e.code; });
    await settle(env); return c;
  };
  const A = await open(), B = await open();
  const sec = Math.round(now / 1000), block = Array.from({ length: G.block }, (_, i) => [i, 1, 2, 0, 0, 1, 1, 30, sec]);
  const text = msg(block);
  assert.ok(text.length > PLAYERS.maxBytes && text.length <= G.maxBytes);
  now += 2000; A.ws.send(text); await settle(env);
  assert.equal(A.code, null, 'not closed');
  assert.equal(B.got.filter((m) => m.t === 'gf' && !m.w).at(-1)?.s.length, G.block, 'B got the whole block');
  now += 2000; A.ws.send(msg([[0, 0, 0, 0, 1, 0, 0, 30, 'x']])); await settle(env);
  assert.equal(A.code, null, 'a malformed block is only dropped');
  assert.equal(B.got.filter((m) => m.t === 'gf' && !m.w).length, 1);
  now += 2000; A.ws.send(text.replace(']]}', ']],"pad":"' + 'x'.repeat(G.maxBytes) + '"}')); await settle(env);
  assert.equal(A.code, 1009, 'too big: closed');
  now += 2000; B.ws.send(JSON.stringify({ t: 'm', m: 'x'.repeat(PLAYERS.maxBytes) })); await settle(env);
  assert.equal(B.code, 1009, 'other messages keep PLAYERS.maxBytes');
});
