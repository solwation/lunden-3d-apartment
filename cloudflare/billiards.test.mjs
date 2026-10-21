// The shared children's-room billiard table (#1355): presence, authoritative strokes, stale / simultaneous / foreign
// requests, seats, reconnect, empty room and the cost budget. Real Worker + PlayerRoom on Node (devws.mjs).
//   node --test cloudflare/billiards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { PLAYERS, cleanPool, inPlayroom } from './players.js';
import { PLAYROOM } from '../src/config.js';
import { freshTable, validSnapshot, simulateStroke, cleanDirection } from '../src/billiardsync.js';

installRuntime();
let now = Date.UTC(2026, 9, 18, 12);
Date.now = () => now;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
const setup = () => { const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env); return env; };
async function connect(env) {
  const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
  const c = { ws: r.webSocket, got: [], closed: null };
  c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
  c.ws.addEventListener('close', (e) => { c.closed = e.code; });
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.pool = () => c.got.filter((m) => m.t === 'pool');
  c.last = () => c.pool().at(-1);
  await settle(env);
  return c;
}
const ROOM = [PLAYROOM.x + PLAYROOM.billiards.x, 0, PLAYROOM.z + PLAYROOM.billiards.z + 1.2], OUT = [0, 0, 0];
const place = async (env, c, p) => { now += 250; c.send({ p, r: 0 }); await settle(env); };
const act = async (env, c, m) => { now += 700; c.send({ t: 'pool', ...m }); await settle(env); };
const rest = (ms) => { now += ms + 400; };
const table = (env) => env.PLAYERS.object('world').pool;

test('cleanPool / inPlayroom / cleanDirection validate bounded input', () => {
  assert.deepEqual(cleanPool(JSON.stringify({ t: 'pool', k: 's', q: 3, d: [3, 4] })), { k: 's', q: 3, d: [0.6, 0.8] });
  assert.deepEqual(cleanPool(JSON.stringify({ t: 'pool', k: 'r', q: 0, d: 'x' })), { k: 'r', q: 0 });
  for (const bad of [{ k: 's', q: 1 }, { k: 's', q: 1, d: [0, 0] }, { k: 's', q: 1, d: [NaN, 1] }, { k: 's', q: 1, d: [1e9, 1] }, { k: 's', q: -1, d: [1, 0] }, { k: 's', q: 1.5, d: [1, 0] },
    { k: 'x', q: 1 }, { k: 's', d: [1, 0] }, { k: 's', q: 1, d: [1, 0, 0] }, { k: 's', q: 1, d: ['1', 0] }]) assert.equal(cleanPool(JSON.stringify({ t: 'pool', ...bad })), null, JSON.stringify(bad));
  assert.equal(cleanPool('nope'), null); assert.equal(cleanDirection([0, 1e-9]), null);
  assert.ok(inPlayroom(ROOM)); assert.ok(!inPlayroom(OUT)); assert.ok(!inPlayroom([PLAYROOM.x, 5, PLAYROOM.z]));
});

test('only players in the room get the table and strokes; a stroke from outside is refused', async () => {
  const env = setup();
  const a = await connect(env), b = await connect(env), far = await connect(env);
  await place(env, far, OUT);
  assert.equal(far.pool().length, 0);
  await place(env, a, ROOM);
  assert.equal(a.last().k, 'T'); assert.ok(validSnapshot(a.last().e)); assert.equal(a.last().e.m, 'free');
  await act(env, far, { k: 's', q: 1, d: [1, 0] });
  assert.deepEqual(far.last(), { t: 'pool', k: 'no', why: 'away' });
  await place(env, b, ROOM); // b enters: gets the existing table, a hears nothing new
  assert.equal(b.last().k, 'T'); assert.deepEqual(b.last().e, a.last().e);
  const n = a.pool().length;
  await act(env, a, { k: 's', q: 1, d: [1, 0.2] });
  const sa = a.last(), sb = b.last();
  assert.equal(sa.k, 'S'); assert.deepEqual(sb, sa, 'both see the same stroke and end state');
  assert.equal(sa.e.q, 2); assert.equal(a.pool().length, n + 1); assert.equal(far.pool().length, 1, 'outside players see nothing');
  const local = simulateStroke(PLAYROOM.billiards, b.pool()[0].e, sa.d); // deterministic: a client can reproduce it from the start snapshot
  assert.deepEqual({ ...local.snap, q: 2 }, sa.e); assert.equal(local.ms, sa.ms);
  assert.deepEqual(table(env).snap, sa.e);
});

test('server reach follows the centred table rather than the old doorway position', async () => {
  const env=setup(), a=await connect(env);
  await place(env,a,[PLAYROOM.x,0,PLAYROOM.z+PLAYROOM.billiards.z-2.5]);
  await act(env,a,{k:'s',q:1,d:[1,0]});
  assert.equal(a.last().k,'S','north side is reachable around the new centre');
  rest(30000);
  await place(env,a,[PLAYROOM.x,0,PLAYROOM.z+1.5]);
  await act(env,a,{k:'s',q:2,d:[1,0]});
  assert.equal(a.last().why,'away','old entrance-side reach must not allow a remote stroke');
});

test('stale, simultaneous, early and malformed requests are refused; the table never forks', async () => {
  const env = setup();
  const a = await connect(env), b = await connect(env);
  await place(env, a, ROOM); await place(env, b, ROOM);
  now += 700; a.send({ t: 'pool', k: 's', q: 1, d: [1, 0] }); b.send({ t: 'pool', k: 's', q: 1, d: [-1, 0.1] }); // simultaneous: the same q
  await settle(env);
  assert.equal(a.last().k, 'S'); assert.equal(b.pool().filter((m) => m.k === 'S').length, 1);
  const refused = b.pool().filter((m) => m.k === 'no');
  assert.deepEqual(refused.map((m) => m.why), ['stale']); assert.equal(b.last().k, 'T', 'a stale sender is resynchronised with the table'); assert.equal(b.last().e.q, 2);
  const end = table(env).snap;
  await act(env, b, { k: 's', q: 1, d: [0, 1] }); // replay of an old q
  assert.equal(b.pool().at(-2).why, 'stale'); assert.deepEqual(table(env).snap, end);
  await act(env, b, { k: 's', q: 2, d: [0, 1] }); // right q but the balls are still rolling
  assert.equal(b.last().why, 'busy'); assert.deepEqual(table(env).snap, end);
  rest(5000);
  await act(env, b, { k: 's', q: 2, d: [0, 1] });
  assert.equal(b.last().k, 'S'); assert.equal(b.last().e.q, 3);
  for (const bad of ['{"t":"pool"}', '{"t":"pool","k":"s","q":3}', '{"t":"pool","k":"s","q":3,"d":[0,0]}', '{"t":"pool","k":"s","q":3,"d":[1,"x"]}', '{"t":"pool","k":"s","q":"3","d":[1,0]}']) { rest(5000); b.send(bad); await settle(env); }
  assert.equal(table(env).snap.q, 3); assert.equal(b.closed, null);
  rest(5000); // too fast: a second action inside the per-connection interval
  b.send({ t: 'pool', k: 's', q: 3, d: [1, 0] }); b.send({ t: 'pool', k: 'r', q: 4 }); await settle(env);
  assert.equal(table(env).snap.q, 4); assert.equal(b.last().why, 'fast');
});

test('8-ball turns: seats, foreign strokes refused, an absent holder is replaced, solo play works', async () => {
  const env = setup();
  const a = await connect(env), b = await connect(env), c = await connect(env);
  await place(env, a, ROOM); await place(env, b, ROOM); await place(env, c, OUT);
  await act(env, a, { k: 'm', q: 1 });
  assert.equal(a.last().e.m, 'eight'); assert.equal(b.last().e.q, 2); assert.equal(c.pool().length, 0);
  await act(env, a, { k: 's', q: 2, d: [1, 0.1] });
  assert.equal(a.last().k, 'S'); assert.deepEqual(table(env).st[0], a.got[0].i);
  const turn = a.last().e.t; // who goes next
  rest(5000);
  if (turn === 0) { // a keeps the turn: b may not shoot
    await act(env, b, { k: 's', q: 3, d: [0, 1] });
    assert.deepEqual(b.last(), { t: 'pool', k: 'no', why: 'turn' }); assert.equal(table(env).snap.q, 3);
  } else { // the turn passed to the free seat 2: a (holder of seat 1, somebody else present) may not, b takes it
    await act(env, a, { k: 's', q: 3, d: [0, 1] });
    assert.deepEqual(a.last(), { t: 'pool', k: 'no', why: 'turn' });
    await act(env, b, { k: 's', q: 3, d: [0, 1] });
    assert.equal(b.last().k, 'S'); assert.equal(table(env).st[1], b.got[0].i); assert.equal(table(env).snap.q, 4);
  }
  // a player outside the room and not seated never shoots
  await act(env, c, { k: 's', q: table(env).snap.q, d: [0, 1] });
  assert.equal(c.last().why, 'away');
  // the holder of the other seat leaves the room: the remaining player may play on, alone, on both sides
  b.ws.close(1000); await settle(env);
  for (let i = 0; i < 4; i++) { rest(6000); await act(env, a, { k: 's', q: table(env).snap.q, d: [Math.cos(i), Math.sin(i)] }); assert.equal(a.last().k, 'S', `solo stroke ${i}`); }
});

test('a late visitor and a reconnecting player get the existing table; hibernation keeps it; an empty room resets it', async () => {
  const env = setup();
  const a = await connect(env), b = await connect(env);
  await place(env, a, ROOM); await place(env, b, ROOM);
  await act(env, a, { k: 's', q: 1, d: [1, 0.3] });
  const played = a.last().e;
  env.PLAYERS.hibernate('world'); await settle(env); // memory lost, storage and sockets kept
  assert.deepEqual(table(env)?.snap ?? env.PLAYERS.ctx('world').data.get('pool').snap, played);
  b.ws.close(1000); await settle(env);
  const b2 = await connect(env); await place(env, b2, ROOM); // reconnect (new id) while a is still inside
  assert.deepEqual(b2.last().e, played, 'the existing table, not a new rack');
  rest(5000); await act(env, b2, { k: 's', q: played.q, d: [0, -1] });
  assert.equal(b2.last().k, 'S'); assert.deepEqual(a.last(), b2.last());
  await place(env, a, OUT); // a leaves the room, b2 stays: table kept
  assert.ok(env.PLAYERS.ctx('world').data.get('pool'));
  b2.ws.close(1000); await settle(env); // the room is empty: forgotten
  assert.equal(env.PLAYERS.ctx('world').data.get('pool'), undefined);
  const d = await connect(env); await place(env, d, ROOM);
  assert.equal(d.last().e.q, 1); assert.equal(d.last().e.m, 'free'); assert.deepEqual(d.last().e, freshTable(PLAYROOM.billiards, 'free', 1));
});

test('table messages are counted like any other message and stay small; no ball stream', async () => {
  const env = setup();
  const a = await connect(env); await place(env, a, ROOM);
  const before = env.PLAYERS.object('world').bill.msg;
  await act(env, a, { k: 's', q: 1, d: [1, 0] });
  assert.equal(env.PLAYERS.object('world').bill.msg - before, 1, 'one incoming message per stroke, one outgoing broadcast');
  assert.ok(JSON.stringify({ t: 'pool', k: 's', q: 1, d: [0.1234, -0.5678] }).length < PLAYERS.maxBytes);
  assert.equal(a.pool().filter((m) => m.k === 'S').length, 1, 'a stroke is ONE message, not a position stream');
  assert.ok(a.pool().every((m) => JSON.stringify(m).length < 700));
});
