// The players' room (#666): connection, forwarding, the monthly cost cap, rate / size / player limits, idle close and
// the admin brake. Runs the real Worker + PlayerRoom on Node with the runtime stand-ins in devws.mjs.
//   node --test cloudflare/players.test.mjs
import { test } from 'node:test';
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
