// The shared fish in Höje å (#1752): validation, the room as the one clock and seed, the swim functions staying in the water and clear of
// the road bridge's piers, two clients seeing the same fish and rings, and a fish taken out of the room (the catch #1753 will use) with its
// limits. Part 1 drives RoomRiverFish with two RiverFishSync clients in memory; part 2 goes through the real Worker + PlayerRoom (devws.mjs).
//   node --test cloudflare/riverfish.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIVER_FISH as C, SITE } from '../src/config.js';
import { fishSpec, fishAt, ringsAt, riverProject, riverPoint, piers, swimIntervals, waterAt, bedAt, fishTime } from '../src/riverfishswim.js';
import { RiverFishSync } from '../src/riverfishsync.js';
import { RoomRiverFish, cleanRiverFish } from './riverfish.js';
import { PLAYERS } from './players.js';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';

test('cleanRiverFish validates every message kind', () => {
  assert.deepEqual(cleanRiverFish(JSON.stringify({ t: 'rf', k: 'on' })), { k: 'on' });
  assert.deepEqual(cleanRiverFish(JSON.stringify({ t: 'rf', k: 'off', junk: 1 })), { k: 'off' });
  assert.deepEqual(cleanRiverFish(JSON.stringify({ t: 'rf', k: 'c', f: 3, b: 0 })), { k: 'c', f: 3, b: 0 });
  for (const bad of [{ t: 'rf', k: 'c', f: C.count, b: 0 }, { t: 'rf', k: 'c', f: -1, b: 0 }, { t: 'rf', k: 'c', f: 1.5, b: 0 }, { t: 'rf', k: 'c', f: 1 }, { t: 'rf', k: 'c', f: 1, b: 2e6 },
    { t: 'rf', k: 'L', now: 1 }, { t: 'rf', k: 'zz' }, { t: 'sq', k: 'on' }]) assert.equal(cleanRiverFish(JSON.stringify(bad)), null, JSON.stringify(bad));
  assert.equal(cleanRiverFish('nope'), null);
});

test('the swim functions keep every fish in the channel, between bed and surface, and clear of the piers', () => {
  assert.ok(swimIntervals.length >= 2, 'the piers cut the river into stretches');
  for (const p of piers) { const q = riverProject(p.x, p.z); if (q.abs < riverPoint(q.s).hw + p.r) assert.ok(!swimIntervals.some(([a, b]) => q.s > a && q.s < b), 'no stretch runs through a pier in the channel'); }
  const seen = new Set();
  for (let id = 0; id < C.count; id++) for (const born of [0, 1, 5]) {
    const f = fishSpec(id, born); seen.add(f.spec.name);
    for (let t = 0; t < 7200; t += 0.7) {
      const o = fishAt(f, t), q = riverProject(o.x, o.z), hw = riverPoint(q.s).hw;
      assert.ok(q.abs + f.spec.len / 2 <= hw - C.edge + 0.15, `fish ${id}/${born} in the channel at ${t}: ${q.abs.toFixed(2)} of ${hw.toFixed(2)}`);
      assert.ok(o.y > o.bed + 0.05 && o.y - f.spec.h / 2 >= bedAt(q.s) - 0.02, `over the bed ${id} ${t}`);
      assert.ok(o.y < o.water + f.spec.h / 2 && o.water === waterAt(o.s), `under/at the surface ${id} ${t}`);
      for (const p of piers) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) > p.r + C.pierClear, `clear of a pier ${id} ${t}`);
      assert.ok(o.speed < 2.5, `a plausible speed ${o.speed}`);
    }
  }
  assert.ok(seen.size >= 4, `several species: ${[...seen]}`);
  assert.ok(Math.abs(waterAt(riverProject(23.6, 122.9).s) - SITE.bridges.waterY) < 1e-9, 'the water level is anchored at the road bridge like riverbridge.js');
});

test('fish rise now and then, and each rise leaves a ring that grows old and goes', () => {
  let rings = 0, rises = 0;
  for (let id = 0; id < C.count; id++) {
    const f = fishSpec(id);
    for (let t = 0; t < 600; t += 0.25) {
      const o = fishAt(f, t), r = ringsAt(f, t);
      if (o.rise > 0.99) rises++;
      for (const g of r) { rings++; assert.ok(g.age >= 0 && g.age < C.ring.life); assert.ok(Math.abs(g.y - waterAt(riverProject(g.x, g.z).s)) < 0.01); }
    }
  }
  assert.ok(rises > 0 && rings > 0, `${rises} rises, ${rings} ring samples in 10 minutes`);
});

// --- part 1: in memory ---
function world() {
  const peers = [], clock = { now: 1_800_000_000_000 };
  const room = new RoomRiverFish(() => peers.map((p) => ({ ws: p.ws, a: p.a })), (ws, text) => peers.find((p) => p.ws === ws).inbox.push(JSON.parse(text)), () => 0.5);
  const join = (id, skew = 0) => {
    const p = { ws: { id }, a: { i: id, s: { p: [0, 0, 0] } }, inbox: [], caught: [] };
    p.sync = new RiverFishSync({ send: (m) => { const c = cleanRiverFish(JSON.stringify(m)); if (c) room.handle(p.ws, p.a, c, clock.now); return true; }, now: () => clock.now + skew, hooks: { caught: (f, ok) => p.caught.push([f, ok]) } });
    peers.push(p); return p;
  };
  const all = () => peers.forEach((p) => { while (p.inbox.length) p.sync.receive(p.inbox.shift()); });
  return { peers, room, clock, join, all };
}

test('the room is the one clock and seed: two clients with skewed clocks see the same fish and the same rings', () => {
  const w = world(), a = w.join('A', 0), b = w.join('B', 37_000); // B's clock is 37 s fast
  a.sync.setNear(true); b.sync.setNear(true); w.all();
  assert.ok(a.sync.synced && b.sync.synced);
  assert.equal(a.sync.seed, C.seed); assert.equal(b.sync.seed, C.seed);
  assert.ok(Math.abs(a.sync.t - b.sync.t) < 1e-6, 'the same fish time');
  for (let id = 0; id < C.count; id++) {
    const fa = fishAt(fishSpec(id, a.sync.born(id), a.sync.seed), a.sync.t), fb = fishAt(fishSpec(id, b.sync.born(id), b.sync.seed), b.sync.t);
    assert.ok(Math.hypot(fa.x - fb.x, fa.z - fb.z) < 1e-6 && fa.y === fb.y, `fish ${id} in the same place`);
  }
  const at = [...Array(4000)].map((_, i) => i * 0.25).find((t) => ringsAt(fishSpec(2), a.sync.t + t).length);
  w.clock.now += at * 1000;
  assert.deepEqual(ringsAt(fishSpec(2), a.sync.t), ringsAt(fishSpec(2), b.sync.t), 'the same ring');
  const solo = new RiverFishSync({ now: () => w.clock.now + 37_000 });
  assert.ok(Math.abs(solo.t - b.sync.t - 37) < 1e-6, 'without the room a skewed clock is off by its skew');
});

test('a fish taken out of the room (#1753): gone for everybody, back as a new life later; a second catcher is refused', () => {
  const w = world(), a = w.join('A'), b = w.join('B'), c = w.join('C');
  for (const p of [a, b, c]) p.sync.setNear(true);
  w.all();
  const id = 4, o = fishAt(fishSpec(id), a.sync.t);
  a.a.s.p = [o.x + 3, -5, o.z]; c.a.s.p = [o.x - 4, -5, o.z]; b.a.s.p = [o.x + 500, 0, o.z];
  a.sync.catch(id); c.sync.catch(id); w.all();
  assert.deepEqual(a.caught, [[id, true]]); assert.deepEqual(c.caught, [[id, false]], 'C was too late');
  for (const p of [a, b, c]) { assert.ok(p.sync.isGone(id), 'gone for ' + p.ws.id); assert.equal(p.sync.born(id), 1); }
  const back = w.room.lives.get(id).u;
  assert.equal(back - w.clock.now, (C.sync.respawn[0] + C.sync.respawn[1]) / 2 * 1000);
  // a late player learns it at once
  const d = w.join('D'); d.sync.setNear(true); w.all();
  assert.ok(d.sync.isGone(id) && d.sync.born(id) === 1);
  // too soon, too far, a stale life: refused
  w.clock.now += 500; const o2 = fishAt(fishSpec(5), a.sync.t); a.a.s.p = [o2.x, -5, o2.z];
  a.sync.catch(5); w.all(); assert.equal(a.caught.length, 1, 'within catchEvery: no answer'); a.sync.pending.clear();
  w.clock.now += C.sync.catchEvery * 1000; const o3 = fishAt(fishSpec(5), b.sync.t);
  b.a.s.p = [o3.x + C.sync.reach + 5, -5, o3.z]; b.sync.catch(5); w.all(); assert.deepEqual(b.caught, [[5, false]], 'too far away');
  w.clock.now += C.sync.catchEvery * 1000;
  b.sync.gone.delete(id); b.a.s.p = [0, 0, 0]; const o4 = fishAt(fishSpec(id, 0), b.sync.t); b.a.s.p = [o4.x, -5, o4.z];
  b.sync.catch(id); w.all(); assert.deepEqual(b.caught.at(-1), [id, false], 'the old life is gone');
  // after the respawn time the fish is back as life 1, somewhere else in the river
  w.clock.now = back + 1;
  w.all();
  assert.ok(!a.sync.isGone(id) && !d.sync.isGone(id), 'back');
  assert.notEqual(fishSpec(id, 1).home, fishSpec(id, 0).home);
  // nobody near the river: 'c' is ignored; leaving and coming back gives one 'L' each time
  a.sync.setNear(false); const n = a.inbox.length; a.sync.catch(6); assert.equal(a.inbox.length, n);
  w.room.handle(a.ws, a.a, { k: 'off' }, w.clock.now); w.room.handle(a.ws, a.a, { k: 'on' }, w.clock.now); w.room.handle(a.ws, a.a, { k: 'on' }, w.clock.now);
  assert.equal(a.inbox.filter((m) => m.k === 'L').length, 1, 'one L per arrival');
  assert.ok(w.room.lives.size <= C.count);
  assert.ok(JSON.stringify({ t: 'rf', k: 'L', now: 1.8e12, s: C.seed, g: Array.from({ length: C.count }, (_, i) => [i, 999999, 1.8e12]) }).length < 4096, 'a full gone list stays small');
});

// --- part 2: the real Worker ---
installRuntime();
let now = Date.UTC(2026, 10, 1, 12);
Date.now = () => now;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
async function connect(env) {
  const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
  const c = { ws: r.webSocket, got: [] };
  c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.rf = () => c.got.filter((m) => m.t === 'rf');
  await settle(env); return c;
}
const say = async (env, c, m, wait = 1000) => { now += wait; c.send(m); await settle(env); };

test('through the Worker: clock and seed on arrival, a catch is gone for the other socket, no storage written', async () => {
  const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
  const a = await connect(env), b = await connect(env);
  await say(env, a, { t: 'rf', k: 'on' });
  assert.deepEqual(a.rf().at(-1), { t: 'rf', k: 'L', now, s: C.seed, g: [] });
  await say(env, b, { t: 'rf', k: 'on' });
  const o = fishAt(fishSpec(7), fishTime(now + 1000));
  await say(env, a, { p: [Math.round(o.x * 100) / 100, -5, Math.round(o.z * 100) / 100], r: 0 }, 0);
  await say(env, a, { t: 'rf', k: 'c', f: 7, b: 0 });
  assert.deepEqual(a.rf().filter((m) => m.k !== 'L').map((m) => m.k), ['ok', 'g']);
  const g = b.rf().at(-1);
  assert.equal(g.k, 'g'); assert.equal(g.f, 7); assert.equal(g.b, 1); assert.ok(g.u >= now + C.sync.respawn[0] * 1000 && g.u <= now + C.sync.respawn[1] * 1000);
  await say(env, b, { t: 'rf', k: 'c', f: 7, b: 0 }); assert.equal(b.rf().at(-1).k, 'no');
  await say(env, b, { t: 'rf', k: 'off' }); await say(env, b, { t: 'rf', k: 'on' });
  assert.deepEqual(b.rf().at(-1).g, [[7, 1, g.u]], 'a returning player learns the gone list');
  const store = env.PLAYERS.ctx('world').storage;
  const keys = store ? [...(await store.list?.() ?? new Map()).keys()].filter((k) => /fish|rf/i.test(k)) : [];
  assert.deepEqual(keys, [], 'nothing about the fish in storage');
  assert.ok(JSON.stringify(b.rf().at(-1)).length < PLAYERS.maxBytes);
});

test('#1753: catchCm is the same for everybody, inside the species range; giveUp ends a request the room never answered', async () => {
  const { catchCm } = await import('../src/riverfishswim.js');
  const { FISHING } = await import('../src/config.js');
  for (const [name, { cm }] of Object.entries(FISHING.species)) {
    assert.ok(C.species.some((s) => s.name === name), name);
    for (let id = 0; id < C.count; id++) for (const born of [0, 1, 7]) { const v = catchCm(id, born, C.seed, cm); assert.ok(Number.isInteger(v) && v >= cm[0] && v <= cm[1], `${name} ${v}`); assert.equal(v, catchCm(id, born, C.seed, cm)); }
  }
  const sent = [], answers = [], s = new RiverFishSync({ send: (m) => { sent.push(m); return true; }, hooks: { caught: (id, ok) => answers.push([id, ok]) } });
  s.setNear(true); s.receive({ k: 'L', now: Date.now(), s: C.seed, g: [] });
  s.catch(3);
  assert.ok(s.isGone(3), 'hidden while pending');
  s.giveUp(3);
  assert.deepEqual(answers, [[3, false]]); assert.equal(s.isGone(3), false, 'back in the river after giving up');
  s.giveUp(3); assert.equal(answers.length, 1, 'only once');
  s.receive({ k: 'ok', f: 3, b: 0 }); assert.equal(answers.length, 1, 'a late answer after giving up is ignored');
});
