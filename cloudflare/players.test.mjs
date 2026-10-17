// The players' room (#666): connection, forwarding, the monthly cost cap, rate / size / player limits, idle close and
// the admin brake. Runs the real Worker + PlayerRoom on Node with the runtime stand-ins in devws.mjs.
//   node --test cloudflare/players.test.mjs
import { test } from 'node:test';
import { PVP_SCORE, SCORE, pvpHitPoints, avatarLook } from '../src/config.js';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { PLAYERS, CLOSE, COMBAT, CHAT, cleanText } from './players.js';

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
// #1108: a player id is crypto.randomUUID().slice(0, 8) and picks the default avatar look, so tests that need a
// specific look must not reconnect until chance delivers one (that search failed ~2% of runs). Instead the next id
// matching `want` is found by a deterministic counter scan and handed to the room's real join path for this connection.
let lookSeq = 0x10000000;
async function connectLook(env, name, want) {
  let id;
  do id = (lookSeq++).toString(16); while (!want(avatarLook(id)));
  const randomUUID = crypto.randomUUID;
  crypto.randomUUID = () => `${id}-0000-4000-8000-000000000000`;
  try { return await connect(env, name); } finally { crypto.randomUUID = randomUUID; }
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
  assert.deepEqual(b.got[0].ps, [{ i: a.got[0].i, n: 'Olofb', p: [1.23, 0.5, 9.88], r: 0.5, score: 0, h: '', l: COMBAT.lives }]);
  assert.equal(b.got[0].c.lives, COMBAT.lives);
  assert.deepEqual(a.got.at(-1), { t: 'j', i: b.got[0].i, n: '', l: COMBAT.lives });
  b.send({ p: [2, 0, 3], r: -1 });
  b.send('not json'); b.send({ p: [1, 2], r: 0 }); b.send({ p: [1e9, 0, 0], r: 0 });
  await settle(env);
  assert.deepEqual(a.states(), [{ t: 's', i: b.got[0].i, p: [2, 0, 3], r: -1, score: 0, h: '', l: COMBAT.lives }]);
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
  const fire = async (w = 'nerf') => { now += 1000; b.send('p'); a.send({ t: 'f', w, to: ib, kill: '00000000-0000-4000-8000-000000000000' }); await settle(env); };
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
  assert.deepEqual(hits().at(-1), { t: 'hit', to: ib, w: 'nerf', l: COMBAT.lives - 1, dead: false, award: { i: ia, seq: 1, distance: 6, points: COMBAT.points } });
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
  const kills = hits().filter(h => h.dead);
  assert.ok(kills.length > 0 && kills.every(h => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(h.kill)), 'each accepted lethal hit has a server UUID receipt');
  assert.equal(new Set(kills.map(h => h.kill)).size, kills.length, 'distinct lethal hits have distinct receipts');
  assert.ok(kills.every(h => h.kill !== '00000000-0000-4000-8000-000000000000'), 'client-supplied kill receipt is ignored');
  assert.ok(hits().filter(h => !h.dead).every(h => !('kill' in h)), 'ordinary hits carry no death receipt');
  assert.ok(hurts().every(h => !('kill' in h)), 'victim hurt/death messages cannot award the shooter-only receipt');
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

test('greetings (#673): to someone here, a phrase index only, not too often; everybody else sees it', async () => {
  const env = setup();
  const a = await connect(env, 'A'), b = await connect(env, 'B'), c = await connect(env, 'C');
  const ia = a.got[0].i, ib = b.got[0].i;
  const greets = (x) => x.got.filter((m) => m.t === 'g');
  now += 5000;
  a.send({ t: 'g', to: ib, k: 2 }); await settle(env);
  assert.deepEqual(greets(b), [{ t: 'g', i: ia, to: ib, k: 2 }]);
  assert.deepEqual(greets(c), [{ t: 'g', i: ia, to: ib, k: 2 }], 'the others see the greeter wave too');
  assert.equal(greets(a).length, 0, 'not echoed');
  a.send({ t: 'g', to: ib, k: 1 }); await settle(env);
  assert.equal(greets(b).length, 1, 'not more often than greetEvery');
  now += 5000;
  a.send({ t: 'g', to: 'nobody', k: 1 }); a.send({ t: 'g', to: ib, k: 99 }); a.send({ t: 'g', to: ib, k: 'Hej!' }); a.send({ t: 'g', to: ia, k: 0 });
  await settle(env);
  assert.equal(greets(b).length, 1, 'unknown player, a phrase out of range, text, oneself: dropped');
  now += 5000;
  a.send({ t: 'g', to: ib, k: 0 }); await settle(env);
  assert.equal(greets(b).length, 2);
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

test('Nerf (#714): shared longer range accepts 22 m, rejects range/rate/unarmed and relays misses without hits', async () => {
  const { TOYS } = await import('../src/config.js');
  assert.equal(COMBAT.weapons.nerf.range, TOYS.nerf.dart.range);
  const env = setup(), a = await connect(env, 'A'), b = await connect(env, 'B'), id = b.got[0].i;
  const hits = () => a.got.filter((m) => m.t === 'hit');
  a.send({ p: [0, 0, 0], r: 0, h: 'nerf' }); b.send({ p: [0, 0, -22], r: 0, h: 'nerf' }); await settle(env);
  now += 1000;
  const shot = { t: 'a', w: 'nerf', o: [0, 1.5, 0], d: [0, 0, -1], s: TOYS.nerf.dart.speed, to: id };
  a.send(shot); await settle(env);
  assert.equal(hits().length, 1, 'server confirms beyond former 15 m limit');
  a.send(shot); await settle(env);
  assert.equal(hits().length, 1, 'same rate rule rejects immediate repeat');
  now += 1000; a.send({ ...shot, to: undefined }); await settle(env);
  assert.equal(hits().length, 1, 'miss does not produce hit confirmation');
  b.send({ p: [0, 0, -(TOYS.nerf.dart.range + COMBAT.slack + 1)], r: 0, h: 'nerf' }); await settle(env);
  now += 1000; a.send(shot); await settle(env);
  assert.equal(hits().length, 1, 'beyond shared range plus existing slack is denied');
  b.send({ p: [0, 0, -22], r: 0 }); await settle(env);
  now += 1000; a.send(shot); await settle(env);
  assert.equal(hits().length, 1, 'unarmed target is denied');
});

// Chat (#675): plain text to the others only, cleaned, within the per-connection and room limits, counted in the cap.
test('chat (#675): forwarded to the others with the name, cleaned, limited, refused with mx, counted in the cap', async () => {
  const env = setup();
  const a = await connect(env, 'Olof<script>'), b = await connect(env), c = await connect(env, 'C');
  const ia = a.got[0].i;
  const chats = (x) => x.got.filter((m) => m.t === 'm'), refused = (x) => x.got.filter((m) => m.t === 'mx').length;
  a.send({ t: 'm', m: '  Hej\u0000 <b>alla</b>\n\t\u202Eom\u200Bgänget  ' }); await settle(env);
  assert.deepEqual(chats(b), [{ t: 'm', i: ia, n: 'Olofscript', m: 'Hej <b>alla</b> om gänget' }], 'controls/bidi out, whitespace folded; markup stays plain text');
  assert.equal(chats(c).length, 1, 'to everyone else');
  const later = async (ms) => { now += ms; b.send("p"); c.send("p"); await settle(env); }; // heartbeats: nobody idles out
  assert.equal(chats(a).length, 0, 'never echoed to the sender');
  assert.equal(cleanText('é'.repeat(CHAT.max + 50)).length, CHAT.max, 'at most CHAT.max characters');
  assert.equal(Array.from(cleanText('😀'.repeat(CHAT.max + 5))).length, CHAT.max, 'counted in characters, not UTF-16 units');
  for (const bad of [{ t: 'm', m: '   ' }, { t: 'm', m: 42 }, { t: 'm' }, { t: 'mx' }, { m: 'no type', t: 'm' }]) a.send(bad);
  await settle(env);
  assert.equal(chats(b).length, 1, 'empty / non-text / other shapes dropped');
  // a burst, then one a second
  now += 10_000;
  for (let i = 0; i < CHAT.burst + 2; i++) a.send({ t: 'm', m: `burst ${i}` });
  await settle(env);
  assert.equal(chats(b).length, 1 + CHAT.burst, 'a burst of CHAT.burst passes');
  assert.equal(refused(a), 2, 'the rest gets { t: "mx" }');
  now += CHAT.everyMs; a.send({ t: 'm', m: 'after a second' }); await settle(env);
  assert.equal(chats(b).at(-1).m, 'after a second');
  // at most perMinute a minute
  await later(61_000);
  const n0 = chats(b).length;
  for (let i = 0; i < CHAT.perMinute + 5; i++) { now += CHAT.everyMs; a.send({ t: 'm', m: `m${i}` }); await settle(env); }
  assert.equal(chats(b).length - n0, CHAT.perMinute, 'at most perMinute in a minute');
  await later(61_000); a.send({ t: 'm', m: 'new minute' }); await settle(env);
  assert.equal(chats(b).at(-1).m, 'new minute');
  // the room's total
  const room = env.PLAYERS.object('world');
  now += 2000; room.rw = now; room.rn = CHAT.roomPerMinute; c.send({ t: 'm', m: 'too many in the room' }); await settle(env);
  assert.notEqual(chats(b).at(-1).m, 'too many in the room', 'the room-wide minute cap holds');
  assert.equal(c.got.at(-1).t, 'mx');
  // a chat line is billed like any message: over the monthly cap everyone is closed and nothing passes
  await room.usage();
  room.bill.req = PLAYERS.monthlyCap - 1; room.bill.msg = PLAYERS.msgPerRequest - 1; await room.save();
  await later(61_000); a.send({ t: 'm', m: 'over the cap' }); await settle(env);
  assert.equal(a.closed, CLOSE.cap); assert.equal(b.closed, CLOSE.cap);
  assert.notEqual(chats(b).at(-1).m, 'over the cap', 'nothing passes over the cap');
  assert.deepEqual([...env.PLAYERS.ctx('world').data.keys()].filter((k) => !k.startsWith('bill:')), [], 'nothing stored but the month counter');
});

// "skriver…" (#676): only the flag, to the others, rate-limited; off with the line, the close and a refresh
test('typing (#676): on / off forwarded, repeats limited, off by a line, never echoed, no text', async () => {
  const env = setup();
  const a = await connect(env, 'A'), b = await connect(env, 'B');
  const ia = a.got[0].i, ty = () => b.got.filter((m) => m.t === 'k');
  a.send({ t: 'k', on: true, m: 'secret letters' }); await settle(env);
  assert.deepEqual(ty(), [{ t: 'k', i: ia, on: true }], 'only the flag, no text');
  assert.equal(a.got.filter((m) => m.t === 'k').length, 0, 'never echoed');
  a.send({ t: 'k', on: true }); await settle(env);
  assert.equal(ty().length, 1, 'an "on" again soon is dropped');
  now += CHAT.typingRepeatMs; a.send({ t: 'k', on: true }); await settle(env);
  assert.equal(ty().length, 2, 'a refresh after typingRepeatMs passes');
  a.send({ t: 'k', on: false }); a.send({ t: 'k', on: false }); await settle(env);
  assert.deepEqual(ty().at(-1), { t: 'k', i: ia, on: false });
  assert.equal(ty().length, 3, 'off once: a repeated off is dropped');
  a.send({ t: 'k', on: true }); await settle(env);
  assert.equal(ty().length, 3, 'on again no sooner than typingEveryMs');
  now += CHAT.typingEveryMs; a.send({ t: 'k', on: true }); await settle(env);
  assert.equal(ty().length, 4);
  now += 1000; a.send({ t: 'm', m: 'klart' }); a.send({ t: 'k', on: false }); await settle(env);
  assert.equal(ty().length, 4, 'a line puts it off in the room: no separate off is passed on');
  assert.equal(b.got.filter((m) => m.t === 'm').at(-1).m, 'klart');
  for (let i = 0; i < 10; i++) { now += 100; a.send({ t: 'k', on: i % 2 === 0 }); }
  await settle(env);
  assert.ok(ty().length <= 4 + 4, `toggling fast stays limited (${ty().length - 4} passed)`);
});

// Public lives come from the same attachment as damage, never from client state.
test('public lives: observers, late join, forged state, hibernation and death reset', async () => {
  const previous = COMBAT.lives; COMBAT.lives = 3;
  try {
    const env = setup(), a = await connect(env, 'A'), b = await connect(env, 'B'), observer = await connect(env, 'Observer');
    const id = b.got[0].i;
    a.send({ p: [0, 0, 0], r: 0, h: 'nerf' });
    b.send({ p: [0, 0, 2], r: 0, h: 'nerf', l: 999 }); await settle(env);
    assert.equal(observer.states().at(-1).l, 3, 'client cannot invent lives');
    const fire = async () => { now += 1000; a.send({ t: 'f', w: 'nerf', to: id }); await settle(env); };
    await fire();
    assert.equal(observer.states().at(-1).l, 2, 'unarmed observer gets immediate stationary-target damage');
    assert.equal(a.states().at(-1).l, 2, 'attacker also gets public state');
    const late = await connect(env, 'Late');
    assert.equal(late.got[0].ps.find(p => p.i === id).l, 2, 'welcome uses damaged authoritative lives');
    env.PLAYERS.hibernate('world'); now += 1000;
    b.send({ p: [0, 0, 2], r: 0, h: 'nerf', l: 999 }); await settle(env);
    assert.equal(observer.states().at(-1).l, 2, 'hibernation and new client state preserve damage');
    await fire(); await fire();
    assert.equal(b.got.filter(m => m.t === 'hurt').at(-1).dead, true);
    assert.equal(observer.states().at(-1).l, 3, 'death publishes actual immediate server reset, not zero');
    // A future server recovery uses this same publication path, not a new client life model.
    const room = env.PLAYERS.object('world'), socket = room.open().find(ws => ws.deserializeAttachment().i === id);
    const attachment = socket.deserializeAttachment(); attachment.l = 2; socket.serializeAttachment(attachment);
    room.publishState(socket, attachment); await settle(env);
    assert.equal(observer.states().at(-1).l, 2);
    b.ws.close(1000); await settle(env);
    assert.equal(observer.got.at(-1).t, 'x');
    const rejoined = await connect(env, 'B');
    assert.equal(observer.got.at(-1).l, 3, 'new connection starts with server rule count');
    for (const c of [a, observer, late, rejoined]) c.ws.close(1000); await settle(env);
  } finally { COMBAT.lives = previous; }
});


test('shared life: own welcome, unarmed half/fatal falls and weapon-state/forgery invariants', async () => {
  const env = setup(), a = await connect(env, 'A'), b = await connect(env, 'B');
  assert.equal(a.got[0].l, COMBAT.lives);
  const state = h => ({p:[0,0,0],r:0,h,l:999});
  a.send(state('')); await settle(env);
  a.send({t:'fall',id:1,drop:4,gap:2,l:999}); await settle(env);
  assert.deepEqual(a.got.find(m=>m.t==='fall'),{t:'fall',id:1,l:COMBAT.lives-Math.ceil(COMBAT.lives/2),dead:false});
  assert.equal(a.got.filter(m=>m.t==='life').at(-1).l,5);
  assert.equal(b.states().at(-1).l,5);
  for(const h of ['nerf','','saber']) { now += 1000; a.send(state(h)); await settle(env); assert.equal(b.states().at(-1).l,5); }
  now += 1000; a.send({t:'fall',id:2,drop:4,gap:2}); await settle(env);
  assert.deepEqual(a.got.filter(m=>m.t==='fall').at(-1),{t:'fall',id:2,l:0,dead:true});
  assert.ok(a.got.filter(m=>m.t==='fall'||m.t==='life').every(m=>!('kill' in m)), 'fall and passive health never carry combat kill receipts');
  assert.equal(b.states().at(-1).l,COMBAT.lives);
  now += 1000; a.send({t:'fall',id:3,drop:8,gap:2}); await settle(env);
  assert.equal(a.got.filter(m=>m.t==='fall').at(-1).dead,true);
  assert.equal(a.got.filter(m=>m.t==='hurt'||m.t==='hit').length,0,'falls award no PvP hurt/hit effects');
  for(const [drop,gap] of [[2.5,2],[20,.5]]) { now += 1000; a.send({t:'fall',id:4,drop,gap}); await settle(env); assert.equal(a.got.filter(m=>m.t==='life').at(-1).l,COMBAT.lives); }
  const count=a.got.filter(m=>m.t==='fall').length;
  for(const bad of [{drop:null,gap:2},{drop:101,gap:2},{drop:4,gap:-1}]) {now+=1000;a.send({t:'fall',id:5,...bad});await settle(env);}
  assert.equal(a.got.filter(m=>m.t==='fall').length,count);
  const {fallDamage}=await import('../src/falldamage.js');
  assert.equal(fallDamage(4,2,11),6,'ceil(max/2) kills odd full health in two damaging falls');
  assert.equal(Math.max(0,11-2*fallDamage(4,2,11)),0);
});

test('consumption: portion restores +1 up to max, dedup/idempotence, clock cleanup, full health clamp and hibernation', async () => {
  const prevNow = now;
  try {
    const env = setup(), a = await connect(env, 'Consumer'), b = await connect(env, 'Observer');
    assert.equal(a.got[0].c.portionLife, 1, 'welcome rules declare portionLife');
    const state = h => ({ p: [0, 0, 0], r: 0, h });
    a.send(state('')); await settle(env);

    // Take damage from a fall: drop 4, gap 2 gives 5 damage (from 10 to 5)
    a.send({ t: 'fall', id: 1, drop: 4, gap: 2 }); await settle(env);
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 5);
    assert.equal(b.states().at(-1).l, 5);

    const attA = () => a.ws.peer.deserializeAttachment();
    const initialHealAt = attA().healAt;
    assert.ok(Number.isFinite(initialHealAt), 'damage starts recovery clock');

    // Eat bread portion 1: restores +1 to 6
    now += 1000;
    a.send({ t: 'consume', id: 10, portion: 'breadSlice#1', l: 999 }); await settle(env);
    assert.deepEqual(a.got.find(m => m.t === 'consume' && m.id === 10), { t: 'consume', id: 10, portion: 'breadSlice#1', l: 6, ok: true });
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 6);
    assert.equal(b.states().at(-1).l, 6);
    assert.equal(attA().healAt, initialHealAt, 'non-full portion healing does not move minute deadline');
    assert.deepEqual(attA().consumed, ['breadSlice#1']);

    // Duplicate consumption of the same portion ID: idempotent receipt, no extra heal
    now += 1000;
    a.send({ t: 'consume', id: 11, portion: 'breadSlice#1' }); await settle(env);
    assert.deepEqual(a.got.find(m => m.t === 'consume' && m.id === 11), { t: 'consume', id: 11, portion: 'breadSlice#1', l: 6, ok: true });
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 6, 'duplicate portion cannot heal again');

    // Hibernation preserves consumed portions and health
    env.PLAYERS.hibernate('world');
    now += 1000;
    a.send({ t: 'consume', id: 12, portion: 'friedEgg#1' }); await settle(env);
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 7);
    assert.deepEqual(attA().consumed, ['breadSlice#1', 'friedEgg#1']);

    // Heal up to 9
    now += 1000; a.send({ t: 'consume', id: 13, portion: 'breadSlice#2' }); await settle(env);
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 8);
    now += 1000; a.send({ t: 'consume', id: 14, portion: 'breadSlice#3' }); await settle(env);
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 9);
    assert.ok(Number.isFinite(attA().healAt), 'recovery clock still active at 9 HP');

    // Eat final portion to reach max 10: cleans recovery clock
    now += 1000; a.send({ t: 'consume', id: 15, portion: 'breadSlice#4' }); await settle(env);
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 10);
    assert.equal(attA().healAt, undefined, 'healing to full cleans recovery clock');

    // Consuming at full health: clamped to 10, no extra heal, but recorded
    now += 1000; a.send({ t: 'consume', id: 16, portion: 'breadSlice#5' }); await settle(env);
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 10);
    assert.deepEqual(a.got.find(m => m.t === 'consume' && m.id === 16), { t: 'consume', id: 16, portion: 'breadSlice#5', l: 10, ok: true });
    assert.ok(attA().consumed.includes('breadSlice#5'));

    // Now player takes damage again: breadSlice#5 cannot be reused
    now += 1000; a.send({ t: 'fall', id: 2, drop: 4, gap: 2 }); await settle(env);
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 5);
    now += 1000; a.send({ t: 'consume', id: 17, portion: 'breadSlice#5' }); await settle(env);
    assert.equal(a.got.filter(m => m.t === 'life').at(-1).l, 5, 'portion consumed at full health cannot be reused after new damage');

    // Bad portion inputs are ignored
    const consumeCount = a.got.filter(m => m.t === 'consume').length;
    for (const bad of [{ portion: '' }, { portion: null }, { portion: 123 }, { id: 0, portion: 'x' }, { id: -1, portion: 'x' }]) {
      now += 1000; a.send({ t: 'consume', ...bad }); await settle(env);
    }
    assert.equal(a.got.filter(m => m.t === 'consume').length, consumeCount, 'bad consume requests produce no response');
    for (const peer of [a, b]) peer.ws.close(); await settle(env);
  } finally { now = prevNow; }
});

test('crouch pose uses literal actual true in states/late welcome and survives hibernation without changing health', async () => {
  const env = setup(), a = await connect(env, 'Crouch'), b = await connect(env, 'Observer');
  const state = { p:[0,0,0], r:0, h:'nerf', score:123 };
  a.send({ ...state, c:true }); await settle(env);
  assert.equal(b.states().at(-1).c, true); assert.equal(b.states().at(-1).l, COMBAT.lives);
  const late = await connect(env, 'Late');
  assert.equal(late.got[0].ps.find(p => p.i === a.got[0].i).c, true);
  env.PLAYERS.hibernate('world');
  now += 200; a.send({ ...state, c:true }); await settle(env);
  assert.equal(b.states().at(-1).c, true);
  for (const c of [false, undefined, 1, -1, Infinity, 'true', {}, null]) {
    now += 200; a.send({ ...state, c, l:999 }); await settle(env);
    const got = b.states().at(-1);
    assert.equal(got.c, undefined, 'invalid/false/legacy pose is standing');
    assert.equal(got.l, COMBAT.lives); assert.equal(got.h, 'nerf'); assert.equal(got.score, 123);
    assert.deepEqual(got.p, state.p);
  }
});

test('distance reward shared rule: near, first bonus, middle, cap, invalid and monotonic geometry', () => {
  assert.equal(COMBAT.points, SCORE.each.pvpHits);
  for (const d of [0, 2, PVP_SCORE.nearMetres, PVP_SCORE.nearMetres + PVP_SCORE.metresPerPoint - .001]) assert.equal(pvpHitPoints(d), COMBAT.points);
  assert.equal(pvpHitPoints(7), 6); assert.equal(pvpHitPoints(15), 10);
  assert.equal(pvpHitPoints(35), 20); assert.equal(pvpHitPoints(60), 20);
  for (const d of [-1, NaN, Infinity, '15', null]) assert.equal(pvpHitPoints(d), 0);
  let previous = 0;
  for (let d = 0; d <= 70; d += .125) { const points = pvpHitPoints(d); assert.ok(points >= previous); previous = points; }
});

test('authoritative distance awards: actual geometry, forged client points, unchanged rejects and exact minute budget', async () => {
  const env = setup(), a = await connect(env, 'A'), b = await connect(env, 'B');
  const ia = a.got[0].i, ib = b.got[0].i, hits = () => a.got.filter(m => m.t === 'hit');
  const state = async (d, h = 'bow') => { now += 1000; a.send({ p: [0, 0, 0], r: 0, h: 'bow' }); b.send({ p: [d, 0, 0], r: 0, h }); await settle(env); };
  const fire = async (extra = {}) => { now += 1000; a.send({ t: 'a', w: 'bow', o: [0, 1, 0], d: [1, 0, 0], to: ib, points: 9999, distance: 9999, award: { i: ia, seq: 999 }, ...extra }); await settle(env); };
  await state(2); await fire();
  assert.deepEqual(hits().at(-1).award, { i: ia, seq: 1, distance: 2, points: 5 });
  await state(15); await fire(); assert.equal(hits().at(-1).award.points, 10);
  await state(35); await fire(); assert.equal(hits().at(-1).award.points, 20);
  await state(62.5); await fire(); assert.equal(hits().at(-1).award.points, 20, 'existing range + slack boundary accepted');
  await state(2); await fire(); assert.equal(hits().at(-1).award.seq, 5);
  const room = env.PLAYERS.object('world'), shooter = room.open().find(ws => ws.deserializeAttachment().i === ia);
  assert.equal(shooter.deserializeAttachment().pp, 60, 'actual rewards, not base count, consume the unchanged cap');
  await fire(); assert.equal(hits().length, 5, 'next hit over exactly 60 is refused');
  now += 60_000; a.send('p'); b.send('p'); await settle(env); await state(2); await fire();
  assert.equal(hits().at(-1).award.seq, 6, 'new minute permits next monotonic accepted award');
  a.send({ t: 'f', w: 'bow', to: ib }); await settle(env);
  assert.equal(hits().length, 6, 'unchanged hit-rate rejection');
  await state(62.51); await fire(); assert.equal(hits().length, 6, 'outside range + slack rejected');
  await state(2, ''); await fire(); assert.equal(hits().length, 6, 'unarmed target rejected');
  await state(2); await fire({ w: 'nerf' }); assert.equal(hits().length, 6, 'wrong held weapon rejected');
  await fire({ to: undefined }); assert.equal(hits().length, 6, 'miss has no award or damage');
  env.PLAYERS.hibernate('world'); await fire();
  assert.equal(hits().at(-1).award.seq, 7, 'sequence survives hibernation with attachment');
  for (const c of [a,b]) c.ws.close(1000); await settle(env);

});

test('standing rifle contact: seeded front surface, bounded wire, body fallback, shared low-health death and receipt', async () => {
  const { avatarLook, rifleSkullEntry, PVP_RIFLE_HEAD } = await import('../src/config.js');
  const { cleanShot } = await import('./players.js');
  const env=setup(),a=await connect(env,'Shooter'); let b,target;
  for(let tries=0;tries<40;tries++) { b=await connect(env,'Target');target=b.got.find(m=>m.t==='w').i;if(avatarLook(target).style===0)break;b.ws.close();await settle(env); }
  assert.equal(avatarLook(target).style,0);

  a.send({p:[0,0,-4],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const state={p:[0,0,0],r:0}, y=(1.53+.153)*avatarLook(target).tall;
  const o=[0,1.62,-4],length=Math.hypot(y-1.62,3.894),d=[0,Math.round((y-1.62)/length*1000)/1000,Math.round(3.894/length*1000)/1000];
  const unit=d.map(v=>v/Math.hypot(...d)),entry=rifleSkullEntry(target,state,o,d);
  assert.ok(entry>3.8&&entry<4.1);
  const shot={t:'a',w:'rifle',to:target,o,d,hc:[1,...o.map((v,i)=>Math.round((v+unit[i]*entry)*1000)/1000)]};
  assert.ok(Buffer.byteLength(JSON.stringify(shot))<=PLAYERS.maxBytes);
  const shoot=async m=>{now+=1000;a.send(m);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  let hit=await shoot({...shot,head:true,damage:999});assert.equal(hit.l,8);assert.equal(hit.head,true);assert.equal(hit.dead,false);assert.equal(hit.award.points,5);
  const hurt=b.got.filter(m=>m.t==='hurt').at(-1);assert.equal(hurt.l,8);assert.equal(hurt.head,true);
  for(const forged of [undefined,[9,...shot.hc.slice(1)],[1,0,o[1],0],[1,0,o[1],.1],[1,1,o[1],shot.hc[3]],[1,5003,0,0]]) {
    hit=await shoot({...shot,hc:forged,head:true,damage:999});assert.equal(hit.head,undefined);
  }
  assert.equal(hit.l,2,'six invalid proofs take one life each, never trusted client damage');
  hit=await shoot(shot);assert.equal(hit.l,0);assert.equal(hit.dead,true);assert.match(hit.kill,/^[0-9a-f-]{36}$/);
  assert.equal(b.states().length>0,true); // existing public state remains available to observers
  const welcome=await connect(env,'Observer');assert.equal(welcome.got.find(m=>m.t==='w').ps.find(p=>p.i===target).l,10);
  const rejectCount=a.got.filter(m=>m.t==='hit').length;
  a.send(shot);await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,rejectCount,'same timestamp cannot damage/die twice');
  // Actual pose change gates head validation, including after the room hibernates.
  b.send({p:[0,0,0],r:0,h:'rifle',c:true});await settle(env);hit=await shoot(shot);assert.equal(hit.l,9);assert.equal(hit.head,undefined);
  b.send({p:[.01,0,0],r:0,h:'rifle'});await settle(env);now+=300;
  a.send(shot);await settle(env);hit=a.got.filter(m=>m.t==='hit').at(-1);assert.equal(hit.head,undefined,'recent target movement stays body-only');
  env.PLAYERS.hibernate('world');now+=1000;
  hit=await shoot({...shot,o:[4000,o[1],0]});assert.equal(hit.head,undefined,'origin far from actual shooter cannot qualify as head');
  a.send({p:[4999,4998,4995],r:0,h:'rifle'});b.send({p:[4999,4998,4999],r:0,h:'rifle'});await settle(env);now+=1000;
  const highState={p:[4999,4998,4999],r:0},highO=[4999,4999.62,4995],highEntry=rifleSkullEntry(target,highState,highO,d);
  const high={t:'a',w:'rifle',to:target,o:highO,d,hc:[1,...highO.map((v,i)=>Math.round((v+unit[i]*highEntry)*1000)/1000)]};
  assert.ok(Buffer.byteLength(JSON.stringify(high))<=PLAYERS.maxBytes);
  hit=await shoot(high);assert.equal(hit.head,true);assert.equal(hit.l,5,'real room accepts bounded rounded high-world central geometry exactly once');

  assert.equal(cleanShot(JSON.stringify({...shot,hc:[1,5002,-5002,5002]})).hc[1],5002);
  assert.equal(cleanShot(JSON.stringify({...shot,hc:[1,5002.01,0,0]})).hc,undefined);
  assert.equal(PVP_RIFLE_HEAD.bodyDamage,1);assert.equal(PVP_RIFLE_HEAD.headDamage,2);
});

test('restricted rifle profile: forged model cannot widen core, other weapons, ray/version/256-byte bounds', async()=>{
  const {avatarLook,rifleSkullEntry,rifleHeadContact,PVP_RIFLE_HEAD:H}=await import('../src/config.js');
  const {cleanShot}=await import('./players.js');
  const env=setup(),a=await connect(env,'Shooter');let b,id;
  for(let tries=0;tries<40;tries++){b=await connect(env,'Other hair');id=b.got[0].i;if(avatarLook(id).style!==0)break;b.ws.close();await settle(env);}
  assert.notEqual(avatarLook(id).style,0);
  a.send({p:[0,0,-4],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const supported=Array.from({length:50},(_,i)=>'central-'+i).find(s=>avatarLook(s).style===0);
  const state={p:[0,0,0],r:0},o=[0,+(1.85*avatarLook(id).tall).toFixed(2),-4],d=[0,0,1];
  const entry=rifleSkullEntry(id,state,o,d),hc=[1,0,o[1],+(-4+entry).toFixed(2)];
  a.send({t:'a',w:'rifle',o,d,to:id,hc,head:true,damage:999,model:supported});await settle(env);
  const hit=a.got.filter(m=>m.t==='hit').at(-1);assert.equal(hit.l,9);assert.equal(hit.head,undefined,'client model cannot widen actual server-assigned style core');
  a.send({p:[0,0,-4],r:0,h:'wand'});await settle(env);now+=1000;
  a.send({t:'a',w:'wand',o,d,to:id,hc,head:true});await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').at(-1).l,8);assert.equal(a.got.filter(m=>m.t==='hit').at(-1).head,undefined);
  const size=JSON.stringify({t:'a',w:'rifle',o:[-5000,5000,-5000],d:[-.999,.032,.004],to:'1234567890123456',hc:[1,-5002,5002,-5002]});
  assert.ok(Buffer.byteLength(size)<=PLAYERS.maxBytes);assert.deepEqual(cleanShot(size).hc,[1,-5002,5002,-5002]);
  const y=+(1.683*avatarLook(supported).tall).toFixed(3),so=[0,1.62,-4],length=Math.hypot(y-1.62,3.894),direction=[0,+( (y-1.62)/length ).toFixed(3),+(3.894/length).toFixed(3)],unit=direction.map(v=>v/Math.hypot(...direction));
  const front=rifleSkullEntry(supported,state,so,direction),valid={t:'a',w:'rifle',o:so,d:direction,hc:[1,...so.map((v,i)=>+(v+unit[i]*front).toFixed(3))]};
  assert.equal(rifleHeadContact(supported,state,valid,[0,0,-4],COMBAT.weapons.rifle.range,COMBAT.from),true);
  for(const forged of [{...valid,d:[1,0,0]},{...valid,o:[0,y,-49]},{...valid,hc:[2,...valid.hc.slice(1)]},{...valid,hc:[1,0,y,0]},{...valid,hc:[1,0,y,.11]},{...valid,hc:[1,1,y,valid.hc[3]]},{...valid,w:'wand'}])assert.equal(rifleHeadContact(supported,state,forged,[0,0,-4],COMBAT.weapons.rifle.range,COMBAT.from),false);
  assert.equal(cleanShot(JSON.stringify({...valid,o:[0,5000.01,0]})),null);
  assert.equal(cleanShot(JSON.stringify({...valid,hc:[1,0,5002.01,0]})).hc,undefined);
  const snap=cleanShot(JSON.stringify({...valid,o:[0,y+.001,-4],d:[.0001,0,.9999],hc:[1,.0001,y+.0001,valid.hc[3]+.0001]}));
  assert.equal(snap.o[1],Math.round((y+.001)*100)/100);assert.deepEqual(snap.d,[0,0,1]);assert.deepEqual(snap.hc,[1,0,+(y+.0001).toFixed(3),valid.hc[3]]);assert.equal(H.headDamage,2);
});

test('central cores: all actual server seed styles confirm 2 HP, style0 core unchanged and beanie old-core fallback',async()=>{
  const {avatarLook,PVP_RIFLE_HEAD:H,rifleSkullEntry,rifleHeadCoreRegion}=await import('../src/config.js');
  assert.deepEqual(H.patch,{across:.008,low:.148,high:.158});
  const env=setup(),a=await connect(env,'Shooter');a.send({p:[0,0,-4],r:0,h:'rifle'});await settle(env);
  for(const style of [0,1,2,3]){
    let b,id;
    for(let tries=0;tries<40;tries++){b=await connect(env,'Target');id=b.got[0].i;if(avatarLook(id).style===style)break;b.ws.close();await settle(env);}
    assert.equal(avatarLook(id).style,style);b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
    const look=avatarLook(id),patch=H.corePatches[style]??H.patch,state={p:[0,0,0],r:0},y=(H.headY+(patch.low+patch.high)/2)*look.tall,o=[0,1.62,-4],length=Math.hypot(y-1.62,3.89),raw=[0,+( (y-1.62)/length ).toFixed(3),+(3.89/length).toFixed(3)],unit=raw.map(v=>v/Math.hypot(...raw)),t=rifleSkullEntry(id,state,o,raw),point=o.map((v,i)=>+(v+unit[i]*t).toFixed(3));
    assert.equal(rifleHeadCoreRegion(id,state,point,o,raw),true);assert.equal(rifleHeadCoreRegion(id,state,point),style!==3,"missing actual ray keeps beanie body-only and old styles unchanged");const count=a.got.filter(m=>m.t==='hit').length;
    a.send({t:'a',w:'rifle',o,d:raw,to:id,hc:[1,...point],style:0,damage:999});await settle(env);
    const hits=a.got.filter(m=>m.t==='hit');assert.equal(hits.length,count+1);assert.equal(hits.at(-1).head,true);assert.equal(hits.at(-1).l,8);assert.equal(hits.at(-1).award.points,5);assert.equal(b.got.filter(m=>m.t==='hurt').at(-1).head,true);
    if(style===3){now+=1000;const oldY=H.headY+.153,oldPoint=[0,+(oldY*look.tall).toFixed(3),-.1];assert.equal(rifleHeadCoreRegion(id,state,oldPoint),false);a.send({t:'a',w:'rifle',o,d:raw,to:id,hc:[1,...oldPoint],style:0});await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').at(-1).l,7);assert.equal(a.got.filter(m=>m.t==='hit').at(-1).head,undefined);
      // An actual nearest face/brim can cover the low core on steep rays: forged hidden skull must remain body damage.
      const steepO=[0,+(y+2).toFixed(2),-1],steepD=[0,-.894,.447],steepT=rifleSkullEntry(id,state,steepO,steepD),steepUnit=steepD.map(v=>v/Math.hypot(...steepD)),steepPoint=steepO.map((v,i)=>+(v+steepUnit[i]*steepT).toFixed(3));
      assert.equal(rifleHeadCoreRegion(id,state,steepPoint,steepO,steepD),false);now+=1000;a.send({p:[0,0,-1],r:0,h:'rifle'});await settle(env);
      a.send({t:'a',w:'rifle',o:steepO,d:steepD,to:id,hc:[1,...steepPoint]});await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').at(-1).l,6);assert.equal(a.got.filter(m=>m.t==='hit').at(-1).head,undefined);
    }
    b.ws.close();await settle(env);
  }
});

test('lower-front jaw: actual room validates damage/legacy/forgery/replay/one lethal receipt and bounded high coordinates',async()=>{
  const {avatarLook,PVP_RIFLE_HEAD:H,rifleJawEntry,rifleJawRegion}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'Jaw shooter'),b=await connect(env,'Jaw target'),id=b.got[0].i,state={p:[0,0,0],r:0};
  a.send({p:[0,0,-4],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const look=avatarLook(id),y=(H.headY+.04)*look.tall,o=[0,1.62,-4],n=Math.hypot(y-o[1],3.89),d=[0,+((y-o[1])/n).toFixed(3),+(3.89/n).toFixed(3)],unit=d.map(v=>v/Math.hypot(...d)),t=rifleJawEntry(id,state,o,d),point=o.map((v,i)=>+(v+unit[i]*t).toFixed(3)),shot={t:'a',w:'rifle',to:id,o,d,hc:[1,...point]};
  assert.equal(rifleJawRegion(id,state,point,o,d),true);assert.equal(rifleJawRegion(id,state,point),false,'missing actual ray keeps jaw unsupported');
  const shoot=async m=>{now+=1000;a.send(m);await settle(env);return a.got.filter(x=>x.t==='hit').at(-1);};
  let hit=await shoot({...shot,damage:999,head:true,model:'invented'});assert.equal(hit.l,8);assert.equal(hit.head,true);assert.equal(hit.award.points,5);assert.equal(b.got.filter(x=>x.t==='hurt').at(-1).head,true);
  hit=await shoot({...shot,hc:undefined,head:true});assert.equal(hit.l,7);assert.equal(hit.head,undefined,'old contact-less client body path retained');
  hit=await shoot({...shot,hc:[9,...point],damage:999});assert.equal(hit.l,6);assert.equal(hit.head,undefined,'unknown contact version does not widen jaw');
  const count=a.got.filter(x=>x.t==='hit').length;a.send(shot);await settle(env);assert.equal(a.got.filter(x=>x.t==='hit').length,count,'same-slot replay has no damage or award');
  for(let i=0;i<5;i++)hit=await shoot({...shot,hc:undefined});assert.equal(hit.l,1);
  hit=await shoot(shot);assert.equal(hit.l,-1);assert.equal(hit.dead,true);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(b.got.filter(x=>x.t==='hurt'&&x.dead).length,1);assert.equal(a.states().filter(x=>x.i===id).at(-1).l,10,'actual published reset follows the single lethal receipt');
  const observer=await connect(env,'Public jaw');assert.equal(observer.got[0].ps.find(p=>p.i===id).l,10,'same authoritative shared health reset');
  a.send({p:[4999,4998,4995],r:0,h:'rifle'});b.send({p:[4999,4998,4999],r:0,h:'rifle'});await settle(env);now+=1000;
  const highState={p:[4999,4998,4999],r:0},highO=[4999,4999.62,4995],highT=rifleJawEntry(id,highState,highO,d),high={...shot,o:highO,hc:[1,...highO.map((v,i)=>+(v+unit[i]*highT).toFixed(3))]};
  assert.ok(Buffer.byteLength(JSON.stringify(high))<=PLAYERS.maxBytes);hit=await shoot(high);assert.equal(hit.l,8);assert.equal(hit.head,true,'actual bounded r2/r3 large-world contact');
  hit=await shoot({...high,o:[4000,highO[1],highO[2]],damage:999});assert.equal(hit.l,7);assert.equal(hit.head,undefined,'forged origin never validates jaw');
  assert.deepEqual(H.jaw,{radius:.088,width:8,height:6,scale:[1,.8,1],centre:[0,.052,.03]});
});

test('lateral skull: both-side approach, whole-cell boundaries and missing ray fail closed for canonical variants', async()=>{
  const {avatarLook,rifleSkullEntry,rifleHeadLateralRegion,rifleHeadContact,PVP_RIFLE_HEAD:H}=await import('../src/config.js');
  const variants=new Set(),state={p:[0,0,0],r:0};
  for(let n=0;n<3000&&variants.size<60;n++){
    const id='lateral-'+n,look=avatarLook(id),key=[look.style,look.build,look.tall].join('/');if(variants.has(key))continue;variants.add(key);
    const width=[.93,1,1.08][look.build];
    for(const side of [-1,1]){
      const o=[-side*3,+((H.headY+.095)*look.tall).toFixed(2),+(-.065*width).toFixed(2)],d=[side,0,0];
      const entry=rifleSkullEntry(id,state,o,d);assert.ok(entry>0);
      const point=o.map((v,k)=>+(v+d[k]*entry).toFixed(3)),shot={t:'a',w:'rifle',o,d,hc:[1,...point]};
      assert.equal(rifleHeadLateralRegion(id,state,point,o,d),true);
      assert.equal(rifleHeadContact(id,state,shot,o,40,4),true);
      assert.equal(rifleHeadLateralRegion(id,state,point),false);
      for(const direction of [[0,0,0],[-side,0,0],[0,0,1],[side,.2,0],[side,0,.3]])assert.equal(rifleHeadLateralRegion(id,state,point,o,direction),false);
      assert.equal(rifleHeadLateralRegion(id,state,point,point,d),false,'inside-surface origin cannot establish side approach');
      const edge=[-side*H.lateralPatch.across[0]*width,point[1],point[2]];
      assert.equal(rifleHeadLateralRegion(id,state,edge,o,d),false,'boundary rounding cell is not wholly supported');
    }
  }
  assert.equal(variants.size,60);
});

test('lateral skull room: canonical actual socket, alternating sides, shared lethal receipt and old-client fallback',async()=>{
  const {avatarLook,rifleSkullEntry,PVP_RIFLE_HEAD:H}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'Side shooter'),b=await connect(env,'Side target');
  const id=b.got.find(m=>m.t==='w').i,look=avatarLook(id),width=[.93,1,1.08][look.build],state={p:[0,0,0],r:0};
  b.send({...state,h:'rifle'});await settle(env);
  let last;
  for(let i=0;i<5;i++){
    const side=i%2?-1:1,feet=[-side*3,0,0];a.send({p:feet,r:0,h:'rifle'});await settle(env);now+=1000;
    const o=[feet[0],+((H.headY+.095)*look.tall).toFixed(2),+(-.065*width).toFixed(2)],d=[side,0,0],entry=rifleSkullEntry(id,state,o,d);
    last={t:'a',w:'rifle',o,d,to:id,hc:[1,...o.map((v,k)=>+(v+d[k]*entry).toFixed(3))]};
    a.send(last);await settle(env);const hit=a.got.filter(m=>m.t==='hit').at(-1);
    assert.equal(hit.head,true);assert.equal(hit.l,10-(i+1)*2);assert.equal(hit.dead,i===4);assert.equal(hit.award.seq,i+1);
    assert.equal(b.got.filter(m=>m.t==='hurt').at(-1).l,hit.l);
  }
  const hits=a.got.filter(m=>m.t==='hit'),kill=hits.at(-1).kill;assert.match(kill,/^[0-9a-f-]{36}$/);
  assert.equal(hits.filter(m=>m.dead).length,1);
  a.send(last);await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,5,'same-timestamp replay cannot kill twice');
  now+=1000;a.send({...last,hc:undefined,head:true,damage:99});await settle(env);
  const legacy=a.got.filter(m=>m.t==='hit').at(-1);assert.equal(legacy.l,9);assert.equal(legacy.head,undefined);
  a.ws.close();b.ws.close();await settle(env);
});

test('lateral skull greeting exclusion is attachment-authoritative, persists after time/hibernate, and leaves other profiles independent',async()=>{
  const {avatarLook,rifleSkullEntry,rifleHeadContact,rifleHeadLateralRegion,rifleHeadGreetingLeftRegion,PVP_RIFLE_HEAD:H}=await import('../src/config.js');
  // #1109: the greeter's fixed first-standing pose legitimately reopens the narrow #938 left temple after a greeting.
  // The old ray (front .065*width, rounded) landed inside that patch for build 1 / tall >= 1 ids (~1 in 5 random looks).
  // Aim at a lateral cell in front of the #938 patch, assert that precondition, and always pick that formerly failing look.
  const env=setup(),a=await connect(env,'Shooter'),b=await connectLook(env,'Greeter',l=>l.build===1&&l.tall>=1),id=b.got.find(m=>m.t==='w').i,look=avatarLook(id),width=[.93,1,1.08][look.build];
  assert.ok(look.build===1&&look.tall>=1,'deterministic formerly flaky look');
  const state={p:[0,0,0],r:0};b.send({...state,h:'rifle'});a.send({p:[-3,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const shoot=async side=>{const feet=[-side*3,0,0];a.send({p:feet,r:0,h:'rifle'});await settle(env);now+=1000;const o=[feet[0],+((H.headY+.095)*look.tall).toFixed(2),+(-.05*width).toFixed(2)],d=[side,0,0],entry=rifleSkullEntry(id,state,o,d),shot={t:'a',w:'rifle',to:id,o,d,hc:[1,...o.map((v,k)=>+(v+d[k]*entry).toFixed(3))],gt:undefined,head:true};
    assert.ok(rifleHeadLateralRegion(id,state,shot.hc.slice(1),o,d)&&!rifleHeadGreetingLeftRegion(id,state,shot.hc.slice(1),o,d),'ray stays in the lateral patch, outside the #938 greeting-left temple');
    a.send(shot);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  assert.equal((await shoot(1)).head,true);
  b.send({t:'g',to:a.got.find(m=>m.t==='w').i,k:0});await settle(env);assert.equal(a.got.filter(m=>m.t==='g').length,1);
  for(const side of [-1,1]){const hit=await shoot(side);assert.equal(hit.head,undefined);}
  now+=3000;env.PLAYERS.hibernate('world');assert.equal((await shoot(1)).head,undefined,'elapsed wave time and hibernation never reopen the unknown animation');
  const observer=await connect(env,'Late observer');assert.equal(observer.got.find(m=>m.t==='w').ps.find(p=>p.i===id).l,5);
  b.send({t:'g',to:a.got.find(m=>m.t==='w').i,k:0});await settle(env);assert.equal((await shoot(-1)).head,undefined,'repeat greeting stays body-only');
  // Only lateral is disabled: the separate actual nasal front entry remains valid with allowLateral=false.
  const {rifleNoseEntry}=await import('../src/config.js'),o=[0,+((H.headY+.092)*look.tall).toFixed(2),-3],d=[0,0,1],entry=rifleNoseEntry(id,state,o,d);
  assert.equal(rifleHeadContact(id,state,{t:'a',w:'rifle',o,d,hc:[1,...o.map((v,k)=>+(v+d[k]*entry).toFixed(3))]},o,40,4,false),true);
  for(const peer of [a,b,observer])peer.ws.close();await settle(env);
});

test('extra frontal nose cell: authoritative damage, legacy fallback, one fatal award and retained recovery contract', async()=>{
  const {avatarLook,rifleNoseEntry,rifleNoseRegion,rifleNoseExtraRegion,PVP_RIFLE_HEAD:H}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'Extra nose shooter'),b=await connect(env,'Target'),id=b.got[0].i;
  a.send({p:[0,0,-4],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const state={p:[0,0,0],r:0},look=avatarLook(id);let shot;
  // Select a supported serialized ray on the ACTUAL assigned seed's unchanged shared physical profile.
  // Browser skin/nearest-face/cell proof is independent; this room test covers authoritative semantics.
  for(const ox of [0,-.01,.01])for(const dx of [-.004,-.006,-.008,-.010])for(const dy of [.087,.09,.093,.096]){
    const o=[ox,1.62,-4],raw=[dx*[.93,1,1.08][look.build]-ox,(H.headY+dy)*look.tall-o[1],3.866],length=Math.hypot(...raw),d=raw.map(v=>+(v/length).toFixed(3)),unit=d.map(v=>v/Math.hypot(...d)),entry=rifleNoseEntry(id,state,o,d);
    if(entry===null)continue;const hc=[1,...o.map((v,i)=>+(v+unit[i]*entry).toFixed(3))];
    if(!shot&&!rifleNoseRegion(id,state,hc.slice(1))&&rifleNoseExtraRegion(id,state,hc.slice(1)))shot={t:'a',w:'rifle',o,d,hc,to:id};
  }
  assert.ok(shot,'bounded native-profile ray exists for the assigned appearance');const{hc}=shot;
  assert.equal(rifleNoseRegion(id,state,hc.slice(1)),false,'this is genuinely outside the old frontal core');
  assert.equal(rifleNoseExtraRegion(id,state,hc.slice(1)),true);assert.ok(Buffer.byteLength(JSON.stringify(shot))<=PLAYERS.maxBytes);
  const shoot=async m=>{now+=1000;a.send(m);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  let hit=await shoot(shot);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(hit.award.points,5);assert.equal(hit.dead,false);
  assert.equal(b.got.filter(m=>m.t==='hurt').at(-1).l,8);
  hit=await shoot({...shot,hc:undefined,head:true,damage:999});assert.equal(hit.head,undefined);assert.equal(hit.l,7,'contact-less old client still takes body damage only');
  hit=await shoot({...shot,hc:[9,...hc.slice(1)]});assert.equal(hit.head,undefined);assert.equal(hit.l,6,'unknown version stays body-only');
  b.send({p:[0,0,0],r:0,h:'rifle',c:true});await settle(env);hit=await shoot(shot);assert.equal(hit.head,undefined);assert.equal(hit.l,5);
  b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  env.PLAYERS.hibernate('world');
  const server=env.PLAYERS.object('world'),target=[...server.ctx.getWebSockets()].find(s=>s.deserializeAttachment().i===id),attachment=target.deserializeAttachment();attachment.l=1;target.serializeAttachment(attachment);
  hit=await shoot(shot);assert.equal(hit.head,true);assert.equal(hit.l,-1);assert.equal(hit.dead,true);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(hit.award.seq,5);
  const count=a.got.filter(m=>m.t==='hit').length;a.send(shot);await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,count,'same tick cannot produce another death or award');
  const observer=await connect(env);assert.equal(observer.got[0].ps.find(p=>p.i===id).l,COMBAT.lives);
});

test('rear arm safety: accepted greeting is private, permanent across pause/hibernate/latejoin, and fresh attachment restores eligibility',async()=>{
  const {avatarLook,rifleSkullEntry,rifleHeadContact,rifleJawEntry,rifleNoseEntry,PVP_RIFLE_HEAD:H}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'Rear shooter');let b,id;
  for(let tries=0;tries<80;tries++){b=await connect(env,'Rear target');id=b.got[0].i;if(avatarLook(id).style===2)break;b.ws.close();await settle(env);}assert.equal(avatarLook(id).style,2);
  const state={p:[0,0,0],r:3.14},look=avatarLook(id);
  a.send({p:[0,0,-4],r:0,h:'rifle'});b.send({...state,h:'rifle',gt:0});await settle(env);now+=1000;
  const rearShot=(id)=>{const lk=avatarLook(id);for(const dy of [.021,.022,.023])for(const dz of [3.07,3.5,4,4.5]){const o=[0,1.55,-dz],raw=[0,(H.headY+dy)*lk.tall-o[1],dz-.065],n=Math.hypot(...raw),d=raw.map(v=>+(v/n).toFixed(3)),unit=d.map(v=>v/Math.hypot(...d)),entry=rifleSkullEntry(id,state,o,d),hc=[1,...o.map((v,i)=>+(v+unit[i]*entry).toFixed(3))],shot={t:'a',w:'rifle',to:id,o,d,hc};if(rifleHeadContact(id,state,shot,[0,0,-4],40,4))return shot;}throw Error('no bounded supported rounded rear ray');};
  const shot=rearShot(id);
  assert.equal(rifleHeadContact(id,state,shot,[0,0,-4],40,4,true,true,true),true);
  assert.equal(rifleHeadContact(id,state,shot,[0,0,-4],40,4,true,true,false),false,'separate rear permission fails closed');
  const shoot=async()=>{now+=1000;a.send(shot);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  const attach=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(s=>s.deserializeAttachment().i===id).deserializeAttachment();
  b.send({t:'g',to:id,k:0});b.send({t:'g',to:'absent',k:0});b.send({t:'g',to:a.got[0].i,k:-1});await settle(env);
  assert.equal(attach().gt,undefined,'self, absent target and invalid kind never set authoritative greeting');
  assert.equal((await shoot()).head,true,'pre-greet actual rear profile still gives two HP');
  b.send({t:'g',to:a.got[0].i,k:0});await settle(env);const gt=attach().gt;assert.equal(gt,now);
  assert.equal((await shoot()).head,true,'immutable first-standing pose keeps verified rear2 after accepted greeting');
  b.send({...state,r:3.17,h:'rifle'});await settle(env);b.send({...state,h:'rifle'});await settle(env);assert.equal(attach().headPoseFixed,false,'accepted heading change and return permanently break immutable history');
  assert.equal((await shoot()).head,undefined,'returned corridor escape keeps rear body1');
  b.send({t:'g',to:a.got[0].i,k:0});await settle(env);assert.equal(attach().gt,gt,'rate-rejected repeat cannot alter private history');
  now+=10000;env.PLAYERS.hibernate('world');assert.equal((await shoot()).head,undefined,'elapsed wall time and hibernation cannot prove rendered wave completion');
  const observer=await connect(env,'Late observer'),publicTarget=observer.got[0].ps.find(p=>p.i===id);assert.equal(publicTarget.gt,undefined);assert.equal(publicTarget.l,4);
  b.send({...state,h:'rifle',gt:null});await settle(env);assert.equal(attach().gt,gt,'cleaned state cannot erase accepted greeting');
  assert.equal((await shoot()).head,undefined,'latejoin and attempted reset cannot reopen the rear profile');
  // Independent front anatomical profiles are not blanket-disabled by the rear permission.
  const frontState={p:[0,0,0],r:0};
  for(const [y,entryFn] of [[.04,rifleJawEntry],[.092,rifleNoseEntry],[.153,rifleSkullEntry]]){
    const fy=(H.headY+y)*look.tall,fo=[0,1.62,-4],raw=[0,fy-fo[1],3.89],n=Math.hypot(...raw),fd=raw.map(v=>+(v/n).toFixed(3)),unit=fd.map(v=>v/Math.hypot(...fd)),t=entryFn(id,frontState,fo,fd),hc=[1,...fo.map((v,i)=>+(v+unit[i]*t).toFixed(3))];
    assert.equal(rifleHeadContact(id,frontState,{t:'a',w:'rifle',o:fo,d:fd,hc},[0,0,-4],40,4,false,false,false),true,'core/nose/jaw remain independent of private optional permissions');
  }
  b.ws.close();await settle(env);let fresh;
  for(let tries=0;tries<80;tries++){fresh=await connect(env,'Fresh target');if(avatarLook(fresh.got[0].i).style===2)break;fresh.ws.close();await settle(env);}id=fresh.got[0].i;assert.equal(avatarLook(id).style,2);fresh.send({...state,h:'rifle'});await settle(env);now+=1000;
  Object.assign(shot,rearShot(id));
  assert.equal((await shoot()).head,true,'new actual socket has fresh authoritative greeting history');
  // A greeting rejected by the packet-rate gate cannot disable an otherwise fresh branch.
  const limited=await connect(env,'Rate target'),limitedId=limited.got[0].i;now+=1000;
  for(let n=0;n<PLAYERS.perSecond;n++)limited.send({p:[0,0,0],r:0,h:'rifle'});limited.send({t:'g',to:a.got[0].i,k:0});await settle(env);
  const limitedAttachment=[...env.PLAYERS.object('world').ctx.getWebSockets()].find(s=>s.deserializeAttachment().i===limitedId).deserializeAttachment();assert.equal(limitedAttachment.gt,undefined,'rate-rejected first greeting never sets the private gate');
  for(const peer of [a,fresh,observer,limited])peer.ws.close();await settle(env);
});

test('#938 immutable standing history: first real state, normalized changes, legacy and private hibernation', async()=>{
  const env=setup(), peers=[];
  const join=async()=>{const c=await connect(env);peers.push(c);return c;};
  const attachment=c=>c.ws.peer.deserializeAttachment();
  const state={p:[1.234,0,3.456],r:.834,h:'rifle'};
  const send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
  try {
    const target=await join(),viewer=await join();
    assert.equal(attachment(target).s,null);assert.equal(attachment(target).headPoseFixed,undefined);
    assert.equal(viewer.got[0].ps[0].p,undefined,'no default pose can enter a welcome before first state');
    await send(target,state);assert.equal(attachment(target).headPoseFixed,true);
    assert.deepEqual(attachment(target).s.p,[1.23,0,3.46]);assert.equal(attachment(target).s.r,.83);
    await send(target,{...state,p:[1.231,0,3.459],r:.831,h:'saber',score:9,sp:true});
    assert.equal(attachment(target).headPoseFixed,true,'same normalized pose; held item, suit and score do not break history');
    await send(target,{t:'g',to:viewer.got[0].i,k:0});assert.equal(attachment(target).headPoseFixed,true);assert.ok(attachment(target).gt);
    env.PLAYERS.hibernate('world');await send(target,state);
    assert.equal(attachment(target).headPoseFixed,true);assert.ok(attachment(target).gt);
    const late=await join(),snapshot=late.got[0].ps.find(p=>p.i===target.got[0].i);
    assert.equal(snapshot.r,.83);assert.equal(Object.hasOwn(snapshot,'headPoseFixed'),false,'eligibility stays private');
    for(const [name,delta] of [['position',{p:[1.25,0,3.46]}],['heading',{r:.85}],['stance',{c:true}]]){
      const c=await join();await send(c,state);await send(c,{...state,...delta});
      assert.equal(attachment(c).headPoseFixed,false,`${name} change breaks history`);
      await send(c,state);env.PLAYERS.hibernate('world');await send(c,state);
      assert.equal(attachment(c).headPoseFixed,false,`${name} return/hibernate never restore history`);c.ws.close();await settle(env);
    }
    const crouched=await join();await send(crouched,{...state,c:true});await send(crouched,state);
    assert.equal(attachment(crouched).headPoseFixed,false,'first crouched pose never gains standing eligibility');crouched.ws.close();await settle(env);
    const legacy=await join();await send(legacy,state);const old=attachment(legacy);delete old.headPoseFixed;legacy.ws.peer.serializeAttachment(old);
    env.PLAYERS.hibernate('world');await send(legacy,state);
    assert.equal(attachment(legacy).headPoseFixed,undefined,'existing legacy state never initializes missing history retroactively');legacy.ws.close();await settle(env);
    const beforeState=await join();await send(beforeState,{t:'g',to:target.got[0].i,k:0});
    assert.equal(attachment(beforeState).s,null);assert.equal(attachment(beforeState).headPoseFixed,undefined);
    await send(beforeState,state);assert.equal(attachment(beforeState).headPoseFixed,true,'first real standing snapshot after greeting initializes history');beforeState.ws.close();await settle(env);
    await send(target,{...state,r:.85});target.ws.close();await settle(env);
    const fresh=await join();await send(fresh,state);assert.equal(attachment(fresh).headPoseFixed,true);assert.equal(attachment(fresh).gt,undefined);
  } finally { for(const c of peers)c.ws.close();await settle(env); }
});

test('#938 named optional regions preserve legacy front/rear/default/undefined/null guard semantics', async()=>{
  const C=await import('../src/config.js'),id='lateral-1',look=C.avatarLook(id),H=C.PVP_RIFLE_HEAD,width=[.93,1,1.08][look.build],state={p:[0,0,0],r:0};
  // Pure guard fixtures use the shared exact production profile. Actual nearest-surface evidence is in riflelefttest.cjs.
  const ray=(o,d)=>{const unit=d.map(v=>v/Math.hypot(...d)),entry=C.rifleSkullEntry(id,state,o,d);return{t:'a',w:'rifle',o,d,hc:[1,...o.map((v,i)=>+(v+unit[i]*entry).toFixed(3))]};};
  const left=ray([-4,(H.headY+.1)*look.tall,-.07*width],[1,0,0]),feet=[-4,0,-.07*width];
  assert.equal(C.rifleHeadGreetingLeftRegion(id,state,left.hc.slice(1),left.o,left.d),true);
  assert.equal(C.rifleHeadContact(id,state,left,feet,40,4,false),false);
  assert.equal(C.rifleHeadContact(id,state,left,feet,40,4,false,{allowGreetingLeft:true,allowFront:false,allowRear:false}),true);
  assert.equal(C.rifleHeadContact(id,state,left,feet,40,4,false,{allowGreetingLeft:false}),false);
  const right=ray([4,left.o[1],left.o[2]],[-1,0,0]);
  assert.equal(C.rifleHeadContact(id,state,right,[4,0,left.o[2]],40,4,false,{allowGreetingLeft:true}),false,'named left permission never opens right');
  let rear;for(const yy of [.021,.022,.023])for(const distance of [3.07,3.5,4,4.5]){
    const o=[0,1.55,distance],target=[0,(H.headY+yy)*look.tall,.065],v=target.map((x,i)=>x-o[i]),d=v.map(x=>+(x/Math.hypot(...v)).toFixed(3)),q=ray(o,d);
    if(C.rifleHeadRearRegion(id,state,q.hc.slice(1),o,d)){rear=q;break;}
  }
  assert.ok(rear,'genuinely supported production rear guard fixture');
  const rearArgs=[id,state,rear,[0,0,4],40,4,false];
  assert.equal(C.rifleHeadContact(...rearArgs),true);
  assert.equal(C.rifleHeadContact(...rearArgs,true,true),true);
  assert.equal(C.rifleHeadContact(...rearArgs,true,false),false);
  assert.equal(C.rifleHeadContact(...rearArgs,undefined,false),false,'legacy undefined front still respects explicit rear=false');
  assert.equal(C.rifleHeadContact(...rearArgs,{allowRear:false}),false);
  assert.equal(C.rifleHeadRegion(id,state,rear.hc.slice(1),rear.o,rear.d,false,undefined,false),false,'region legacy undefined/front and rear=false also preserved');
  const o=[0,1.62,-4],target=[-.068*width,(H.headY+.09)*look.tall,0],v=target.map((x,i)=>x-o[i]),d=v.map(x=>+(x/Math.hypot(...v)).toFixed(3)),front=ray(o,d),args=[id,state,front,[0,0,-4],40,4,false];
  assert.equal(C.rifleHeadFrontRegion(id,state,front.hc.slice(1),o,d),true);
  assert.equal(C.rifleHeadContact(...args,undefined,false),true,'legacy undefined front retains default true');
  assert.equal(C.rifleHeadContact(...args,null,false),false,'legacy null front remains falsy');
  assert.equal(C.rifleHeadContact(...args,false,false),false);
  assert.equal(C.rifleHeadContact(...args,{allowFront:false,allowRear:false}),false);
  assert.equal(C.rifleHeadContact(...args,{}),true,'named absent permissions retain front/rear defaults');
});

test('lower central nose band: authoritative damage, legacy fallback, one fatal award and retained recovery contract', async()=>{
  const {avatarLook,rifleNoseEntry,rifleNoseRegion,rifleNoseBandRegion,PVP_RIFLE_HEAD:H}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'Band nose shooter'),b=await connect(env,'Target'),id=b.got[0].i;
  a.send({p:[0,0,-4],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const state={p:[0,0,0],r:0},look=avatarLook(id);let shot;
  // Select an r2/r3 packet within the unchanged 6mm entry guard on the assigned canonical profile.
  // The 3mm forward offset is a room-only guard control; independent native skin proof establishes physical support.
  // Browser skin/nearest-face/cell proof is independent; this room test covers authoritative semantics.
  for(const oy of [1.60,1.61,1.62,1.63,1.64])for(const oz of [-4,-3,-2])for(const ox of [0,-.01,.01])for(const dx of [0,-.002,.002])for(const dy of [.0815,.082,.0825]){
    const o=[ox,oy,oz],raw=[dx*[.93,1,1.08][look.build]-ox,(H.headY+dy)*look.tall-o[1],-oz-.134*[.93,1,1.08][look.build]],length=Math.hypot(...raw),d=raw.map(v=>+(v/length).toFixed(3)),unit=d.map(v=>v/Math.hypot(...d)),entry=rifleNoseEntry(id,state,o,d);
    if(entry===null)continue;const hc=[1,...o.map((v,i)=>+(v+unit[i]*(entry-.003)).toFixed(3))];
    if(!shot&&!rifleNoseRegion(id,state,hc.slice(1))&&rifleNoseBandRegion(id,state,hc.slice(1)))shot={t:'a',w:'rifle',o,d,hc,to:id};
  }
  assert.ok(shot,'bounded native-profile ray exists for the assigned appearance');const{hc}=shot;assert.equal((await import('../src/config.js')).rifleNoseExtraRegion(id,state,hc.slice(1)),false);
  assert.equal(rifleNoseRegion(id,state,hc.slice(1)),false,'this is genuinely outside the published nose support');
  assert.equal(rifleNoseBandRegion(id,state,hc.slice(1)),true);assert.ok(Buffer.byteLength(JSON.stringify(shot))<=PLAYERS.maxBytes);
  const shoot=async m=>{now+=1000;a.send(m);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  let hit=await shoot(shot);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(hit.award.points,5);assert.equal(hit.dead,false);
  assert.equal(b.got.filter(m=>m.t==='hurt').at(-1).l,8);
  hit=await shoot({...shot,hc:undefined,head:true,damage:999});assert.equal(hit.head,undefined);assert.equal(hit.l,7,'contact-less old client still takes body damage only');
  hit=await shoot({...shot,hc:[9,...hc.slice(1)]});assert.equal(hit.head,undefined);assert.equal(hit.l,6,'unknown version stays body-only');
  b.send({p:[0,0,0],r:0,h:'rifle',c:true});await settle(env);hit=await shoot(shot);assert.equal(hit.head,undefined);assert.equal(hit.l,5);
  b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  env.PLAYERS.hibernate('world');
  const server=env.PLAYERS.object('world'),target=[...server.ctx.getWebSockets()].find(s=>s.deserializeAttachment().i===id),attachment=target.deserializeAttachment();attachment.l=1;target.serializeAttachment(attachment);
  hit=await shoot(shot);assert.equal(hit.head,true);assert.equal(hit.l,-1);assert.equal(hit.dead,true);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(hit.award.seq,5);
  const count=a.got.filter(m=>m.t==='hit').length;a.send(shot);await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,count,'same tick cannot produce another death or award');
  const observer=await connect(env);assert.equal(observer.got[0].ps.find(p=>p.i===id).l,COMBAT.lives);
});

test('#947 tiny LEFT turn anchor stays private, normalized, permanent and independent through hibernation',async()=>{
  const env=setup(),peers=[],join=async()=>{const c=await connect(env);peers.push(c);return c;},attachment=c=>c.ws.peer.deserializeAttachment();
  const state={p:[1.234,0,3.456],r:.804,h:'rifle'},send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
  try{
    for(const [anchor,yaw]of[[.8,.81],[.8,.79],[3.14,-3.14],[-3.14,3.14]]){
      const c=await join();assert.equal(attachment(c).leftTinyTurn,null);await send(c,{...state,r:anchor});
      await send(c,{...state,r:yaw,h:'saber',sp:true,score:4});assert.deepEqual(attachment(c).leftTinyTurn,{p:[1.23,0,3.46],r:anchor});
      assert.equal(attachment(c).s.r,yaw);assert.equal(attachment(c).headPoseFixed,false);assert.equal(attachment(c).turned,true);
      env.PLAYERS.hibernate('world');await send(c,{...state,r:yaw});assert.equal(attachment(c).leftTinyTurn.r,anchor);
      const outside=anchor===.8?.82:anchor+1;await send(c,{...state,r:outside});assert.equal(attachment(c).leftTinyTurn,false);
      await send(c,{...state,r:anchor});assert.equal(attachment(c).leftTinyTurn,false,'return does not restore tiny-turn history');
    }
    for(const delta of[{p:[1.25,0,3.46]},{c:true}]){const c=await join();await send(c,state);await send(c,{...state,...delta});await send(c,state);assert.equal(attachment(c).leftTinyTurn,false);}
    const crouched=await join();await send(crouched,{...state,c:true});await send(crouched,state);assert.equal(attachment(crouched).leftTinyTurn,false);
    for (const malformed of [null,true,false,{}, {p:[5000.01,0,0],r:.8},{p:[1.23,0,3.46],r:100.01},{p:[1.234,0,3.46],r:.8},{p:[1.23,0,3.46],r:.805}]) {
      const bad=await join();await send(bad,state);const raw=attachment(bad);raw.leftTinyTurn=malformed;bad.ws.peer.serializeAttachment(raw);
      await send(bad,{...state,r:.81});assert.equal(attachment(bad).leftTinyTurn===false||attachment(bad).leftTinyTurn===null,true,'malformed legacy metadata cannot gain corridor eligibility');
    }
    const legacy=await join();await send(legacy,state);const old=attachment(legacy);delete old.leftTinyTurn;delete old.leftStandingTurn;legacy.ws.peer.serializeAttachment(old);env.PLAYERS.hibernate('world');await send(legacy,{...state,r:.81});assert.equal(attachment(legacy).leftTinyTurn,undefined);
    const late=await join();for(const s of late.got[0].ps){assert.equal(Object.hasOwn(s,'leftTinyTurn'),false);assert.equal(Object.hasOwn(s,'headPoseFixed'),false);}
  }finally{for(const c of peers)c.ws.close();await settle(env);}
});

test('#947 accepted normalized tiny turn after greeting gives authoritative LEFT2, legacy/invalid returns remain body1',async()=>{
 const C=await import('../src/config.js'),env=setup(),a=await connect(env),b=await connect(env),id=b.got[0].i;const send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
 const first={p:[0,0,0],r:.8,h:'rifle'},state={p:[0,0,0],r:.81};await send(a,{p:[-4,0,0],r:0,h:'rifle'});await send(b,first);await send(b,{t:'g',to:a.got[0].i,k:0});await send(b,{...first,r:.81,h:'saber',sp:true,score:4});
 const look=C.avatarLook(id),width=[.93,1,1.08][look.build],r2=v=>+(v).toFixed(2),r3=v=>+(v).toFixed(3);let shot;
 for(const yy of[.098,.099,.100,.101,.102])for(const zz of[.067,.068,.069,.070,.071,.072,.073]){
  const y=(C.PVP_RIFLE_HEAD.headY+yy)*look.tall,o=[r2(-4*Math.cos(state.r)-zz*width*Math.sin(state.r)),r2(y),r2(4*Math.sin(state.r)-zz*width*Math.cos(state.r))],d=[r3(Math.cos(state.r)),0,r3(-Math.sin(state.r))],unit=d.map(v=>v/Math.hypot(...d)),entry=C.rifleSkullEntry(id,state,o,d);if(entry===null)continue;const hc=[1,...o.map((v,i)=>r3(v+unit[i]*entry))];if(!shot&&C.rifleHeadGreetingLeftRegion(id,state,hc.slice(1),o,d))shot={t:'a',w:'rifle',o,d,hc,to:id};
 }
 assert.ok(shot,'actual assigned appearance has a bounded pure-profile LEFT cell');await send(a,{p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});
 const fire=async(s)=>{await send(a,s);return a.got.filter(m=>m.t==='hit').at(-1);};let hit=await fire(shot);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(b.got.filter(m=>m.t==='hurt').at(-1).l,8);assert.ok(Buffer.byteLength(JSON.stringify(shot))<=256);
 hit=await fire({...shot,hc:undefined});assert.equal(hit.head,undefined);assert.equal(hit.l,7,'old client body fallback');
 env.PLAYERS.hibernate('world');const room=env.PLAYERS.object('world'),target=room.open().find(w=>w.deserializeAttachment().i===id);let att=target.deserializeAttachment();att.l=1;target.serializeAttachment(att);hit=await fire(shot);assert.equal(hit.head,true);assert.equal(hit.dead,true);assert.equal(hit.l,-1);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(hit.award.seq,3);
 const count=a.got.filter(m=>m.t==='hit').length;a.send(shot);await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,count,'replay gives no second award/death');
 att=target.deserializeAttachment();delete att.leftTinyTurn;delete att.leftStandingTurn;target.serializeAttachment(att);env.PLAYERS.hibernate('world');hit=await fire(shot);assert.equal(hit.head,undefined);assert.equal(hit.l,9,'legacy resumed attachment cannot acquire LEFT permission');
 await send(b,{...first,r:.82});await send(b,{...first,r:.81});hit=await fire(shot);assert.equal(hit.head,undefined);assert.equal(hit.l,8,'out-of-band and return stay body1');
 a.ws.close();b.ws.close();await settle(env);
});

test('post-turn frontal corridor: private first-standing anchor, permanent escape, legacy failure and independent regions',async()=>{
  const {avatarLook,PVP_RIFLE_HEAD:H,rifleSkullEntry,rifleHeadAfterTurnFrontRegion}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'Small-turn shooter'),b=await connect(env,'Small-turn target'),id=b.got[0].i;
  a.send({p:[0,0,-3],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const socket=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(ws=>ws.deserializeAttachment().i===id),attachment=()=>socket().deserializeAttachment();
  assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0});
  const shotFor=(r,seed=id)=>{const look=avatarLook(seed),w=[.93,1,1.08][look.build],state={p:[0,0,0],r};for(const x of [-.067,.067])for(const dy of [.089,.09,.091])for(const distance of [3,3.5,4]){
    const c=Math.cos(r),s=Math.sin(r),target=[-x*w*c-.08*w*s,(H.headY+dy)*look.tall,x*w*s-.08*w*c],o=[+(target[0]-distance*s).toFixed(2),1.62,+(target[2]-distance*c).toFixed(2)],raw=target.map((v,i)=>v-o[i]),n=Math.hypot(...raw),d=raw.map(v=>+(v/n).toFixed(3)),unit=d.map(v=>v/Math.hypot(...d)),first=rifleSkullEntry(seed,state,o,d);if(first===null)continue;const hc=[1,...o.map((v,i)=>+(v+unit[i]*first).toFixed(3))];if(rifleHeadAfterTurnFrontRegion(seed,state,hc.slice(1),o,d))return{t:'a',w:'rifle',to:seed,o,d,hc};
  }throw Error('no rounded narrow frontal corridor contact');};
  const shoot=async (r,seed=id)=>{const shot=shotFor(r,seed);a.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;a.send(shot);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  b.send({p:[0,0,0],r:.01,h:'rifle',frontTurn:{p:[0,0,0],r:999},turned:false});await settle(env);now+=1000;
  assert.equal(attachment().turned,true);assert.equal(attachment().headPoseFixed,false);assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0},'cleaned state cannot replace private anchor');
  let hit=await shoot(.01);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(hit.award.points,5);
  env.PLAYERS.hibernate('world');b.send({p:[0,0,0],r:-.02,h:'saber',score:99});await settle(env);assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0});
  b.send({p:[0,0,0],r:-.02,h:'rifle'});await settle(env);hit=await shoot(-.02);assert.equal(hit.head,true);assert.equal(hit.l,6,'opposite corridor boundary remains supported after hibernation');
  const late=await connect(env,'Late observer'),published=late.got[0].ps.find(p=>p.i===id);assert.equal(published.frontTurn,undefined);assert.equal(published.turned,undefined);
  b.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(env);assert.equal(attachment().frontTurn,false);
  b.send({p:[0,0,0],r:.01,h:'rifle'});await settle(env);hit=await shoot(.01);assert.equal(hit.head,undefined);assert.equal(hit.l,5,'returning from larger turn never restores corridor');
  b.ws.close();await settle(env);const fresh=await connect(env,'Fresh history'),fid=fresh.got[0].i;fresh.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(env);
  const getFresh=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(ws=>ws.deserializeAttachment().i===fid);
  assert.deepEqual(getFresh().deserializeAttachment().frontTurn,{p:[0,0,0],r:3.14});fresh.send({p:[0,0,0],r:3.16,h:'rifle'});await settle(env);assert.ok(getFresh().deserializeAttachment().frontTurn);
  // Legacy unknown history is not reconstructed from current position or a later good heading.
  for(const history of [undefined,null,true,{p:[0,0],r:3.14}]){let old=getFresh().deserializeAttachment();if(history===undefined)delete old.frontTurn;else old.frontTurn=history;getFresh().serializeAttachment(old);fresh.send({p:[0,0,0],r:3.15,h:'rifle'});await settle(env);assert.ok(!getFresh().deserializeAttachment().frontTurn,'unknown/malformed legacy is not reconstructed');assert.equal((await shoot(3.15,fid)).head,undefined,'supported ray on unknown/null/malformed history remains body-only');}
  for(const peer of [a,fresh,late])peer.ws.close();await settle(env);
});

test('#955 greeted post-turn Front: normalized authority, history, lethal/replay and legacy independence',async()=>{
  const {avatarLook,PVP_RIFLE_HEAD:H,rifleSkullEntry,rifleHeadAfterTurnFrontRegion}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'Small-turn shooter'),b=await connect(env,'Small-turn target'),id=b.got[0].i;
  a.send({p:[0,0,-3],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const socket=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(ws=>ws.deserializeAttachment().i===id),attachment=()=>socket().deserializeAttachment();
  assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0});
  const shotFor=(r,seed=id)=>{const look=avatarLook(seed),w=[.93,1,1.08][look.build],state={p:[0,0,0],r};for(const x of [-.067,.067])for(const dy of [.089,.09,.091])for(const distance of [3,3.5,4]){
    const c=Math.cos(r),s=Math.sin(r),target=[-x*w*c-.08*w*s,(H.headY+dy)*look.tall,x*w*s-.08*w*c],o=[+(target[0]-distance*s).toFixed(2),1.62,+(target[2]-distance*c).toFixed(2)],raw=target.map((v,i)=>v-o[i]),n=Math.hypot(...raw),d=raw.map(v=>+(v/n).toFixed(3)),unit=d.map(v=>v/Math.hypot(...d)),first=rifleSkullEntry(seed,state,o,d);if(first===null)continue;const hc=[1,...o.map((v,i)=>+(v+unit[i]*first).toFixed(3))];if(rifleHeadAfterTurnFrontRegion(seed,state,hc.slice(1),o,d))return{t:'a',w:'rifle',to:seed,o,d,hc};
  }throw Error('no rounded narrow frontal corridor contact');};
  const shoot=async (r,seed=id)=>{const shot=shotFor(r,seed);a.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;a.send(shot);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  b.send({p:[0,0,0],r:.01,h:'rifle',frontTurn:{p:[0,0,0],r:999},turned:false});await settle(env);now+=1000;
  assert.equal(attachment().turned,true);assert.equal(attachment().headPoseFixed,false);assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0},'cleaned state cannot replace private anchor');
  b.send({t:'g',to:a.got[0].i,k:999});await settle(env);assert.equal(attachment().gt,undefined,'invalid greeting does not create authority');
  b.send({t:'g',to:a.got[0].i,k:0});await settle(env);const acceptedGt=attachment().gt;assert.equal(typeof acceptedGt,'number');
  b.send({t:'g',to:a.got[0].i,k:1});await settle(env);assert.equal(attachment().gt,acceptedGt,'rate-rejected repeat cannot alter accepted private greeting');
  const current=shotFor(.01),C=await import('../src/config.js');
  assert.equal(C.rifleHeadContact(id,{p:[0,0,0],r:.01},current,current.o,COMBAT.weapons.rifle.range,COMBAT.from,false,{allowFront:false,allowRear:false,allowGreetingAfterTurnFront:false}),false,'named permission defaults false');
  assert.equal(C.rifleHeadContact(id,{p:[0,0,0],r:.01},current,current.o,COMBAT.weapons.rifle.range,COMBAT.from,false,{allowFront:false,allowRear:false,allowGreetingAfterTurnFront:true}),true,'separate permission uses unchanged region');
  let hit=await shoot(.01);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(hit.award.points,5);
  assert.equal(attachment().headPoseFixed,false);assert.equal(attachment().turned,true);assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0});
  env.PLAYERS.hibernate('world');b.send({p:[0,0,0],r:-.02,h:'saber',score:99});await settle(env);assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0});
  b.send({p:[0,0,0],r:-.02,h:'rifle'});await settle(env);hit=await shoot(-.02);assert.equal(hit.head,true);assert.equal(hit.l,6,'opposite corridor boundary remains supported after hibernation');
  const low=attachment();low.l=1;socket().serializeAttachment(low);hit=await shoot(-.02);assert.equal(hit.head,true);assert.equal(hit.dead,true);assert.equal(hit.l,-1);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(hit.award.seq,3);assert.equal(attachment().l,COMBAT.lives);assert.equal(attachment().gt,acceptedGt);
  const hitCount=a.got.filter(m=>m.t==='hit').length;a.send(shotFor(-.02));await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,hitCount,'same-tick replay adds no lethal award');
  const late=await connect(env,'Late observer'),published=late.got[0].ps.find(p=>p.i===id);assert.equal(published.frontTurn,undefined);assert.equal(published.turned,undefined);
  b.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(env);assert.equal(attachment().frontTurn,false);
  b.send({p:[0,0,0],r:.01,h:'rifle'});await settle(env);hit=await shoot(.01);assert.equal(hit.head,undefined);assert.equal(hit.l,9,'returning from larger turn never restores corridor');
  b.ws.close();await settle(env);const fresh=await connect(env,'Fresh history'),fid=fresh.got[0].i;fresh.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(env);
  const getFresh=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(ws=>ws.deserializeAttachment().i===fid);
  fresh.send({t:'g',to:a.got[0].i,k:0});await settle(env);assert.equal(typeof getFresh().deserializeAttachment().gt,'number');
  assert.deepEqual(getFresh().deserializeAttachment().frontTurn,{p:[0,0,0],r:3.14});fresh.send({p:[0,0,0],r:3.16,h:'rifle'});await settle(env);assert.ok(getFresh().deserializeAttachment().frontTurn);
  // Legacy unknown history is not reconstructed from current position or a later good heading.
  for(const history of [undefined,null,true,{p:[0,0],r:3.14}]){let old=getFresh().deserializeAttachment();if(history===undefined)delete old.frontTurn;else old.frontTurn=history;getFresh().serializeAttachment(old);fresh.send({p:[0,0,0],r:3.15,h:'rifle'});await settle(env);assert.ok(!getFresh().deserializeAttachment().frontTurn,'unknown/malformed legacy is not reconstructed');assert.equal((await shoot(3.15,fid)).head,undefined,'supported ray on unknown/null/malformed history remains body-only');}
  for(const delta of [{p:[.01,0,0]},{c:true},{r:.03}]){
    const sender=await connect(env,'Independent changed shooter');const changed=await connect(env,'Changed combo'),cid=changed.got[0].i,base={p:[0,0,0],r:0,h:'rifle'};
    changed.send(base);await settle(env);changed.send({t:'g',to:sender.got[0].i,k:0});await settle(env);changed.send({...base,r:.01,h:'saber'});await settle(env);changed.send({...base,r:.01,...delta});await settle(env);changed.send({...base,r:.01});await settle(env);
    const sock=[...env.PLAYERS.object('world').ctx.getWebSockets()].find(w=>w.deserializeAttachment().i===cid);assert.equal(sock.deserializeAttachment().frontTurn,false,'moving/crouching/escape cannot restore after return');
    const shot=shotFor(.01,cid);shot.allowGreetingAfterTurnFront=true;sender.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;sender.send(shot);await settle(env);const body=sender.got.filter(m=>m.t==='hit').at(-1);assert.equal(body.head,undefined,'client named permission cannot override invalid private anchor');assert.equal(body.l,9);changed.ws.close();sender.ws.close();await settle(env);
  }
  for(const peer of [a,fresh,late])peer.ws.close();await settle(env);
});

test('#953 larger LEFT standing turn anchor stays private, normalized, permanent and independent through hibernation',async()=>{
  const env=setup(),peers=[],join=async()=>{const c=await connect(env);peers.push(c);return c;},attachment=c=>c.ws.peer.deserializeAttachment();
  const state={p:[1.234,0,3.456],r:.804,h:'rifle'},send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
  try{
    for(const [anchor,yaw]of[[.8,1.10],[.8,.50],[3.14,-2.85],[-3.14,2.85]]){
      const c=await join();assert.equal(attachment(c).leftStandingTurn,null);await send(c,{...state,r:anchor});
      await send(c,{...state,r:yaw,h:'saber',sp:true,score:4});assert.deepEqual(attachment(c).leftStandingTurn,{p:[1.23,0,3.46],r:anchor});
      assert.equal(attachment(c).s.r,yaw);assert.equal(attachment(c).headPoseFixed,false);assert.equal(attachment(c).turned,true);assert.equal(attachment(c).leftTinyTurn,false);
      env.PLAYERS.hibernate('world');await send(c,{...state,r:yaw});assert.equal(attachment(c).leftStandingTurn.r,anchor);
      // Every accepted r2 quantum in the standing corridor, including reverse traversal and wrapped aliases.
      for(const direction of [1,-1])for(let step=0;step<=60;step++){const q=direction*(step-30),raw=+(anchor+q/100).toFixed(2);for(const r of [raw,+Math.atan2(Math.sin(raw),Math.cos(raw)).toFixed(2)]){if(Math.abs(Math.atan2(Math.sin(r-anchor),Math.cos(r-anchor)))>.30&&Math.abs(Math.round((r-anchor)*100))>30)continue;await send(c,{...state,r});assert.equal(attachment(c).s.r,r);assert.deepEqual(attachment(c).leftStandingTurn,{p:[1.23,0,3.46],r:anchor});}}
      const outside=anchor+.31;await send(c,{...state,r:outside});assert.equal(attachment(c).leftStandingTurn,false);
      await send(c,{...state,r:anchor});assert.equal(attachment(c).leftStandingTurn,false,'return does not restore tiny-turn history');
    }
    for(const delta of[{p:[1.25,0,3.46]},{c:true}]){const c=await join();await send(c,state);await send(c,{...state,...delta});await send(c,state);assert.equal(attachment(c).leftStandingTurn,false);}
    const crouched=await join();await send(crouched,{...state,c:true});await send(crouched,state);assert.equal(attachment(crouched).leftStandingTurn,false);
    for (const malformed of [null,true,false,{}, {p:[5000.01,0,0],r:.8},{p:[1.23,0,3.46],r:100.01},{p:[1.234,0,3.46],r:.8},{p:[1.23,0,3.46],r:.805}]) {
      const bad=await join();await send(bad,state);const raw=attachment(bad);raw.leftStandingTurn=malformed;bad.ws.peer.serializeAttachment(raw);
      await send(bad,{...state,r:1.10});assert.equal(attachment(bad).leftStandingTurn===false||attachment(bad).leftStandingTurn===null,true,'malformed legacy metadata cannot gain corridor eligibility');
    }
    const legacy=await join();await send(legacy,state);const old=attachment(legacy);delete old.leftStandingTurn;legacy.ws.peer.serializeAttachment(old);env.PLAYERS.hibernate('world');await send(legacy,{...state,r:1.10});assert.equal(attachment(legacy).leftStandingTurn,undefined);
    const late=await join();for(const s of late.got[0].ps){assert.equal(Object.hasOwn(s,'leftStandingTurn'),false);assert.equal(Object.hasOwn(s,'headPoseFixed'),false);}
  }finally{for(const c of peers)c.ws.close();await settle(env);}
});


test('#953 accepted larger standing turn after greeting gives authoritative LEFT2, legacy/invalid returns remain body1',async()=>{
 const C=await import('../src/config.js'),env=setup(),a=await connect(env),b=await connect(env),id=b.got[0].i;const send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
 const first={p:[0,0,0],r:.8,h:'rifle'},state={p:[0,0,0],r:1.10};await send(a,{p:[-4,0,0],r:0,h:'rifle'});await send(b,first);await send(b,{t:'g',to:a.got[0].i,k:0});await send(b,{...first,r:1.10,h:'saber',sp:true,score:4});
 const look=C.avatarLook(id),width=[.93,1,1.08][look.build],r2=v=>+(v).toFixed(2),r3=v=>+(v).toFixed(3);let shot;
 for(const yy of[.098,.099,.100,.101,.102])for(const zz of[.067,.068,.069,.070,.071,.072,.073]){
  const y=(C.PVP_RIFLE_HEAD.headY+yy)*look.tall,o=[r2(-4*Math.cos(state.r)-zz*width*Math.sin(state.r)),r2(y),r2(4*Math.sin(state.r)-zz*width*Math.cos(state.r))],d=[r3(Math.cos(state.r)),0,r3(-Math.sin(state.r))],unit=d.map(v=>v/Math.hypot(...d)),entry=C.rifleSkullEntry(id,state,o,d);if(entry===null)continue;const hc=[1,...o.map((v,i)=>r3(v+unit[i]*entry))];if(!shot&&C.rifleHeadGreetingLeftRegion(id,state,hc.slice(1),o,d))shot={t:'a',w:'rifle',o,d,hc,to:id};
 }
 assert.ok(shot,'actual assigned appearance has a bounded pure-profile LEFT cell');await send(a,{p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});
 const fire=async(s)=>{await send(a,s);return a.got.filter(m=>m.t==='hit').at(-1);};let hit=await fire(shot);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(b.got.filter(m=>m.t==='hurt').at(-1).l,8);assert.ok(Buffer.byteLength(JSON.stringify(shot))<=256);
 hit=await fire({...shot,hc:undefined});assert.equal(hit.head,undefined);assert.equal(hit.l,7,'old client body fallback');
 env.PLAYERS.hibernate('world');const room=env.PLAYERS.object('world'),target=room.open().find(w=>w.deserializeAttachment().i===id);let att=target.deserializeAttachment();att.l=1;target.serializeAttachment(att);hit=await fire(shot);assert.equal(hit.head,true);assert.equal(hit.dead,true);assert.equal(hit.l,-1);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(hit.award.seq,3);
 const count=a.got.filter(m=>m.t==='hit').length;a.send(shot);await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,count,'replay gives no second award/death');
 att=target.deserializeAttachment();delete att.leftTinyTurn;delete att.leftStandingTurn;target.serializeAttachment(att);env.PLAYERS.hibernate('world');hit=await fire(shot);assert.equal(hit.head,undefined);assert.equal(hit.l,9,'legacy resumed attachment cannot acquire LEFT permission');
 await send(b,{...first,r:1.11});await send(b,{...first,r:1.10});hit=await fire(shot);assert.equal(hit.head,undefined);assert.equal(hit.l,8,'out-of-band and return stay body1');
 a.ws.close();b.ws.close();await settle(env);
});

test('#951 immutable Rear greeting uses existing private history; changed/legacy return, healing and death never reopen it',async()=>{
  const C=await import('../src/config.js'),env=setup(),a=await connect(env,'Rear shooter'),peers=[a],state={p:[0,0,0],r:3.14,h:'rifle'};
  const send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
  const join=async()=>{const b=await connectLook(env,'Rear target',l=>l.style===2);assert.equal(C.avatarLook(b.got[0].i).style,2);peers.push(b);return b;};
  const attachment=b=>b.ws.peer.deserializeAttachment();
  const shotFor=id=>{const lk=C.avatarLook(id);for(const yy of[.021,.022,.023])for(const distance of[3.07,3.5,4,4.5]){const o=[0,1.55,-distance],aim=[0,(C.PVP_RIFLE_HEAD.headY+yy)*lk.tall,-.065],v=aim.map((x,i)=>x-o[i]),d=v.map(x=>+(x/Math.hypot(...v)).toFixed(3)),unit=d.map(x=>x/Math.hypot(...d)),entry=C.rifleSkullEntry(id,state,o,d);if(entry===null)continue;const hc=[1,...o.map((x,i)=>+(x+unit[i]*entry).toFixed(3))];if(C.rifleHeadRearRegion(id,state,hc.slice(1),o,d))return{t:'a',w:'rifle',to:id,o,d,hc};}throw Error('no bounded actual production Rear cell');};
  const fire=async b=>{const s=shotFor(b.got[0].i);await send(a,{p:[s.o[0],0,s.o[2]],r:0,h:'rifle'});await send(a,s);return a.got.filter(m=>m.t==='hit').at(-1);};
  try{
    const b=await join();await send(b,state);await send(b,{t:'g',to:a.got[0].i,k:0});assert.equal(attachment(b).headPoseFixed,true);assert.ok(attachment(b).gt);
    let hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,8);
    env.PLAYERS.hibernate('world');await send(b,{...state,h:'saber',score:17,sp:true});hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,6);
    const low=attachment(b);low.l=1;b.ws.peer.serializeAttachment(low);hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,-1);assert.equal(hit.dead,true);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(attachment(b).headPoseFixed,true,'death does not manufacture or clear immutable pose');
    const count=a.got.filter(m=>m.t==='hit').length;a.send(shotFor(b.got[0].i));await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,count,'same-tick replay has no duplicate death/award');
    for(const delta of[{p:[.01,0,0]},{r:3.17},{c:true}]){
      const changed=await join();await send(changed,state);await send(changed,{t:'g',to:a.got[0].i,k:0});await send(changed,{...state,...delta});await send(changed,state);assert.equal(attachment(changed).headPoseFixed,false);
      env.PLAYERS.hibernate('world');hit=await fire(changed);assert.equal(hit.head,undefined);assert.equal(hit.l,9,'accepted p/c change or yaw corridor escape and return keeps Rear body1');
      now=attachment(changed).healAt;a.send('p');changed.send('p');await settle(env);await env.PLAYERS.object('world').alarm();await settle(env);assert.equal(attachment(changed).headPoseFixed,false,'healing does not reconstruct history');assert.equal(attachment(changed).l,10);
      let low=attachment(changed);low.l=1;changed.ws.peer.serializeAttachment(low);hit=await fire(changed);assert.equal(hit.head,undefined);assert.equal(hit.dead,true);assert.equal(hit.l,0);assert.equal(attachment(changed).headPoseFixed,false,'death cannot reopen changed history');
    }
    for(const history of[undefined,null,false,1,'true']){const legacy=await join();await send(legacy,state);await send(legacy,{t:'g',to:a.got[0].i,k:0});const raw=attachment(legacy);if(history===undefined)delete raw.headPoseFixed;else raw.headPoseFixed=history;legacy.ws.peer.serializeAttachment(raw);env.PLAYERS.hibernate('world');await send(legacy,state);assert.notEqual(attachment(legacy).headPoseFixed,true);assert.equal((await fire(legacy)).head,undefined,'unknown/malformed legacy flag remains body1');}
    const fresh=await join();await send(fresh,state);await send(fresh,{t:'g',to:a.got[0].i,k:0});assert.equal((await fire(fresh)).head,true,'genuine new socket establishes its own immutable history');
    const observer=await connect(env,'Late');peers.push(observer);for(const s of observer.got[0].ps)assert.equal(Object.hasOwn(s,'headPoseFixed'),false);
  }finally{for(const p of peers)p.ws.close();await settle(env);}
});

test('#952 greeted post-turn Rear: normalized authority, history, lethal/replay and legacy independence',async()=>{
  const {avatarLook,PVP_RIFLE_HEAD:H,rifleSkullEntry,rifleHeadRearRegion}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'Small-turn shooter'),initial=await connect(env,'Small-turn target');
  let b=initial;while(avatarLook(b.got[0].i).style===1){b.ws.close();await settle(env);b=await connect(env,'Small-turn target');}const id=b.got[0].i;
  a.send({p:[0,0,-3],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const socket=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(ws=>ws.deserializeAttachment().i===id),attachment=()=>socket().deserializeAttachment();
  assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0});
  const shotFor=(r,seed=id)=>{const look=avatarLook(seed),w=[.93,1,1.08][look.build],state={p:[0,0,0],r},patch=look.style===3?H.rear.beanie:H.rear.lower;for(const dy of [patch.low+.001,(patch.low+patch.high)/2,patch.high-.001])for(const distance of [3,3.5,4]){
    const c=Math.cos(r),s=Math.sin(r),target=[.08*w*s,(H.headY+dy)*look.tall,.08*w*c],o=[+(target[0]+distance*s).toFixed(2),target[1],+(target[2]+distance*c).toFixed(2)].map(v=>+v.toFixed(2)),raw=target.map((v,i)=>v-o[i]),n=Math.hypot(...raw),d=raw.map(v=>+(v/n).toFixed(3)),unit=d.map(v=>v/Math.hypot(...d)),first=rifleSkullEntry(seed,state,o,d);if(first===null)continue;const hc=[1,...o.map((v,i)=>+(v+unit[i]*first).toFixed(3))];if(rifleHeadRearRegion(seed,state,hc.slice(1),o,d))return{t:'a',w:'rifle',to:seed,o,d,hc};
  }throw Error('no rounded Rear corridor contact');};
  const shoot=async (r,seed=id)=>{const shot=shotFor(r,seed);a.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;a.send(shot);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  b.send({p:[0,0,0],r:.01,h:'rifle',frontTurn:{p:[0,0,0],r:999},turned:false});await settle(env);now+=1000;
  assert.equal(attachment().turned,true);assert.equal(attachment().headPoseFixed,false);assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0},'cleaned state cannot replace private anchor');
  b.send({t:'g',to:a.got[0].i,k:999});await settle(env);assert.equal(attachment().gt,undefined,'invalid greeting does not create authority');
  b.send({t:'g',to:a.got[0].i,k:0});await settle(env);const acceptedGt=attachment().gt;assert.equal(typeof acceptedGt,'number');
  b.send({t:'g',to:a.got[0].i,k:1});await settle(env);assert.equal(attachment().gt,acceptedGt,'rate-rejected repeat cannot alter accepted private greeting');
  const current=shotFor(.01),C=await import('../src/config.js');
  assert.equal(C.rifleHeadContact(id,{p:[0,0,0],r:.01},current,current.o,COMBAT.weapons.rifle.range,COMBAT.from,false,{allowFront:false,allowRear:false,allowGreetingAfterTurnRear:false}),false,'named permission defaults false');
  assert.equal(C.rifleHeadContact(id,{p:[0,0,0],r:.01},current,current.o,COMBAT.weapons.rifle.range,COMBAT.from,false,{allowFront:false,allowRear:false,allowGreetingAfterTurnRear:true}),true,'separate permission uses unchanged region');
  let hit=await shoot(.01);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(hit.award.points,5);
  assert.equal(attachment().headPoseFixed,false);assert.equal(attachment().turned,true);assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0});
  env.PLAYERS.hibernate('world');b.send({p:[0,0,0],r:-.02,h:'saber',score:99});await settle(env);assert.deepEqual(attachment().frontTurn,{p:[0,0,0],r:0});
  b.send({p:[0,0,0],r:-.02,h:'rifle'});await settle(env);hit=await shoot(-.02);assert.equal(hit.head,true);assert.equal(hit.l,6,'opposite corridor boundary remains supported after hibernation');
  const low=attachment();low.l=1;socket().serializeAttachment(low);hit=await shoot(-.02);assert.equal(hit.head,true);assert.equal(hit.dead,true);assert.equal(hit.l,-1);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(hit.award.seq,3);assert.equal(attachment().l,COMBAT.lives);assert.equal(attachment().gt,acceptedGt);
  const hitCount=a.got.filter(m=>m.t==='hit').length;a.send(shotFor(-.02));await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,hitCount,'same-tick replay adds no lethal award');
  const late=await connect(env,'Late observer'),published=late.got[0].ps.find(p=>p.i===id);assert.equal(published.frontTurn,undefined);assert.equal(published.turned,undefined);
  b.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(env);assert.equal(attachment().frontTurn,false);
  b.send({p:[0,0,0],r:.01,h:'rifle'});await settle(env);hit=await shoot(.01);assert.equal(hit.head,undefined);assert.equal(hit.l,9,'returning from larger turn never restores corridor');
  b.ws.close();await settle(env);let fresh=await connect(env,'Fresh history');while(avatarLook(fresh.got[0].i).style===1){fresh.ws.close();await settle(env);fresh=await connect(env,'Fresh history');}const fid=fresh.got[0].i;fresh.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(env);
  const getFresh=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(ws=>ws.deserializeAttachment().i===fid);
  fresh.send({t:'g',to:a.got[0].i,k:0});await settle(env);assert.equal(typeof getFresh().deserializeAttachment().gt,'number');
  assert.deepEqual(getFresh().deserializeAttachment().frontTurn,{p:[0,0,0],r:3.14});fresh.send({p:[0,0,0],r:3.16,h:'rifle'});await settle(env);assert.ok(getFresh().deserializeAttachment().frontTurn);
  // Legacy unknown history is not reconstructed from current position or a later good heading.
  for(const history of [undefined,null,true,{p:[0,0],r:3.14}]){let old=getFresh().deserializeAttachment();if(history===undefined)delete old.frontTurn;else old.frontTurn=history;getFresh().serializeAttachment(old);fresh.send({p:[0,0,0],r:3.15,h:'rifle'});await settle(env);assert.ok(!getFresh().deserializeAttachment().frontTurn,'unknown/malformed legacy is not reconstructed');assert.equal((await shoot(3.15,fid)).head,undefined,'supported ray on unknown/null/malformed history remains body-only');}
  for(const delta of [{p:[.01,0,0]},{c:true},{r:.03}]){
    const sender=await connect(env,'Independent changed shooter');let changed=await connect(env,'Changed combo');while(avatarLook(changed.got[0].i).style===1){changed.ws.close();await settle(env);changed=await connect(env,'Changed combo');}const cid=changed.got[0].i,base={p:[0,0,0],r:0,h:'rifle'};
    changed.send(base);await settle(env);changed.send({t:'g',to:sender.got[0].i,k:0});await settle(env);changed.send({...base,r:.01,h:'saber'});await settle(env);changed.send({...base,r:.01,...delta});await settle(env);changed.send({...base,r:.01});await settle(env);
    const sock=[...env.PLAYERS.object('world').ctx.getWebSockets()].find(w=>w.deserializeAttachment().i===cid);assert.equal(sock.deserializeAttachment().frontTurn,false,'moving/crouching/escape cannot restore after return');
    const shot=shotFor(.01,cid);shot.allowGreetingAfterTurnRear=true;sender.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;sender.send(shot);await settle(env);const body=sender.got.filter(m=>m.t==='hit').at(-1);assert.equal(body.head,undefined,'client named permission cannot override invalid private anchor');assert.equal(body.l,9);changed.ws.close();sender.ws.close();await settle(env);
  }
  for(const peer of [a,fresh,late])peer.ws.close();await settle(env);
});

test('#950 immutable Nose depth uses existing private history; changed/legacy return, healing and death never reopen it',async()=>{
  const C=await import('../src/config.js'),env=setup(),a=await connect(env,'Nose depth shooter'),peers=[a],state={p:[0,0,0],r:0,h:'rifle'};
  const send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
  const join=async()=>{const b=await connectLook(env,'Nose depth target',l=>l.build===1&&l.tall===.975);const l=C.avatarLook(b.got[0].i);assert.ok(l.build===1&&l.tall===.975,'canonical build1/tall.975 target');peers.push(b);return b;};
  const attachment=b=>b.ws.peer.deserializeAttachment();
  // Actual native immutable idle-6 contact, independently sampled for all four styles at build1/tall.975.
  const shotFor=id=>({t:'a',w:'rifle',to:id,o:[0,1.58,-3.13],d:[.001,0,1],hc:[1,.003,1.58,-.13]});

  const fire=async b=>{const s=shotFor(b.got[0].i);await send(a,{p:[s.o[0],0,s.o[2]],r:0,h:'rifle'});await send(a,s);return a.got.filter(m=>m.t==='hit').at(-1);};
  try{
    const b=await join();await send(b,state);await send(b,{t:'g',to:a.got[0].i,k:0});assert.equal(attachment(b).headPoseFixed,true);assert.ok(attachment(b).gt);
    const shot=shotFor(b.got[0].i);assert.equal(C.rifleHeadContact(b.got[0].i,state,shot,shot.o,40,4),false,'legacy default cannot enable new Nose family');assert.equal(C.rifleNoseRegion(b.got[0].i,state,shot.hc.slice(1))||C.rifleNoseExtraRegion(b.got[0].i,state,shot.hc.slice(1))||C.rifleNoseBandRegion(b.got[0].i,state,shot.hc.slice(1)),false,'outside every published Nose family');
    for(const options of [undefined,null,true,false,{}, {allowImmutableNoseDepth:false}, {allowImmutableNoseDepth:1}, {allowImmutableNoseDepth:'true'}])assert.equal(C.rifleHeadContact(b.got[0].i,state,shot,shot.o,40,4,true,options),false,'only strict named true enables new depth family');
    let hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,8);
    env.PLAYERS.hibernate('world');await send(b,{...state,h:'saber',score:17,sp:true});hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,6);
    const low=attachment(b);low.l=1;b.ws.peer.serializeAttachment(low);hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,-1);assert.equal(hit.dead,true);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(attachment(b).headPoseFixed,true,'death does not manufacture or clear immutable pose');
    const count=a.got.filter(m=>m.t==='hit').length;a.send(shotFor(b.got[0].i));await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,count,'same-tick replay has no duplicate death/award');
    for(const delta of[{p:[.01,0,0]},{r:.01},{c:true}]){
      const changed=await join();await send(changed,state);await send(changed,{t:'g',to:a.got[0].i,k:0});await send(changed,{...state,...delta});await send(changed,state);assert.equal(attachment(changed).headPoseFixed,false);
      env.PLAYERS.hibernate('world');hit=await fire(changed);assert.equal(hit.head,undefined);assert.equal(hit.l,9,'accepted p/r/c change and return keeps verified Nose depth body1');
      now=attachment(changed).healAt;a.send('p');changed.send('p');await settle(env);await env.PLAYERS.object('world').alarm();await settle(env);assert.equal(attachment(changed).headPoseFixed,false,'healing does not reconstruct history');assert.equal(attachment(changed).l,10);
      let low=attachment(changed);low.l=1;changed.ws.peer.serializeAttachment(low);hit=await fire(changed);assert.equal(hit.head,undefined);assert.equal(hit.dead,true);assert.equal(hit.l,0);assert.equal(attachment(changed).headPoseFixed,false,'death cannot reopen changed history');
    }
    for(const history of[undefined,null,false,1,'true']){const legacy=await join();await send(legacy,state);await send(legacy,{t:'g',to:a.got[0].i,k:0});const raw=attachment(legacy);if(history===undefined)delete raw.headPoseFixed;else raw.headPoseFixed=history;legacy.ws.peer.serializeAttachment(raw);env.PLAYERS.hibernate('world');await send(legacy,state);assert.notEqual(attachment(legacy).headPoseFixed,true);assert.equal((await fire(legacy)).head,undefined,'unknown/malformed legacy flag remains body1');}
    const fresh=await join();await send(fresh,state);await send(fresh,{t:'g',to:a.got[0].i,k:0});assert.equal((await fire(fresh)).head,true,'genuine new socket establishes its own immutable history');
    const observer=await connect(env,'Late');peers.push(observer);for(const s of observer.got[0].ps)assert.equal(Object.hasOwn(s,'headPoseFixed'),false);
  }finally{for(const p of peers)p.ws.close();await settle(env);}
});

// #959 math/authority regression; actual nearest surfaces and quantized cells are proved by the native driver.
const jawStripShot = (C,id,state={p:[0,0,0],r:0}) => {
  const l=C.avatarLook(id),w=[.93,1,1.08][l.build],H=C.PVP_RIFLE_HEAD;
  for(const distance of[2,2.2,2.4,2.6,2.8,3,3.2,3.4,3.6,3.8,4])for(const yy of[.038,.0385,.039]){
    const o=[0,1.62,-+(distance+.115*w).toFixed(2)],at=[-.026*w,(H.headY+yy)*l.tall,-.115*w],v=at.map((x,i)=>x-o[i]),d=v.map(x=>+(x/Math.hypot(...v)).toFixed(3));
    const entry=C.rifleJawEntry(id,state,o,d);if(entry===null)continue;
    const hc=[1,...o.map((x,i)=>+(x+d[i]/Math.hypot(...d)*entry).toFixed(3))],shot={t:'a',w:'rifle',to:id,o,d,hc};
    if(C.rifleJawFrontSideRegion(id,state,hc.slice(1),o,d)&&C.rifleHeadContact(id,state,shot,[0,0,o[2]],40,4,false,{allowFront:false,allowRear:false,allowJawFrontSide:true}))return shot;
  }
  throw Error('No bounded shared-profile Jaw strip cell for '+id);
};

test('#959 Jaw strip strict named permission defaults closed and never changes original Jaw/legacy guards',async()=>{
  const C=await import('../src/config.js'),id='jaw-0',state={p:[0,0,0],r:0},shot=jawStripShot(C,id,state),feet=[0,0,shot.o[2]];
  assert.equal(C.rifleJawRegion(id,state,shot.hc.slice(1),shot.o,shot.d),false,'separate cell beyond original core');
  assert.equal(C.rifleHeadContact(id,state,shot,feet,40,4),false);
  for(const flag of[undefined,false,null,0,1,'true'])assert.equal(C.rifleHeadContact(id,state,shot,feet,40,4,false,{allowJawFrontSide:flag}),false);
  assert.equal(C.rifleHeadContact(id,state,shot,feet,40,4,false,{allowFront:false,allowRear:false,allowJawFrontSide:true}),true);
  assert.equal(C.rifleHeadContact(id,{...state,c:true},shot,feet,40,4,false,{allowJawFrontSide:true}),false);
  const l=C.avatarLook(id),o=[0,+(1.57*l.tall).toFixed(2),-3],d=[0,0,1],entry=C.rifleJawEntry(id,state,o,d),core={t:'a',w:'rifle',o,d,hc:[1,0,o[1],+(o[2]+entry).toFixed(3)]};
  assert.equal(C.rifleJawRegion(id,state,core.hc.slice(1),o,d),true);
  assert.equal(C.rifleHeadContact(id,state,core,o,40,4,false,{allowJawFrontSide:false,allowFront:false,allowRear:false}),true,'old Jaw remains independent of new permission');
  assert.equal(C.rifleHeadContact(id,state,core,o,40,4,false,null,false),true,'old null-front/rearfalse form still preserves Jaw');
});

test('#959 immutable Jaw strip retains real room HP/hibernate/private history/death/replay and legacy fallback',async()=>{
  const C=await import('../src/config.js'),env=setup(),a=await connect(env,'Jaw shooter'),peers=[a],state={p:[0,0,0],r:0,h:'rifle'};
  const send=async(c,m)=>{now+=1000;c.send(m);await settle(env);},join=async()=>{const b=await connect(env,'Jaw target');peers.push(b);await send(b,state);return b;},att=b=>b.ws.peer.deserializeAttachment();
  const fire=async b=>{const s=jawStripShot(C,b.got[0].i);await send(a,{p:[s.o[0],0,s.o[2]],r:0,h:'rifle'});await send(a,s);return a.got.filter(m=>m.t==='hit').at(-1);};
  try{
    const b=await join();assert.equal(att(b).headPoseFixed,true);
    let hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(b.got.filter(m=>m.t==='hurt').at(-1).l,8);
    await send(b,{t:'g',to:a.got[0].i,k:0});await send(b,{...state,h:'saber',sp:true,score:17});env.PLAYERS.hibernate('world');
    hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,6);assert.equal(att(b).headPoseFixed,true);
    await send(a,{...jawStripShot(C,b.got[0].i),hc:undefined});assert.equal(a.got.filter(m=>m.t==='hit').at(-1).l,5,'legacy no-hc client gets body1');
    const low=att(b);low.l=1;b.ws.peer.serializeAttachment(low);hit=await fire(b);assert.equal(hit.dead,true);assert.equal(hit.head,true);assert.equal(hit.l,-1);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(att(b).l,10);assert.equal(att(b).headPoseFixed,true);
    const receipts=a.got.filter(m=>m.t==='hit').length;a.send(jawStripShot(C,b.got[0].i));await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,receipts,'same-tick replay cannot award/kill twice');
    for(const delta of[{p:[.01,0,0]},{r:.01},{c:true}]){const changed=await join();await send(changed,{...state,...delta});await send(changed,state);env.PLAYERS.hibernate('world');assert.equal(att(changed).headPoseFixed,false);assert.equal((await fire(changed)).head,undefined);assert.equal(att(changed).l,9);}
    const legacy=await join(),old=att(legacy);delete old.headPoseFixed;legacy.ws.peer.serializeAttachment(old);env.PLAYERS.hibernate('world');await send(legacy,state);assert.equal((await fire(legacy)).head,undefined);assert.equal(att(legacy).headPoseFixed,undefined);
    const observer=await connect(env,'Late viewer');peers.push(observer);for(const s of observer.got[0].ps)assert.equal(Object.hasOwn(s,'headPoseFixed'),false);
  }finally{for(const p of peers)p.ws.close();await settle(env);}
});

test('#962 first ordinary-turn Rear: normalized authority, history, lethal/replay and legacy independence',async()=>{
  const {avatarLook,PVP_RIFLE_HEAD:H,rifleSkullEntry,rifleHeadRearRegion}=await import('../src/config.js');
  const env=setup(),a=await connect(env,'First-turn shooter'),initial=await connect(env,'First-turn target');
  let b=initial;while(avatarLook(b.got[0].i).style===1){b.ws.close();await settle(env);b=await connect(env,'First-turn target');}const id=b.got[0].i;
  a.send({p:[0,0,-3],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const socket=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(ws=>ws.deserializeAttachment().i===id),attachment=()=>socket().deserializeAttachment();
  assert.deepEqual(attachment().rearFirstTurn,{p:[0,0,0],r:0,next:null});
  const shotFor=(r,seed=id)=>{const look=avatarLook(seed),w=[.93,1,1.08][look.build],state={p:[0,0,0],r},patch=look.style===3?H.rear.beanie:H.rear.lower;for(const dy of [patch.low+.001,(patch.low+patch.high)/2,patch.high-.001])for(const distance of [3,3.5,4]){
    const c=Math.cos(r),s=Math.sin(r),target=[.08*w*s,(H.headY+dy)*look.tall,.08*w*c],o=[+(target[0]+distance*s).toFixed(2),target[1],+(target[2]+distance*c).toFixed(2)].map(v=>+v.toFixed(2)),raw=target.map((v,i)=>v-o[i]),n=Math.hypot(...raw),d=raw.map(v=>+(v/n).toFixed(3)),unit=d.map(v=>v/Math.hypot(...d)),first=rifleSkullEntry(seed,state,o,d);if(first===null)continue;const hc=[1,...o.map((v,i)=>+(v+unit[i]*first).toFixed(3))];if(rifleHeadRearRegion(seed,state,hc.slice(1),o,d))return{t:'a',w:'rifle',to:seed,o,d,hc};
  }throw Error('no rounded Rear first-only history contact');};
  const shoot=async (r,seed=id)=>{const shot=shotFor(r,seed);a.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;a.send(shot);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  b.send({p:[0,0,0],r:.04,h:'rifle',rearFirstTurn:{p:[0,0,0],r:999},turned:false});await settle(env);now+=1000;
  assert.equal(attachment().turned,true);assert.equal(attachment().headPoseFixed,false);assert.deepEqual(attachment().rearFirstTurn,{p:[0,0,0],r:0,next:.04},'cleaned state cannot replace private anchor');
  b.send({t:'g',to:a.got[0].i,k:999});await settle(env);assert.equal(attachment().gt,undefined,'invalid greeting does not create authority');
  b.send({t:'g',to:a.got[0].i,k:0});await settle(env);const acceptedGt=attachment().gt;assert.equal(typeof acceptedGt,'number');
  b.send({t:'g',to:a.got[0].i,k:1});await settle(env);assert.equal(attachment().gt,acceptedGt,'rate-rejected repeat cannot alter accepted private greeting');
  const current=shotFor(.04),C=await import('../src/config.js');
  assert.equal(C.rifleHeadContact(id,{p:[0,0,0],r:.04},current,current.o,COMBAT.weapons.rifle.range,COMBAT.from,false,{allowFront:false,allowRear:false,allowGreetingFirstTurnRear:false}),false,'named permission defaults false');
  assert.equal(C.rifleHeadContact(id,{p:[0,0,0],r:.04},current,current.o,COMBAT.weapons.rifle.range,COMBAT.from,false,{allowFront:false,allowRear:false,allowGreetingFirstTurnRear:true}),true,'separate permission uses unchanged region');
  let hit=await shoot(.04);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(hit.award.points,5);
  assert.equal(attachment().headPoseFixed,false);assert.equal(attachment().turned,true);assert.deepEqual(attachment().rearFirstTurn,{p:[0,0,0],r:0,next:.04});
  env.PLAYERS.hibernate('world');b.send({p:[0,0,0],r:.04,h:'saber',score:99});await settle(env);assert.deepEqual(attachment().rearFirstTurn,{p:[0,0,0],r:0,next:.04});
  b.send({p:[0,0,0],r:.04,h:'rifle'});await settle(env);hit=await shoot(.04);assert.equal(hit.head,true);assert.equal(hit.l,6,'same first endpoint remains supported after hibernation');
  const low=attachment();low.l=1;socket().serializeAttachment(low);hit=await shoot(.04);assert.equal(hit.head,true);assert.equal(hit.dead,true);assert.equal(hit.l,-1);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(hit.award.seq,3);assert.equal(attachment().l,COMBAT.lives);assert.equal(attachment().gt,acceptedGt);
  const hitCount=a.got.filter(m=>m.t==='hit').length;a.send(shotFor(.04));await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,hitCount,'same-tick replay adds no lethal award');
  const late=await connect(env,'Late observer'),published=late.got[0].ps.find(p=>p.i===id);assert.equal(published.rearFirstTurn,undefined);assert.equal(published.turned,undefined);
  b.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(env);assert.equal(attachment().rearFirstTurn,false);
  b.send({p:[0,0,0],r:.04,h:'rifle'});await settle(env);hit=await shoot(.04);assert.equal(hit.head,undefined);assert.equal(hit.l,9,'returning from larger turn never restores first-only history');
  b.ws.close();await settle(env);let fresh=await connect(env,'Fresh history');while(avatarLook(fresh.got[0].i).style===1){fresh.ws.close();await settle(env);fresh=await connect(env,'Fresh history');}const fid=fresh.got[0].i;fresh.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(env);
  const getFresh=()=>[...env.PLAYERS.object('world').ctx.getWebSockets()].find(ws=>ws.deserializeAttachment().i===fid);
  fresh.send({t:'g',to:a.got[0].i,k:0});await settle(env);assert.equal(typeof getFresh().deserializeAttachment().gt,'number');
  assert.deepEqual(getFresh().deserializeAttachment().rearFirstTurn,{p:[0,0,0],r:3.14,next:null});fresh.send({p:[0,0,0],r:3.18,h:'rifle'});await settle(env);assert.ok(getFresh().deserializeAttachment().rearFirstTurn);
  // Legacy unknown history is not reconstructed from current position or a later good heading.
  for(const history of [undefined,null,true,{p:[0,0],r:3.14}]){let old=getFresh().deserializeAttachment();if(history===undefined)delete old.rearFirstTurn;else old.rearFirstTurn=history;getFresh().serializeAttachment(old);fresh.send({p:[0,0,0],r:3.18,h:'rifle'});await settle(env);assert.ok(!getFresh().deserializeAttachment().rearFirstTurn,'unknown/malformed legacy is not reconstructed');assert.equal((await shoot(3.18,fid)).head,undefined,'supported ray on unknown/null/malformed history remains body-only');}
  for(const delta of [{p:[.01,0,0]},{c:true},{r:.03}]){
    const sender=await connect(env,'Independent changed shooter');let changed=await connect(env,'Changed combo');while(avatarLook(changed.got[0].i).style===1){changed.ws.close();await settle(env);changed=await connect(env,'Changed combo');}const cid=changed.got[0].i,base={p:[0,0,0],r:0,h:'rifle'};
    changed.send(base);await settle(env);changed.send({t:'g',to:sender.got[0].i,k:0});await settle(env);changed.send({...base,r:.04,h:'saber'});await settle(env);changed.send({...base,r:.04,...delta});await settle(env);changed.send({...base,r:.04});await settle(env);
    const sock=[...env.PLAYERS.object('world').ctx.getWebSockets()].find(w=>w.deserializeAttachment().i===cid);assert.equal(sock.deserializeAttachment().rearFirstTurn,false,'moving/crouching/escape cannot restore after return');
    const shot=shotFor(.04,cid);shot.allowGreetingFirstTurnRear=true;sender.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;sender.send(shot);await settle(env);const body=sender.got.filter(m=>m.t==='hit').at(-1);assert.equal(body.head,undefined,'client named permission cannot override invalid private anchor');assert.equal(body.l,9);changed.ws.close();sender.ws.close();await settle(env);
  }
  const independentShot=async(r,tid)=>{const sender=await connect(env,'Independent boundary shooter'),shot=shotFor(r,tid);sender.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;sender.send(shot);await settle(env);const hits=sender.got.filter(m=>m.t==='hit');assert.equal(hits.length,1,'one actual receipt, not a stale prior capped award');assert.equal(hits[0].to,tid);sender.ws.close();await settle(env);return hits[0];};
  for (const anchor of [0,.8,3.14,-3.14]) for (const sign of [-1,1]) {
    let target=await connect(env,'Exact first endpoint');while(avatarLook(target.got[0].i).style===1){target.ws.close();await settle(env);target=await connect(env,'Exact first endpoint');}
    const tid=target.got[0].i,r=Math.round((anchor+sign*.04)*100)/100,base={p:[0,0,0],r:anchor,h:'rifle'};
    target.send(base);await settle(env);target.send({...base,r});await settle(env);target.send({t:'g',to:a.got[0].i,k:0});await settle(env);
    assert.equal((await independentShot(r,tid)).head,true,'both exact serialized signs and unwrapped headings retain head2');target.ws.close();await settle(env);
  }
  for (const sign of [-1,1]) {
    let target=await connect(env,'Wrapped representation');while(avatarLook(target.got[0].i).style===1){target.ws.close();await settle(env);target=await connect(env,'Wrapped representation');}
    const tid=target.got[0].i,base={p:[0,0,0],r:sign*3.14,h:'rifle'},alias=-sign*3.10;
    target.send(base);await settle(env);target.send({...base,r:alias});await settle(env);target.send({t:'g',to:a.got[0].i,k:0});await settle(env);
    const aliasHit=await independentShot(alias,tid);assert.equal(aliasHit.head,undefined,'rounded pi alias exceeds exact studied .04; remains body1');
    target.send({...base,r:sign*3.18});await settle(env);assert.equal((await independentShot(sign*3.18,tid)).head,undefined,'return to exact endpoint cannot repair a rejected alias');
    target.ws.close();await settle(env);
  }
  { let target=await connect(env,'Near maximum first turn');while(avatarLook(target.got[0].i).style===1){target.ws.close();await settle(env);target=await connect(env,'Near maximum first turn');}
    const tid=target.got[0].i,base={p:[4990,0,4990],r:0,h:'rifle'};target.send(base);await settle(env);target.send({...base,r:.04});await settle(env);target.send({t:'g',to:a.got[0].i,k:0});await settle(env);
    const sender=await connect(env,'Near maximum shooter'),shot=shotFor(.04,tid);shot.o=shot.o.map((v,i)=>i===1?v:+(v+4990).toFixed(2));shot.hc=shot.hc.map((v,i)=>i===1||i===3?+(v+4990).toFixed(3):v);
    assert.ok(Buffer.byteLength(JSON.stringify(shot))<=256);sender.send({p:[shot.o[0],0,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;sender.send(shot);await settle(env);const hits=sender.got.filter(m=>m.t==='hit');assert.equal(hits.length,1);assert.equal(hits[0].to,tid);assert.equal(hits[0].head,true,'actual normalized room accepts near-maximum translated exact endpoint');sender.ws.close();target.ws.close();await settle(env);
  }
  for (const value of [undefined,null,false,0,1,'true',{}]) assert.equal(C.rifleHeadContact(id,{p:[0,0,0],r:.04},current,current.o,40,4,false,{allowFront:false,allowRear:false,allowGreetingFirstTurnRear:value}),false,'only literal true selects the independent leaf');
  for(const peer of [a,fresh,late])peer.ws.close();await settle(env);
});

test('#967 first RIGHT turn is private, accepted-only, single-use and permanent through hibernation', async () => {
  const env=setup(), peers=[], join=async()=>{const c=await connect(env);peers.push(c);return c;};
  const att=c=>c.ws.peer.deserializeAttachment(), send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
  const state={p:[1.234,0,3.456],r:.804,h:'rifle'};
  try {
    for(const [anchor,next] of [[.8,.7],[0,-.1],[-3.14,3.04],[.8,6.98]]) {
      const c=await join();assert.equal(att(c).rightFirstTurn,null);await send(c,{...state,r:anchor});
      assert.deepEqual(att(c).rightFirstTurn,{p:[1.23,0,3.46],r:anchor,next:null});
      await send(c,{...state,r:'bad'});assert.equal(att(c).rightFirstTurn.next,null);
      await send(c,{...state,r:next,h:'saber',sp:true,score:7});
      assert.deepEqual(att(c).rightFirstTurn,{p:[1.23,0,3.46],r:anchor,next});
      env.PLAYERS.hibernate('world');await send(c,{...state,r:next});assert.equal(att(c).rightFirstTurn.next,next);
      await send(c,{...state,r:anchor});await send(c,{...state,r:next});assert.equal(att(c).rightFirstTurn,false,'return cannot restore consumed first turn');
    }
    for(const first of [.79,.71,.69,.9]) {
      const c=await join();await send(c,state);await send(c,{...state,r:first});await send(c,{...state,r:.7});
      assert.equal(att(c).rightFirstTurn,false,'an earlier different turn permanently invalidates');
    }
    for(const change of [{p:[1.24,0,3.46]},{c:true}]) {
      const c=await join();await send(c,state);await send(c,{...state,r:.7});await send(c,{...state,r:.7,...change});await send(c,{...state,r:.7});assert.equal(att(c).rightFirstTurn,false);
    }
    const crouched=await join();await send(crouched,{...state,c:true});await send(crouched,state);assert.equal(att(crouched).rightFirstTurn,false);
    for(const bad of [undefined,null,true,{}, {p:[1.23,0,3.46],r:.8,next:.8},{p:[1.234,0,3.46],r:.8,next:.7},{p:[1.23,0,3.46],r:.8,next:.705}]) {
      const c=await join();await send(c,state);const raw=att(c);if(bad===undefined)delete raw.rightFirstTurn;else raw.rightFirstTurn=bad;c.ws.peer.serializeAttachment(raw);
      env.PLAYERS.hibernate('world');await send(c,{...state,r:.7});assert.equal(att(c).rightFirstTurn,false,'missing/null/malformed established history never initializes');
    }
    const limited=await join();await send(limited,state);
    for(let i=1;i<PLAYERS.perSecond;i++)limited.send({...state,r:.8});
    limited.send({...state,r:.9});await settle(env);assert.equal(att(limited).rightFirstTurn.next,null,'rate-rejected heading cannot consume first turn');
    await send(limited,{...state,r:.7});assert.equal(att(limited).rightFirstTurn.next,.7);
    const late=await join();assert.ok(late.got[0].ps.every(s=>!Object.hasOwn(s,'rightFirstTurn')),'private history stays out of welcome');
  } finally { for(const c of peers)c.ws.close();await settle(env); }
});


test('#967 source-derived style0 whole-cell admission preserves old regions and defaults closed', async () => {
  const C=await import('../src/config.js'), state={p:[0,0,0],r:0};
  // Actual native nearest-Skull wire from the source-bound all30 geometry/wire feasibility run.
  const shot={"t": "a", "w": "rifle", "o": [1.6, 1.63, -0.04], "d": [-1, 0, 0], "hc": [1, 0.096, 1.63, -0.04]};
  const options={allowFront:false,allowRear:false};
  assert.equal(C.rifleHeadGreetingRightRegion('front-78',state,shot.hc.slice(1),shot.o,shot.d),true);
  assert.equal(C.rifleHeadGreetingRightCellRegion('front-78',state,shot.hc.slice(1),shot.o,shot.d),true);
  assert.equal(C.rifleHeadContact('front-78',state,shot,shot.o,40,4,false,options),false);
  assert.equal(C.rifleHeadContact('front-78',state,shot,shot.o,40,4,false,{...options,allowGreetingRightFirstTurn:true}),true);
  assert.equal(C.rifleHeadContact('front-78',state,shot,shot.o,40,4,false,{...options,allowGreetingRight:true}),true);
  // Exact #957 falsifier: supported center, but unsafe rounded corner in long-hair style1.
  const unsafe={t:'a',w:'rifle',o:[3.12,1.67,-2.68],d:[-.765,0,.644],hc:[1,.046,1.67,-.092]}, changed={p:[0,0,0],r:.7};
  assert.equal(C.rifleHeadGreetingRightRegion('front-0',changed,unsafe.hc.slice(1),unsafe.o,unsafe.d),true);
  assert.equal(C.rifleHeadContact('front-0',changed,unsafe,unsafe.o,40,4,false,{...options,allowGreetingRight:true}),true);
  assert.equal(C.rifleHeadContact('front-0',changed,unsafe,unsafe.o,40,4,false,{...options,allowGreetingRightFirstTurn:true}),false);
  // Actual native5 fresh style0 target: valid first turn, nearest Skull, old leaf true, body1 receipt.
  const outside={t:'a',w:'rifle',o:[3.11,1.72,-2.67],d:[-.765,-.002,.643],hc:[1,.051,1.712,-.099]};
  assert.equal(C.avatarLook('e6a4612d').style,0);
  assert.equal(C.rifleHeadGreetingRightRegion('e6a4612d',changed,outside.hc.slice(1),outside.o,outside.d),true);
  assert.equal(C.rifleHeadContact('e6a4612d',changed,outside,outside.o,40,4,false,{...options,allowGreetingRightFirstTurn:true}),false);
  // The actual r3 ray must remain in the prism independently of the cell-corner rays.
  assert.equal(C.rifleHeadGreetingRightCellRegion('front-78',state,shot.hc.slice(1),shot.o,[-1,.01,0]),false);
});


test('#971 immutable Nose prism uses existing private history; changed/legacy return, healing and death never reopen it',async()=>{
  const C=await import('../src/config.js'),env=setup(),a=await connect(env,'Nose prism shooter'),peers=[a],state={p:[0,0,0],r:0,h:'rifle'};
  const send=async(c,m)=>{now+=1000;c.send(m);await settle(env);};
  const join=async()=>{const b=await connectLook(env,'Nose prism target',l=>l.build===1&&l.tall===.975);const l=C.avatarLook(b.got[0].i);assert.ok(l.build===1&&l.tall===.975,'canonical build1/tall.975 target');peers.push(b);return b;};
  const attachment=b=>b.ws.peer.deserializeAttachment();
  // Actual native saved FIRST Nose contact, all four styles share identical original Nose geometry at build1/tall.975.
  const shotFor=id=>({t:'a',w:'rifle',to:id,o:[-.01,1.58,-3.13],d:[.001,0,1],hc:[1,-.007,1.58,-.129]});

  const fire=async b=>{const s=shotFor(b.got[0].i);await send(a,{p:[s.o[0],0,s.o[2]],r:0,h:'rifle'});await send(a,s);return a.got.filter(m=>m.t==='hit').at(-1);};
  try{
    const b=await join();await send(b,state);await send(b,{t:'g',to:a.got[0].i,k:0});assert.equal(attachment(b).headPoseFixed,true);assert.ok(attachment(b).gt);
    const shot=shotFor(b.got[0].i);assert.equal(C.rifleHeadContact(b.got[0].i,state,shot,shot.o,40,4),false,'legacy default cannot enable new Nose family');assert.equal(C.rifleNoseRegion(b.got[0].i,state,shot.hc.slice(1))||C.rifleNoseExtraRegion(b.got[0].i,state,shot.hc.slice(1))||C.rifleNoseBandRegion(b.got[0].i,state,shot.hc.slice(1))||C.rifleNoseDepthRegion(b.got[0].i,state,shot.hc.slice(1)),false,'outside every published Nose family');
    for(const options of [undefined,null,true,false,{}, {allowImmutableNoseSide:false}, {allowImmutableNoseSide:1}, {allowImmutableNoseSide:'true'}])assert.equal(C.rifleHeadContact(b.got[0].i,state,shot,shot.o,40,4,true,options),false,'only strict named true enables new depth family');
    let hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,8);
    env.PLAYERS.hibernate('world');await send(b,{...state,h:'saber',score:17,sp:true});hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,6);
    const low=attachment(b);low.l=1;b.ws.peer.serializeAttachment(low);hit=await fire(b);assert.equal(hit.head,true);assert.equal(hit.l,-1);assert.equal(hit.dead,true);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(attachment(b).headPoseFixed,true,'death does not manufacture or clear immutable pose');
    const count=a.got.filter(m=>m.t==='hit').length;a.send(shotFor(b.got[0].i));await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,count,'same-tick replay has no duplicate death/award');
    for(const delta of[{p:[.01,0,0]},{r:.01},{c:true}]){
      const changed=await join();await send(changed,state);await send(changed,{t:'g',to:a.got[0].i,k:0});await send(changed,{...state,...delta});await send(changed,state);assert.equal(attachment(changed).headPoseFixed,false);
      env.PLAYERS.hibernate('world');hit=await fire(changed);assert.equal(hit.head,undefined);assert.equal(hit.l,9,'accepted p/r/c change and return keeps verified Nose prism body1');
      now=attachment(changed).healAt;a.send('p');changed.send('p');await settle(env);await env.PLAYERS.object('world').alarm();await settle(env);assert.equal(attachment(changed).headPoseFixed,false,'healing does not reconstruct history');assert.equal(attachment(changed).l,10);
      let low=attachment(changed);low.l=1;changed.ws.peer.serializeAttachment(low);hit=await fire(changed);assert.equal(hit.head,undefined);assert.equal(hit.dead,true);assert.equal(hit.l,0);assert.equal(attachment(changed).headPoseFixed,false,'death cannot reopen changed history');
    }
    for(const history of[undefined,null,false,1,'true']){const legacy=await join();await send(legacy,state);await send(legacy,{t:'g',to:a.got[0].i,k:0});const raw=attachment(legacy);if(history===undefined)delete raw.headPoseFixed;else raw.headPoseFixed=history;legacy.ws.peer.serializeAttachment(raw);env.PLAYERS.hibernate('world');await send(legacy,state);assert.notEqual(attachment(legacy).headPoseFixed,true);assert.equal((await fire(legacy)).head,undefined,'unknown/malformed legacy flag remains body1');}
    const fresh=await join();await send(fresh,state);await send(fresh,{t:'g',to:a.got[0].i,k:0});assert.equal((await fire(fresh)).head,true,'genuine new socket establishes its own immutable history');
    const observer=await connect(env,'Late');peers.push(observer);for(const s of observer.got[0].ps)assert.equal(Object.hasOwn(s,'headPoseFixed'),false);
  }finally{for(const p of peers)p.ws.close();await settle(env);}
});

// #968: native style2 wire, same prism and private option as967; no sibling permission change.
test('#968 style2 reuses the certified RIGHT cell while long hair stays denied',async()=>{
  const C=await import('../src/config.js'),s={p:[0,0,0],r:0},o={allowFront:false,allowRear:false};
  const shot={t:'a',w:'rifle',o:[1.6,1.59,-.04],d:[-1,0,0],hc:[1,.096,1.59,-.04]};
  assert.equal(C.avatarLook('front-1').style,2);
  assert.equal(C.rifleHeadGreetingRightCellRegion('front-1',s,shot.hc.slice(1),shot.o,shot.d),true);
  assert.equal(C.rifleHeadContact('front-1',s,shot,shot.o,40,4,false,o),false);
  assert.equal(C.rifleHeadContact('front-1',s,shot,shot.o,40,4,false,{...o,allowGreetingRightFirstTurn:true}),true);
  assert.equal(C.rifleHeadContact('front-1',s,shot,shot.o,40,4,false,{...o,allowGreetingRight:true}),true);
  for(const value of[null,false,1,'true',{}])assert.equal(C.rifleHeadContact('front-1',s,shot,shot.o,40,4,false,{...o,allowGreetingRightFirstTurn:value}),false);
  const bad={o:[3.12,1.67,-2.68],d:[-.765,0,.644],hc:[1,.046,1.67,-.092]};
  assert.equal(C.rifleHeadGreetingRightCellRegion('front-0',{p:[0,0,0],r:.7},bad.hc.slice(1),bad.o,bad.d),false,'historical actual unsupported style1 corner remains excluded');
});

test('#890 avatar appearance sync in state, welcome and validation', async () => {
  const env = setup();
  const a = await connect(env, 'Spelare A');
  const b = await connect(env, 'Spelare B');
  const validAv = '1230410';
  now += 1000;
  a.send({ p: [1, 0, 2], r: 0.5, av: validAv });
  await settle(env);

  const bStates = b.got.filter(m => m.t === 's' && m.i === a.got[0].i);
  assert.equal(bStates.length, 1);
  assert.equal(bStates[0].av, validAv, 'valid avatar string is forwarded to peer');

  // Invalid avatar code should be dropped
  now += 1000;
  a.send({ p: [1.1, 0, 2], r: 0.5, av: 'invalid-code' });
  await settle(env);
  const bState2 = b.got.filter(m => m.t === 's' && m.i === a.got[0].i).at(-1);
  assert.equal(bState2.av, undefined, 'invalid avatar string is dropped');

  // 9-digit extended avatar string is valid and forwarded
  const validAv9 = '123041013';
  now += 1000;
  a.send({ p: [1.2, 0, 2], r: 0.5, av: validAv9 });
  await settle(env);
  const bState3 = b.got.filter(m => m.t === 's' && m.i === a.got[0].i).at(-1);
  assert.equal(bState3.av, validAv9, 'valid 9-digit avatar string is forwarded to peer');

  // #1136: 12 digits = 9 + a height in cm within AVATAR_HEIGHT; out of range or malformed heights are dropped
  for (const [av, ok] of [['123041013120', true], ['123041013200', true], ['123041013099', false], ['123041013201', false], ['1230410131', false], ['1230410131650', false]]) {
    now += 1000;
    a.send({ p: [1.3, 0, 2], r: 0.5, av });
    await settle(env);
    const last = b.got.filter(m => m.t === 's' && m.i === a.got[0].i).at(-1);
    assert.equal(last.av, ok ? av : undefined, `height code ${av}`);
  }
  const validAv12 = '123041013165';
  await settle(env);
  // #1138: the face extension travels as ax beside the digits (nine, or twelve with #1136's height); it is dropped when malformed or without a valid av
  now += 1000;
  a.send({ p: [1.3, 0, 2], r: 0.5, av: validAv9, ax: 'c3e6w2h120' });
  await settle(env);
  const bState4 = b.got.filter(m => m.t === 's' && m.i === a.got[0].i).at(-1);
  assert.equal(bState4.av, validAv9, 'nine digits stay unchanged for older clients');
  assert.equal(bState4.ax, 'c3e6w2h120', 'a well-formed extension (unknown tags included) is forwarded');
  // #1165: hair length (h) and glasses (g) are ordinary tagged fields: forwarded with their digits, never needing a Worker change
  now += 1000;
  a.send({ p: [1.4, 0, 2], r: 0.5, av: validAv9, ax: 'e7h1g2' });
  await settle(env);
  assert.equal(b.got.filter(m => m.t === 's' && m.i === a.got[0].i).at(-1).ax, 'e7h1g2', 'hair length and glasses tags are forwarded');
  for (const bad of ['C3', 'c', 'c1234', 'x'.repeat(10), 'c1'.repeat(25), 7, { c: 1 }]) {
    now += 1000;
    a.send({ p: [1.3 + Math.random(), 0, 2], r: 0.5, av: validAv9, ax: bad });
    await settle(env);
    assert.equal(b.got.filter(m => m.t === 's' && m.i === a.got[0].i).at(-1).ax, undefined, `bad extension ${JSON.stringify(bad)} is dropped`);
  }
  now += 1000;
  a.send({ p: [1.4, 0, 2], r: 0.5, av: 'bad', ax: 'c3' });
  await settle(env);
  assert.equal(b.got.filter(m => m.t === 's' && m.i === a.got[0].i).at(-1).ax, undefined, 'no extension without a valid av');
  now += 1000;
  a.send({ p: [1.5, 0, 2], r: 0.5, av: validAv9, ax: 'c3e6' });
  await settle(env);
  now += 1000;
  a.send({ p: [1.2, 0, 2], r: 0.5, av: validAv12, ax: 'c3e6' });
  await settle(env);

  // Late joining peer gets the latest valid appearance in welcome
  const c = await connect(env, 'Spelare C');
  const welcomePeer = c.got[0].ps.find(p => p.i === a.got[0].i);
  assert.equal(welcomePeer?.av, validAv12, 'late joining player gets avatar appearance (with height) on welcome');
  assert.equal(welcomePeer?.ax, 'c3e6', 'and its face extension');

  for (const peer of [a, b, c]) peer.ws.close();
  await settle(env);
});


test('#1147 carried cat appearance is bounded, forwarded, welcomed and cleared', async () => {
  const { cleanState } = await import('./players.js');
  const state = cat => ({ p: [1, 0, 2], r: 0, cat });
  for (const cat of [null, true, {}, [0, 0], [0, 0, false, 1], [-1, 0, false], [8, 0, false], [0, 6, false], [1, 1, false], [.5, 0, false], [0, -1, false], [0, 0, 1], [7, 0, true]]) {
    assert.equal(cleanState(JSON.stringify(state(cat))).cat, undefined, JSON.stringify(cat));
  }
  for (const cat of [[0, 5, false], [3, 2, true], [7, 0, false]]) assert.deepEqual(cleanState(JSON.stringify(state(cat))).cat, cat);
  const env = setup(), a = await connect(env), b = await connect(env);
  a.send(state([3, 2, true])); await settle(env);
  assert.deepEqual(b.states().at(-1).cat, [3, 2, true]);
  const c = await connect(env);
  assert.deepEqual(c.got[0].ps.find(p => p.i === a.got[0].i).cat, [3, 2, true]);
  now += 250; a.send({ p: [1, 0, 2], r: 0 }); await settle(env);
  assert.equal(b.states().at(-1).cat, undefined);
  const d = await connect(env);
  assert.equal(d.got[0].ps.find(p => p.i === a.got[0].i).cat, undefined);
});

// #1150: the existing bounded movement contract carries only two extra pose enums.
test('rest posture forwards to observers and late joins, omission and malformed pose clear it', async () => {
  const env = setup(), a = await connect(env, 'Resting'), b = await connect(env, 'Observer');
  for (const pose of [1, 2, undefined, true, '2', -1, 3, { kind: 2 }]) {
    now += 250; a.send({ p: [2, -.35, 3], r: 1.57, pose }); await settle(env);
    const state = b.states().at(-1);
    assert.equal(state.pose, pose === 1 || pose === 2 ? pose : undefined);
    assert.deepEqual(state.p, [2, -.35, 3]);
    if (pose === 2) { const late = await connect(env, 'Late'); assert.equal(late.got[0].ps.find(p => p.n === 'Resting').pose, 2); late.ws.close(); await settle(env); }
  }
  a.ws.close(); b.ws.close(); await settle(env);
});

test('#1150 authoritative head contact follows seated and lying torso frames', async () => {
  const env=setup(), a=await connect(env,'Shooter'), b=await connect(env,'Resting target');
  const look=avatarLook(b.got[0].i), width=[.93,1,1.08][look.build];
  for (const pose of [1,2]) {
    const lean=pose===1?.1:Math.PI/2, hip=pose===1?.525:.9;
    const y=(hip+Math.cos(lean)*.76)*look.tall, z=-( (pose===1?.07:0)-Math.sin(lean)*.76)*width;
    now+=1000;a.send({p:[2,y-1.6,z],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle',pose});await settle(env);
    now+=250;a.send({t:'a',w:'rifle',o:[2,y,z],d:[-1,0,0],to:b.got[0].i,hc:[2,0,0,0]});await settle(env);
    assert.equal(a.got.filter(m=>m.t==='hit').at(-1)?.head,true,`pose ${pose} head hit recomputed by room`);
  }
  a.ws.close();b.ws.close();await settle(env);
});

test('#1175 actual wire build is forwarded and controls ordinary authoritative head width', async () => {
  const C=await import('../src/config.js'),env=setup(),a=await connect(env,'Shooter'),b=await connect(env,'Target');
  for(const build of [0,2]) {
    const wire=C.splitAvatarCode(C.encodeAvatarWireLook({...C.avatarLook('canonical-build'),build,tall:1}));
    now+=1000;a.send({p:[.105,.04,3],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle',...wire});await settle(env);
    assert.equal(a.states().at(-1).ax,wire.ax);
    const late=await connect(env,'Late');assert.equal(late.got[0].ps.find(p=>p.i===b.got[0].i).ax,wire.ax);late.ws.close();await settle(env);
    now+=250;a.send({t:'a',w:'rifle',o:[.105,1.64,3],d:[0,0,-1],to:b.got[0].i,hc:[2,0,0,0]});await settle(env);
    assert.equal(!!a.got.filter(m=>m.t==='hit').at(-1)?.head,build===2,`wire build ${build} determines bounded side ray`);
  }
  a.ws.close();b.ws.close();await settle(env);
});

test('#1156 Olof\'s top colour (TOPS 10) passes the room as the digit fallback plus the u extension', async () => {
  const { cleanState, cleanAvatar } = await import('./players.js');
  const { TOPS, encodeAvatarLook, splitAvatarCode, decodeAvatarLook } = await import('../src/config.js');
  const look = decodeAvatarLook('123041013', 'olof-test');
  look.top = TOPS[10];
  const { av, ax } = splitAvatarCode(encodeAvatarLook(look));
  assert.equal(av, '113041013', 'the digit keeps the nearest old colour (red) for older clients');
  assert.equal(ax, 'u10');
  assert.equal(cleanAvatar(av), av);
  const s = cleanState(JSON.stringify({ p: [1, 0, 2], r: 0, av, ax }));
  assert.deepEqual([s.av, s.ax], [av, ax], 'the room forwards both');
  assert.equal(decodeAvatarLook(s.av + s.ax, 'peer').top, TOPS[10], 'a new client decodes Olof\'s colour');
  assert.equal(decodeAvatarLook(s.av, 'peer').top, TOPS[1], 'an old client (digits only) shows red');
});
