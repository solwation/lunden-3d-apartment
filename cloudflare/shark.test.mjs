// #1769: the rare shark in Höje å: the weekly schedule (deterministic, about once a week, not at a fixed time), its path (in the channel,
// clear of the piers, at the surface), the room's arbitration (one shark per window, reach, landing spot), the phases (body → skeleton →
// gone) and the catch record surviving the Durable Object's hibernation (one small value in its own storage, nothing else).
//   node --test cloudflare/shark.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIVER_FISH as C, SHARK as S } from '../src/config.js';
import { riverProject, riverPoint, piers, fishTime } from '../src/riverfishswim.js';
import { sharkWindow, sharkNow, nextSharkWindow, sharkAt, sharkPhase, sharkUntil, cleanSharkRecord } from '../src/sharkswim.js';
import { RiverFishSync } from '../src/riverfishsync.js';
import { RoomRiverFish, cleanRiverFish } from './riverfish.js';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';

const WEEK = S.schedule.period;

test('the schedule: one window a week, 10-20 minutes, deterministic, at a different time of the week each week', () => {
  const starts = new Set(), hours = new Set();
  for (let k = 0; k < 104; k++) {
    const w = sharkWindow(k), again = sharkWindow(k);
    assert.deepEqual(w, again, 'deterministic');
    const dur = w.end - w.start;
    assert.ok(dur >= S.schedule.window[0] && dur <= S.schedule.window[1], `duration ${dur}`);
    assert.ok(w.start >= k * WEEK && w.end <= (k + 1) * WEEK, 'inside its week');
    starts.add(Math.round(w.start - k * WEEK)); hours.add(Math.floor((w.start % 86400) / 3600));
    assert.deepEqual(sharkNow(w.start + 1), w); assert.equal(sharkNow(w.start - 1), null); assert.equal(sharkNow(w.end), null);
    assert.deepEqual(nextSharkWindow(w.start - 3600), w);
  }
  assert.equal(starts.size, 104, 'a new time every week');
  assert.ok(hours.size >= 18, `spread over the hours of the day: ${hours.size}`);
  // scanning two years of fish time minute by minute finds exactly one window a week
  let windows = 0, open = false;
  for (let t = 0; t < 104 * WEEK; t += 60) { const w = !!sharkNow(t); if (w && !open) windows++; open = w; }
  assert.equal(windows, 104);
  assert.notDeepEqual(sharkWindow(3, 1), sharkWindow(3, 2), 'the seed matters');
  // test mode: the whole of every test period
  assert.ok(sharkNow(12345, C.seed, true)); assert.equal(sharkWindow(2, C.seed, true).start, 2 * S.test.period);
});

test('the shark swims in the channel at the surface, clear of the road bridge piers, slowly', () => {
  for (let k = 0; k < 30; k++) {
    const w = sharkWindow(k);
    for (let t = w.start; t < w.end; t += 3) {
      const o = sharkAt(w, t), q = riverProject(o.x, o.z), hw = riverPoint(q.s).hw;
      assert.ok(q.abs < hw - 0.3, `in the channel ${k} ${t}: ${q.abs.toFixed(2)} of ${hw.toFixed(2)}`);
      for (const p of piers) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) > p.r + S.len / 2, `clear of a pier ${k}`);
      assert.ok(Number.isFinite(o.y) && Number.isFinite(o.yaw) && o.speed < 2.5, `speed ${o.speed}`);
      assert.ok(o.show >= 0 && o.show <= 1);
    }
  }
});

test('phases: the body for SHARK.body s, the skeleton for SHARK.bones s, then gone', () => {
  const rec = { w: 5, at: 1_800_000_000_000, p: [10, -6, 100], r: 1 };
  assert.equal(sharkPhase(rec, rec.at), 'body');
  assert.equal(sharkPhase(rec, rec.at + (S.body - 1) * 1000), 'body');
  assert.equal(sharkPhase(rec, rec.at + (S.body + 1) * 1000), 'bones');
  assert.equal(sharkPhase(rec, rec.at + (S.body + S.bones - 1) * 1000), 'bones');
  assert.equal(sharkPhase(rec, rec.at + (S.body + S.bones + 1) * 1000), null);
  assert.equal(sharkUntil(rec), rec.at + (S.body + S.bones) * 1000);
  assert.deepEqual(cleanSharkRecord(rec), rec);
  for (const bad of [null, {}, { ...rec, w: 1.5 }, { ...rec, p: [1, 2] }, { ...rec, p: [1, 2, NaN] }, { ...rec, r: 99 }, { ...rec, at: 'x' }]) assert.equal(cleanSharkRecord(bad), null);
  assert.deepEqual(cleanRiverFish(JSON.stringify({ t: 'rf', k: 'sc', p: [1, 2, 3], r: 0.5 })), { k: 'sc', p: [1, 2, 3], r: 0.5 });
  for (const bad of [{ k: 'sc' }, { k: 'sc', p: [1, 2], r: 0 }, { k: 'sc', p: [1, 2, 3e5], r: 0 }, { k: 'sc', p: [1, 2, 3], r: 'x' }]) assert.equal(cleanRiverFish(JSON.stringify({ t: 'rf', ...bad })), null);
});

// --- in memory: the room with a fake storage and RiverFishSync clients ---
function memStorage(map = new Map()) {
  return { map, writes: 0, get: async (k) => structuredClone(map.get(k)), async put(k, v) { this.writes++; map.set(k, structuredClone(v)); }, delete: async (k) => map.delete(k) };
}
function world(storage = memStorage(), now = 0) {
  const peers = [], clock = { now };
  const room = new RoomRiverFish(() => peers.map((p) => ({ ws: p.ws, a: p.a })), (ws, text) => peers.find((p) => p.ws === ws).inbox.push(JSON.parse(text)), () => 0.5, { storage });
  const join = (id) => {
    const p = { ws: { id }, a: { i: id, s: { p: [0, 0, 0] } }, inbox: [], got: [] };
    p.sync = new RiverFishSync({ send: (m) => { const c = cleanRiverFish(JSON.stringify(m)); if (c) room.handle(p.ws, p.a, c, clock.now); return true; }, now: () => clock.now, hooks: { sharkCaught: (ok) => p.got.push(ok) } });
    peers.push(p); return p;
  };
  const all = () => peers.forEach((p) => { while (p.inbox.length) p.sync.receive(p.inbox.shift()); });
  return { peers, room, clock, join, all, storage };
}
const msAt = (t) => (t + C.epoch) * 1000; // room ms for fish time t
const standBy = (p, w, t) => { const o = sharkAt(w, t); p.a.s.p = [o.x + 2, -6, o.z]; return [o.x + 2.5, -6, o.z + 1]; };

test('the room arbitrates: no shark outside its window, one catcher per window, reach and landing spot checked, everybody gets the record', async () => {
  const w0 = sharkWindow(4000), W = world(memStorage(), msAt(w0.start - 600));
  const a = W.join('A'), b = W.join('B');
  a.sync.setNear(true); b.sync.setNear(true); W.all();
  assert.equal(a.sync.sharkWindow(), null, 'no window yet');
  let spot = standBy(a, w0, fishTime(W.clock.now));
  assert.equal(a.sync.catchShark(spot, 0), false, 'the client does not even ask outside the window');
  a.sync.near && W.room.handle(a.ws, a.a, { k: 'sc', p: spot, r: 0 }, W.clock.now); W.all();
  assert.equal(a.inbox.length, 0); assert.equal(W.room.shark, null, 'the room refused (sno) outside the window');
  W.clock.now = msAt(w0.start + 120);
  const t = fishTime(W.clock.now);
  assert.ok(a.sync.sharkWindow() && b.sync.sharkWindow(), 'both see the fin');
  // too far from the shark; a landing spot too far from the catcher
  b.a.s.p = [sharkAt(w0, t).x + S.reach + 5, -6, sharkAt(w0, t).z]; b.sync.catchShark([b.a.s.p[0], -6, b.a.s.p[2]], 0); W.all();
  assert.deepEqual(b.got, [false], 'too far away');
  W.clock.now += C.sync.catchEvery * 1000;
  spot = standBy(a, w0, fishTime(W.clock.now));
  a.sync.catchShark([spot[0] + S.land + 2, spot[1], spot[2]], 0); W.all(); assert.deepEqual(a.got, [false], 'landing too far from the catcher');
  W.clock.now += C.sync.catchEvery * 1000;
  spot = standBy(a, w0, fishTime(W.clock.now)); standBy(b, w0, fishTime(W.clock.now));
  a.sync.catchShark(spot, 1.2); b.sync.catchShark(spot, 0.3); W.all();
  assert.deepEqual(a.got, [false, true]); assert.deepEqual(b.got, [false, false], 'B was too late');
  for (const p of [a, b]) { assert.deepEqual(p.sync.shark.p, spot.map((v) => Math.round(v * 100) / 100)); assert.equal(p.sync.shark.w, w0.k); assert.equal(p.sync.sharkWindow(), null, 'the fin is gone for ' + p.ws.id); assert.equal(p.sync.sharkPhase(), 'body'); }
  assert.equal(W.storage.writes, 1); assert.deepEqual(W.storage.map.get('shark'), W.room.shark, 'one record in the room storage');
  // later in the same window nobody can catch it again
  W.clock.now += 60_000; standBy(b, w0, fishTime(W.clock.now)); b.sync.catchShark(spot, 0); W.all();
  assert.deepEqual(b.got.at(-1), false); assert.equal(W.storage.writes, 1);
  // a late player learns the record; the phases follow the room clock
  const c = W.join('C'); c.sync.setNear(true); W.all();
  assert.deepEqual(c.sync.shark, a.sync.shark); assert.equal(c.sync.sharkPhase(), 'body');
  W.clock.now += S.body * 1000; assert.equal(c.sync.sharkPhase(), 'bones');
  W.clock.now += S.bones * 1000; assert.equal(c.sync.sharkPhase(), null);
  const d = W.join('D'); d.sync.setNear(true); W.all(); assert.equal(d.sync.shark, null, 'an expired record is not handed out');
  // the next week's shark can be caught again
  const w1 = sharkWindow(4001); W.clock.now = msAt(w1.start + 30); W.clock.now += 1;
  spot = standBy(a, w1, fishTime(W.clock.now)); a.sync.catchShark(spot, 0); W.all();
  assert.equal(a.got.at(-1), true); assert.equal(W.room.shark.w, w1.k); assert.equal(W.storage.writes, 2);
});

test('the record survives hibernation (a fresh room object on the same storage) and is deleted once it has expired', async () => {
  const st = memStorage(), w0 = sharkWindow(4002), W = world(st, msAt(w0.start + 10));
  const a = W.join('A'); a.sync.setNear(true); W.all();
  a.sync.catchShark(standBy(a, w0, fishTime(W.clock.now)), 0); W.all();
  const rec = W.room.shark;
  assert.ok(rec);
  // hibernation: memory lost, a new object loads its storage
  const later = W.clock.now + (S.body + 600) * 1000, W2 = world(st, later);
  await W2.room.load(later);
  assert.deepEqual(W2.room.shark, rec, 'restored');
  const b = W2.join('B'); b.sync.setNear(true); W2.all();
  assert.deepEqual(b.sync.shark, rec); assert.equal(b.sync.sharkPhase(), 'bones', 'the skeleton after an hour');
  // after the skeleton's day: a waking room deletes it
  const gone = rec.at + (S.body + S.bones + 5) * 1000, W3 = world(st, gone);
  await W3.room.load(gone);
  assert.equal(W3.room.shark, null); assert.equal(st.map.has('shark'), false, 'deleted');
  // malformed values are dropped too
  st.map.set('shark', { junk: 1 }); const W4 = world(st, gone); await W4.room.load(gone); assert.equal(st.map.has('shark'), false);
});

test('solo / offline: the catch is ours at once and remembered in the store', () => {
  const kept = { v: null }, store = { get: () => kept.v, set: (r) => { kept.v = r; } };
  const w = sharkWindow(4003), clock = { now: msAt(w.start + 5) }, got = [];
  const s = new RiverFishSync({ now: () => clock.now, store, hooks: { sharkCaught: (ok) => got.push(ok) } });
  assert.ok(s.sharkWindow());
  assert.ok(s.catchShark([1, 2, 3], 0.5));
  assert.deepEqual(got, [true]); assert.equal(kept.v.w, w.k); assert.equal(s.sharkWindow(), null);
  const again = new RiverFishSync({ now: () => clock.now + 1000, store }); // a reload
  assert.deepEqual(again.shark, kept.v); assert.equal(again.sharkPhase(), 'body');
  const late = new RiverFishSync({ now: () => clock.now + (S.body + S.bones + 1) * 1000, store });
  assert.equal(late.shark, null, 'an expired solo record is ignored');
  // &shark=now: a window open now
  assert.ok(new RiverFishSync({ sharkTest: true }).sharkWindow());
});

// --- through the real Worker + PlayerRoom (devws.mjs), with a hibernation in between ---
installRuntime();
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
test('through the Worker: test schedule flag, a catch reaches the other socket, the record survives hibernation; nothing else stored', async () => {
  const realNow = Date.now;
  let now = Date.UTC(2026, 10, 3, 12);
  Date.now = () => now;
  try {
    const env = { ADMIN_TOKEN: 'tok', SHARK_TEST: true }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
    const connect = async () => {
      const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
      const c = { ws: r.webSocket, got: [] };
      c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
      c.send = (m) => c.ws.send(JSON.stringify(m)); c.rf = () => c.got.filter((m) => m.t === 'rf');
      await settle(env); return c;
    };
    const say = async (c, m, wait = 1000) => { now += wait; c.send(m); await settle(env); };
    const a = await connect(), b = await connect();
    await say(a, { t: 'rf', k: 'on' }); await say(b, { t: 'rf', k: 'on' });
    const L = a.rf().at(-1);
    assert.equal(L.k, 'L'); assert.equal(L.sk, 1, 'the room says it runs the test schedule'); assert.equal(L.sh, undefined, 'no record yet');
    const w = sharkNow(fishTime(now + 1000), C.seed, true), o = sharkAt(w, fishTime(now + 1000));
    const p = [Math.round((o.x + 1) * 100) / 100, -6, Math.round(o.z * 100) / 100];
    await say(a, { p, r: 0 }, 0);
    await say(a, { t: 'rf', k: 'sc', p: [p[0] + 1, -6, p[2] + 0.5], r: 0.7 });
    assert.deepEqual(a.rf().slice(-2).map((m) => m.k), ['S', 'sok']);
    const S1 = b.rf().at(-1);
    assert.equal(S1.k, 'S'); assert.deepEqual(S1.sh.p, [p[0] + 1, -6, p[2] + 0.5]);
    await say(b, { p, r: 0 }, 0); await say(b, { t: 'rf', k: 'sc', p, r: 0 }, 2500); assert.equal(b.rf().at(-1).k, 'sno', 'one per window');
    const data = env.PLAYERS.ctx('world').data;
    assert.deepEqual([...data.keys()].filter((k) => /shark|fish|rf/i.test(k)), ['shark'], 'one storage key');
    // hibernate: memory is lost, storage and sockets are kept
    env.PLAYERS.hibernate('world'); await settle(env);
    now += 1800 * 1000;
    await say(b, { t: 'rf', k: 'off' }); await say(b, { t: 'rf', k: 'on' });
    assert.deepEqual(b.rf().at(-1).sh, S1.sh, 'the woken room still knows the catch');
    assert.ok(JSON.stringify(b.rf().at(-1)).length < 4096);
    for (const c of [a, b]) c.ws.close();
  } finally { Date.now = realNow; }
});
