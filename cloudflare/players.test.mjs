// The players' room (#666): connection, forwarding, the monthly cost cap, rate / size / player limits, idle close and
// the admin brake. Runs the real Worker + PlayerRoom on Node with the runtime stand-ins in devws.mjs.
//   node --test cloudflare/players.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { PLAYERS, CLOSE, COMBAT } from './players.js';

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
  assert.deepEqual(b.got[0].ps, [{ i: a.got[0].i, n: 'Olofb', p: [1.23, 0.5, 9.88], r: 0.5, score: 0, h: '' }]);
  assert.equal(b.got[0].c.lives, COMBAT.lives);
  assert.deepEqual(a.got.at(-1), { t: 'j', i: b.got[0].i, n: '' });
  b.send({ p: [2, 0, 3], r: -1 });
  b.send('not json'); b.send({ p: [1, 2], r: 0 }); b.send({ p: [1e9, 0, 0], r: 0 });
  await settle(env);
  assert.deepEqual(a.states(), [{ t: 's', i: b.got[0].i, p: [2, 0, 3], r: -1, score: 0, h: '' }]);
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

test('combat (#667): only armed vs armed, range, rate, points per minute; lives count down, death refills', async () => {
  const env = setup();
  const a = await connect(env, 'A'), b = await connect(env, 'B');
  const ia = a.got[0].i, ib = b.got[0].i;
  const hits = () => a.got.filter((m) => m.t === 'hit'), hurts = () => b.got.filter((m) => m.t === 'hurt');
  const fire = async (w = 'nerf') => { now += 1000; b.send('p'); a.send({ t: 'f', w, to: ib }); await settle(env); };
  a.send({ p: [0, 0, 0], r: 0, h: 'nerf' }); b.send({ p: [0, 0, 6], r: 0, h: '' }); await settle(env);
  await fire();
  assert.equal(hits().length, 0, 'an unarmed target cannot be hit');
  b.send({ p: [0, 0, 6], r: 0, h: 'bazooka' }); await settle(env);
  assert.equal(a.states().at(-1).h, '', 'an unknown weapon is no weapon');
  await fire();
  assert.equal(hits().length, 0);
  b.send({ p: [0, 0, 6], r: 0, h: 'saber' }); await settle(env);
  await fire('rifle');
  assert.equal(hits().length, 0, 'the shooter must hold the weapon it claims');
  await fire();
  assert.deepEqual(hits().at(-1), { t: 'hit', to: ib, w: 'nerf', l: COMBAT.lives - 1, dead: false });
  assert.deepEqual(hurts().at(-1), { t: 'hurt', by: ia, n: 'A', w: 'nerf', l: COMBAT.lives - 1, dead: false });
  a.send({ t: 'f', w: 'nerf', to: ib }); await settle(env);
  assert.equal(hits().length, 1, 'not sooner than `every`');
  b.send({ p: [0, 0, 30], r: 0, h: 'saber' }); await settle(env);
  await fire();
  assert.equal(hits().length, 1, 'out of range (+ slack)');
  b.send({ p: [0, 0, 6], r: 0, h: 'saber' }); await settle(env);
  for (let i = 0; i < 20; i++) await fire();
  const perMinute = COMBAT.perMinute / COMBAT.points;
  assert.equal(hits().length, perMinute, 'at most perMinute points a minute');
  const ls = hurts().map((h) => h.l), died = hurts().findIndex((h) => h.dead);
  assert.deepEqual(ls.slice(0, COMBAT.lives), Array.from({ length: COMBAT.lives }, (_, k) => COMBAT.lives - 1 - k), 'one life per hit');
  assert.equal(died, COMBAT.lives - 1, 'out of lives on the last one');
  assert.equal(ls[died + 1], COMBAT.lives - 1, 'full lives again after dying');
  now += 60_000;
  const n = hits().length;
  await fire();
  assert.equal(hits().length, n + 1, 'a new minute, new points');
  b.send({ t: 'f', w: 'saber', to: ia }); await settle(env);
  assert.equal(b.got.filter((m) => m.t === 'hit').length, 0, 'a saber at 6 m (range + slack 5 m) does not reach');
});

test('shots (#667): every shot goes to the armed others only, from near the shooter, checked; `to` scores as a hit', async () => {
  const env = setup();
  const a = await connect(env, 'A'), b = await connect(env, 'B'), c = await connect(env, 'C');
  const ib = b.got[0].i;
  const shots = (x) => x.got.filter((m) => m.t === 'a');
  a.send({ p: [0, 0, 0], r: 0, h: 'ball' }); b.send({ p: [0, 0, 3], r: 0, h: 'nerf' }); c.send({ p: [1, 0, 3], r: 0 }); await settle(env);
  now += 1000;
  a.send({ t: 'a', w: 'ball', o: [0.123, 1.456, -0.2], d: [0, 0.6, -0.8], s: 6.789 }); await settle(env);
  assert.deepEqual(shots(b), [{ t: 'a', i: a.got[0].i, w: 'ball', o: [0.12, 1.46, -0.2], d: [0, 0.6, -0.8], s: 6.79 }], 'a miss is drawn by the armed other');
  assert.equal(shots(c).length, 0, 'not sent to someone unarmed');
  assert.equal(b.got.filter((m) => m.t === 'hurt').length, 0, 'no `to`: no hit');
  now += 1000;
  a.send({ t: 'a', w: 'nerf', o: [0, 1.5, 0], d: [0, 0, 1] }); // not the weapon it holds
  a.send({ t: 'a', w: 'ball', o: [20, 1.5, 0], d: [0, 0, 1] }); // far from where it stands
  a.send({ t: 'a', w: 'ball', o: [0, 1.5, 0], d: [0, 0, 3] }); // not a unit direction
  a.send({ t: 'a', w: 'ball', o: [0, 1.5, 0], d: [0, 0, 1], s: 500 }); // impossible speed
  await settle(env);
  assert.equal(shots(b).length, 1, 'bad shots are dropped');
  now += 1000;
  a.send({ t: 'a', w: 'ball', o: [0, 1.5, 0], d: [0, 0, 1], s: 5, to: ib }); await settle(env);
  assert.equal(shots(b).length, 2);
  assert.equal(b.got.filter((m) => m.t === 'hurt').length, 1, 'a shot with `to` is checked as a hit');
  assert.equal(b.got.find((m) => m.t === 'a' && m.to), undefined, 'the target id is not passed on');
  // #690: the bow is a weapon; its arrow carries the draw's speed
  a.send({ p: [0, 0, 0], r: 0, h: 'bow' }); await settle(env);
  now += 1000;
  a.send({ t: 'a', w: 'bow', o: [0, 1.5, 0], d: [0, 0.1, 0.995], s: 42 }); await settle(env);
  assert.deepEqual(shots(b).at(-1), { t: 'a', i: a.got[0].i, w: 'bow', o: [0, 1.5, 0], d: [0, 0.1, 0.995], s: 42 });
});

test.after(() => { Date.now = realNow; });

// Score rides the same bounded state: no new message type or billing path.
test('ghost score is forwarded, included on welcome and bounded like leaderboard', async () => {
  const env = setup(), a = await connect(env, 'Olof'), b = await connect(env);
  a.send({ p: [1, 0, 2], r: 0, score: 1234.8 }); await settle(env);
  assert.equal(b.states().at(-1).score, 1234);
  const c = await connect(env, 'Third');
  assert.equal(c.got[0].ps.find(p => p.n === 'Olof').score, 1234);
  for (const [score, expected] of [[-1, 0], [1e9, 1e7], ['5', 0], [null, 0]]) {
    now += 1000;
    a.send({ p: [1, 0, 2], r: 0, score }); await settle(env);
    assert.equal(b.states().at(-1).score, expected);
  }
});
