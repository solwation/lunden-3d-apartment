// The players' room (#666): connection, forwarding, the monthly cost cap, rate / size / player limits, idle close and
// the admin brake. Runs the real Worker + PlayerRoom on Node with the runtime stand-ins in devws.mjs.
//   node --test cloudflare/players.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { PLAYERS, CLOSE } from './players.js';

installRuntime();
const realNow = Date.now;
let now = Date.UTC(2026, 9, 11, 12);
Date.now = () => now;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };

function setup() {
  const env = { ADMIN_TOKEN: 'tok' };
  env.PLAYERS = fakeNamespace(PlayerRoom, env);
  return env;
}
const bill = (env) => env.PLAYERS.ctx('world').data.get(`bill:${new Date(now).toISOString().slice(0, 7)}`) ?? { req: 0, msg: 0 };

async function connect(env, name = '', origin = 'https://solwation.github.io') {
  const r = await worker.fetch(new Request(`https://w/players${name ? `?n=${encodeURIComponent(name)}` : ''}`,
    { headers: { Upgrade: 'websocket', ...(origin ? { Origin: origin } : {}) } }), env);
  const ws = r.webSocket, c = { r, ws, got: [], closed: null };
  ws?.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
  ws?.addEventListener('close', (e) => { c.closed = e.code; });
  c.states = () => c.got.filter((m) => m.t === 's');
  c.send = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  await settle(env);
  return c;
}
const admin = (env, method, what = 'players', token = 'tok') => worker.fetch(new Request(`https://w/admin/${what}`, { method, headers: { Authorization: `Bearer ${token}` } }), env);

test('two players see each other: welcome, join, forwarded and cleaned states, leave', async () => {
  const env = setup();
  const a = await connect(env, 'Olof<b>');
  assert.equal(a.r.status, 101);
  assert.equal(a.got[0].t, 'w'); assert.deepEqual(a.got[0].ps, []);
  a.send({ p: [1.234, 0.5, 9.876], r: 0.5, junk: 'x'.repeat(50) });
  await settle(env);
  const b = await connect(env); // no name: shown as "Anonym" by the clients
  assert.deepEqual(b.got[0].ps, [{ i: a.got[0].i, n: 'Olofb', p: [1.23, 0.5, 9.88], r: 0.5 }]);
  assert.deepEqual(a.got.at(-1), { t: 'j', i: b.got[0].i, n: '' });
  b.send({ p: [2, 0, 3], r: -1 });
  b.send('not json'); b.send({ p: [1, 2], r: 0 }); b.send({ p: [1e9, 0, 0], r: 0 });
  await settle(env);
  assert.deepEqual(a.states(), [{ t: 's', i: b.got[0].i, p: [2, 0, 3], r: -1 }]);
  assert.equal(b.states().length, 0, 'never echoed to the sender');
  b.ws.close(1000);
  await settle(env);
  assert.deepEqual(a.got.at(-1), { t: 'x', i: b.got[0].i });
});

test('requests and messages are counted (1 + 1/20); heartbeats are auto-answered and not counted; counter survives hibernation', async () => {
  const env = setup();
  const a = await connect(env), b = await connect(env);
  const before = bill(env);
  assert.equal(before.req, 2);
  a.send('p'); await settle(env);
  assert.equal(a.got.at(-1), 'q');
  for (let i = 0; i < PLAYERS.flushEvery + 10; i++) { if (i % 5 === 0) now += 1000; a.send({ p: [i, 0, 0], r: 0 }); }
  await settle(env);
  assert.equal(bill(env).msg, PLAYERS.flushEvery, 'written every flushEvery messages, the heartbeat not among them');
  env.PLAYERS.hibernate('world'); // memory gone: at most flushEvery messages uncounted
  b.send({ p: [0, 0, 0], r: 0 }); await settle(env);
  assert.ok(bill(env).msg >= PLAYERS.flushEvery);
  assert.equal(a.states().length, 1, 'the room still forwards after hibernation (attachments kept)');
});

test('rate limit: over perSecond dropped, repeated seconds close (4008); oversized closes (1009)', async () => {
  const env = setup();
  const a = await connect(env), b = await connect(env);
  for (let i = 0; i < 10; i++) a.send({ p: [i, 0, 0], r: 0 });
  await settle(env);
  assert.equal(b.states().length, PLAYERS.perSecond);
  let seconds = 1;
  while (a.closed === null && seconds < 20) { now += 1000; seconds++; for (let i = 0; i < 10; i++) a.send({ p: [i, 0, 0], r: 0 }); await settle(env); }
  assert.equal(a.closed, CLOSE.rate);
  assert.equal(seconds, PLAYERS.strikes, 'closed after `strikes` flooding seconds');
  assert.deepEqual(b.got.at(-1), { t: 'x', i: a.got[0].i });
  // an honest 5 Hz client is never closed
  const c = await connect(env);
  for (let s = 0; s < 20; s++) { for (let i = 0; i < 5; i++) { now += 200; c.send({ p: [s, 0, i], r: 0 }); } await settle(env); }
  assert.equal(c.closed, null);
  c.send(JSON.stringify({ p: [0, 0, 0], r: 0, pad: 'x'.repeat(PLAYERS.maxBytes) }));
  await settle(env);
  assert.equal(c.closed, CLOSE.big);
});

test('max players; idle sockets closed; bad origin and plain requests refused', async () => {
  const env = setup();
  const all = [];
  for (let i = 0; i < PLAYERS.maxPlayers; i++) all.push(await connect(env, `p${i}`));
  const extra = await connect(env, 'extra');
  assert.equal(extra.closed, CLOSE.full);
  now += PLAYERS.idleMs - 5000;
  all[1].send('p'); // a heartbeat keeps p1
  for (let i = 2; i < all.length; i++) all[i].send({ p: [i, 0, 0], r: 0 });
  await settle(env);
  now += 10_000;
  all[2].send({ p: [0, 0, 0], r: 1 });
  await settle(env);
  assert.equal(all[0].closed, CLOSE.idle, 'silent for > idleMs');
  assert.equal(all[1].closed, null, 'the heartbeat counts');
  assert.ok(all[2].got.some((m) => m.t === 'x' && m.i === all[0].got[0].i));
  const evil = await connect(env, 'x', 'https://evil.example');
  assert.equal(evil.r.status, 403);
  const plain = await worker.fetch(new Request('https://w/players'), env);
  assert.equal(plain.status, 426);
  for (const c of all) c.ws.close(1000);
  await settle(env);
});

test('monthly cap: crossing it closes everybody (4001), new sockets refused without reaching the room, back next month', async () => {
  const env = setup();
  const a = await connect(env), b = await connect(env);
  const room = env.PLAYERS.object('world');
  await room.usage();
  room.bill.req = PLAYERS.monthlyCap - 1; room.bill.msg = PLAYERS.msgPerRequest - 2; await room.save();
  a.send({ p: [1, 0, 0], r: 0 }); await settle(env);
  assert.equal(b.states().length, 1);
  a.send({ p: [2, 0, 0], r: 0 }); await settle(env);
  assert.equal(a.closed, CLOSE.cap); assert.equal(b.closed, CLOSE.cap);
  assert.ok(room.billed() >= PLAYERS.monthlyCap);
  const c = await connect(env);
  assert.equal(c.closed, CLOSE.cap);
  const reqs = bill(env).req;
  const d = await connect(env);
  assert.equal(d.closed, CLOSE.cap);
  assert.equal(bill(env).req, reqs, 'the Worker remembers the cap: no further Durable Object request this month');
  now = Date.UTC(2026, 10, 1, 0, 0, 1); // November
  const e = await connect(env);
  assert.equal(e.closed, null); assert.equal(e.got[0].t, 'w');
  assert.equal(bill(env).req, 1);
  e.ws.close(1000); await settle(env);
});

test('admin brake: DELETE /admin/players and /admin/all close and switch off, PUT switches on, token required', async () => {
  const env = setup();
  const kv = new Map();
  env.LUNDEN = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), delete: async (k) => kv.delete(k), list: async () => ({ keys: [], list_complete: true }) };
  const a = await connect(env);
  assert.equal((await admin(env, 'DELETE', 'players', 'wrong')).status, 403);
  assert.equal(a.closed, null);
  const r = await admin(env, 'DELETE');
  assert.equal(r.status, 200); assert.equal((await r.json()).off, true);
  await settle(env);
  assert.equal(a.closed, CLOSE.off);
  assert.equal((await connect(env)).closed, CLOSE.off);
  const on = await (await admin(env, 'PUT')).json();
  assert.equal(on.off, false);
  const b = await connect(env);
  assert.equal(b.closed, null);
  const status = await (await admin(env, 'GET')).json();
  assert.equal(status.players, 1); assert.equal(status.cap, PLAYERS.monthlyCap); assert.ok(status.billed > 0);
  kv.set('paper', '{}');
  assert.equal((await admin(env, 'DELETE', 'all')).status, 200);
  await settle(env);
  assert.equal(b.closed, CLOSE.off, '/admin/all stops the players too');
  assert.equal(kv.has('paper'), false, '/admin/all still clears the rest');
  await admin(env, 'PUT');
});

test.after(() => { Date.now = realNow; });
