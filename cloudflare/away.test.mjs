// #2216: away presence. A player who hides the tab closes the socket with AWAY.code; the room keeps their last state for the
// others as away (aw: 1) for AWAY.ms, then sends the leave; back within the time with the same tab token = the same id, no
// leave, no join, no duplicate. The pure timeline (src/awaypresence.js) and the real Worker + PlayerRoom (devws.mjs).
//   node --test cloudflare/away.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { CLOSE } from './players.js';
import { AwayRoster, cleanAwayToken, newAwayToken, awayState } from '../src/awaypresence.js';
import { AWAY } from '../src/config.js';
import { JoinNotice } from '../src/joinnotice.js';

installRuntime();
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
const TOK_A = 'annatoken000001', TOK_B = 'bertiltoken0001';

test('the timeline: away, taken back within the time, due after it; tokens are checked', () => {
  const r = new AwayRoster([], 1000, 2);
  assert.deepEqual(r.add({ i: 'a', n: 'Anna', s: { p: [1, 0, 2], r: 0, h: 'rifle', dn: 1 }, l: 7 }, TOK_A, 0), []);
  assert.deepEqual(r.rows(10), [{ i: 'a', n: 'Anna', p: [1, 0, 2], r: 0, l: 7, aw: 1 }], 'shown unarmed, not dancing, never with the token');
  assert.equal(r.next(), 1000);
  assert.equal(r.take('someoneelse0001', 500), null, 'another token takes nothing');
  assert.equal(r.take(TOK_A, 999).i, 'a', 'back within the time: the same entry');
  assert.equal(r.size, 0);
  r.add({ i: 'a', n: 'Anna', s: { p: [0, 0, 0], r: 0 } }, TOK_A, 0);
  assert.deepEqual(r.due(999), []);
  assert.equal(r.take(TOK_A, 1000), null, 'not after the time');
  assert.deepEqual(r.due(1000).map((e) => e.i), ['a']);
  assert.equal(r.next(), null);
  // a duplicated tab (same token) going away under a new id pushes the older entry out; so does max
  r.add({ i: 'a', s: {} }, TOK_A, 0);
  assert.deepEqual(r.add({ i: 'a2', s: {} }, TOK_A, 10).map((e) => e.i), ['a']);
  r.add({ i: 'b', s: {} }, TOK_B, 20);
  assert.deepEqual(r.add({ i: 'c', s: {} }, 'ceciliatoken001', 30).map((e) => e.i), ['a2']);
  assert.equal(cleanAwayToken('short'), ''); assert.equal(cleanAwayToken('ABCdefghijklmn'), ''); assert.equal(cleanAwayToken(TOK_A), TOK_A);
  assert.equal(cleanAwayToken(newAwayToken()).length, 20);
  assert.deepEqual(awayState({ p: [0, 0, 0], jp: 2, cq: [1, 0, 1] }), { p: [0, 0, 0], jp: 1 });
  assert.deepEqual(new AwayRoster([{ i: 'x', tok: 'bad', until: 5 }, { i: 'y', tok: TOK_B, until: 5 }]).list.map((e) => e.i), ['y'], 'bad saved rows are dropped');
});

test('JoinNotice: a leave after the away time is announced at once (grace 0)', () => {
  let t = 0; const out = []; const n = new JoinNotice((x) => out.push(x), () => t);
  n.left('Anna', '', 0); t += 1; n.tick(); t += 2000; n.tick();
  assert.deepEqual(out, ['Anna lämnade spelet']);
});

let getNow, setNow;
async function room() {
  const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
  const connect = async (name, tok) => {
    const q = new URLSearchParams({ n: name, ...(tok ? { a: tok } : {}) });
    const r = await worker.fetch(new Request(`https://w/players?${q}`, { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
    const c = { ws: r.webSocket, got: [] };
    c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
    c.send = (m) => c.ws.send(JSON.stringify(m));
    await settle(env);
    c.id = c.got.find((m) => m.t === 'w')?.i;
    return c;
  };
  // the others stay active (the room closes a socket silent for PLAYERS.idleMs): a small state every 20 s of clock
  const pass = async (ms, ...live) => { for (let left = ms; left > 0; left -= 20_000) { const step = Math.min(20_000, left); setNow(getNow() + step); for (const c of live) c.send({ p: [0, 0, live.indexOf(c) + 9], r: (getNow() / 1000) % 3, score: 0 }); await settle(env); } };
  return { env, connect, pass, alarm: async () => { await env.PLAYERS.ctx('world').fireAlarm(); await settle(env); } };
}

test('hide → away for the others (also for a newcomer) → left after the time, announced at once', async () => {
  const realNow = Date.now; let now = Date.UTC(2026, 10, 20, 12); Date.now = () => now; getNow = () => now; setNow = (v) => { now = v; };
  try {
    const { env, connect, pass, alarm } = await room();
    const a = await connect('Anna', TOK_A), b = await connect('Bertil', TOK_B);
    a.send({ p: [3, 0, 4], r: 1, score: 0, h: 'nerf' }); await settle(env);
    b.got.length = 0;
    a.ws.close(CLOSE.away, 'away'); await settle(env);
    const away = b.got.filter((m) => m.i === a.id);
    assert.deepEqual(away.map((m) => m.t), ['s'], 'no leave yet, one away state');
    assert.equal(away[0].aw, 1); assert.deepEqual(away[0].p, [3, 0, 4]); assert.equal(away[0].h, undefined, 'unarmed while away');
    assert.equal(JSON.stringify(b.got).includes(TOK_A), false, 'the token is never relayed');
    assert.equal(await env.PLAYERS.ctx('world').storage.getAlarm(), now + AWAY.ms, 'the alarm is set for the leave');
    await pass(30_000, b);
    const c = await connect('Cia');
    const row = c.got.find((m) => m.t === 'w').ps.find((p) => p.i === a.id);
    assert.equal(row?.aw, 1, 'a newcomer sees the away player too'); assert.equal(row.n, 'Anna');
    // the room hibernates meanwhile: the away list is in storage
    env.PLAYERS.hibernate('world'); await settle(env);
    await pass(AWAY.ms - 30_000 - 1, b, c); await alarm();
    assert.equal(b.got.some((m) => m.t === 'x'), false, 'not before the time');
    now += 1; await alarm();
    assert.deepEqual(b.got.filter((m) => m.t === 'x'), [{ t: 'x', i: a.id, aw: 1 }]);
    assert.deepEqual(c.got.filter((m) => m.t === 'x'), [{ t: 'x', i: a.id, aw: 1 }]);
    const d = await connect('Dan');
    assert.equal(d.got.find((m) => m.t === 'w').ps.some((p) => p.i === a.id), false, 'gone for a later newcomer');
    for (const x of [b, c, d]) x.ws.close(1000);
    await settle(env);
  } finally { Date.now = realNow; }
});

test('back within the time: the same id, no leave, no join, no duplicate; away cleared at once', async () => {
  const realNow = Date.now; let now = Date.UTC(2026, 10, 20, 12); Date.now = () => now; getNow = () => now; setNow = (v) => { now = v; };
  try {
    const { env, connect, pass, alarm } = await room();
    const a = await connect('Anna', TOK_A), b = await connect('Bertil', TOK_B);
    a.send({ p: [3, 0, 4], r: 1, score: 0 }); await settle(env);
    a.ws.close(CLOSE.away, 'away'); await settle(env);
    await pass(AWAY.ms - 1000, b);
    b.got.length = 0;
    const a2 = await connect('Anna', TOK_A);
    assert.equal(a2.id, a.id, 'the same id again');
    assert.equal(a2.got.find((m) => m.t === 'w').ps.some((p) => p.i === a.id), false, 'not listed to itself');
    const seen = b.got.filter((m) => m.i === a.id);
    assert.deepEqual(seen.map((m) => m.t), ['s'], 'no join, no leave: only the state again');
    assert.equal(seen[0].aw, undefined, 'no longer away');
    assert.equal(b.got.some((m) => m.t === 'j' || m.t === 'x'), false);
    await pass(AWAY.ms * 2, a2, b); await alarm();
    assert.equal(b.got.some((m) => m.t === 'x' || m.t === 'j'), false, 'nothing later either');
    const ids = new Set(b.got.filter((m) => m.t === 's' || m.t === 'j').map((m) => m.i)); assert.deepEqual([...ids], [a.id], 'one figure for Anna');
    a2.ws.close(1000); b.ws.close(1000); await settle(env);
  } finally { Date.now = realNow; }
});

test('plain leaves stay plain: an old client (no token), a normal close, a different name in the same tab', async () => {
  const realNow = Date.now; let now = Date.UTC(2026, 10, 20, 12); Date.now = () => now; getNow = () => now; setNow = (v) => { now = v; };
  try {
    const { env, connect } = await room();
    const b = await connect('Bertil', TOK_B);
    const old = await connect('Olle'); old.send({ p: [1, 0, 1], r: 0, score: 0 }); await settle(env);
    old.ws.close(CLOSE.away); await settle(env);
    assert.deepEqual(b.got.filter((m) => m.i === old.id && m.t !== 's').map((m) => [m.t, m.aw]), [['j', undefined], ['x', undefined]], 'old client: an ordinary leave');
    const a = await connect('Anna', TOK_A); a.send({ p: [1, 0, 1], r: 0, score: 0 }); await settle(env);
    a.ws.close(1000); await settle(env);
    assert.equal(b.got.filter((m) => m.i === a.id && m.t === 'x').length, 1, 'a normal close leaves at once');
    const e = await connect('Eva', 'evatoken0000001'); e.send({ p: [1, 0, 1], r: 0, score: 0 }); await settle(env);
    e.ws.close(CLOSE.away); await settle(env);
    const f = await connect('Frida', 'evatoken0000001');
    assert.notEqual(f.id, e.id);
    assert.deepEqual(b.got.filter((m) => m.i === e.id && m.t === 'x'), [{ t: 'x', i: e.id, aw: 1 }], 'the old name leaves now');
    assert.ok(b.got.some((m) => m.t === 'j' && m.i === f.id), 'the new name joins');
    b.ws.close(1000); f.ws.close(1000); await settle(env);
  } finally { Date.now = realNow; }
});
