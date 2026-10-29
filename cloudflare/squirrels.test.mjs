// The shared squirrels and nuts (#1686): validation, one leader among the players near the squirrels, snapshots to the followers, nut claims
// arbitrated by the room (no double pick), put-down / feed relays, and the leader handing over. Part 1 drives RoomSquirrels with two real
// SquirrelSync clients in memory; part 2 goes through the real Worker + PlayerRoom (devws.mjs).   node --test cloudflare/squirrels.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SQUIRRELS as C } from '../src/config.js';
import { NutField, SquirrelBrain, linkTrees } from '../src/squirrelbrain.js';
import { SquirrelSync, encodeAnimal, STATES } from '../src/squirrelsync.js';
import { RoomSquirrels, cleanSquirrels } from './squirrels.js';
import { PLAYERS } from './players.js';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';

const rng = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const mkTrees = () => linkTrees([[0, 0], [8, 3], [15, -2], [6, 14]].map(([x, z]) => ({ x, z, y: 0, cy: 6, r: 3.5 })));

// --- part 1: in memory ---
function world() {
  const peers = []; // { ws, a, inbox }
  const room = new RoomSquirrels(() => peers.map((p) => ({ ws: p.ws, a: p.a })), (ws, text) => peers.find((p) => p.ws === ws).inbox.push(JSON.parse(text)));
  const join = (id, seed) => {
    const trees = mkTrees(), rnd = rng(seed), field = new NutField(trees, () => 0, () => true, rnd), p = { ws: { id, serializeAttachment() {} }, a: { i: id, s: { p: [0, 0, 0] } }, inbox: [] };
    const brains = C.animals.map((spec, i) => new SquirrelBrain(spec, { trees, ground: () => 0, walkable: () => true, nuts: field, player: { x: 1e5, z: 1e5, lure: false, hx: 0, hz: 0 }, rnd, onTake: () => true }, i));
    const fed = [], dropped = [];
    const sync = new SquirrelSync({ field, brains, send: (m) => { room.handle(p.ws, p.a, cleanSquirrels(JSON.stringify(m)), clock.now); return true; }, hooks: { fed: (an, who) => fed.push([an, who]), dropHeld: (s) => { dropped.push(s); s.alive = false; s.held = false; } } });
    Object.assign(p, { id, field, brains, sync, fed, dropped });
    peers.push(p); return p;
  };
  const pump = (p) => { while (p.inbox.length) p.sync.receive(p.inbox.shift()); };
  const near = (p) => { p.sync.setNear(true); };
  const all = () => peers.forEach(pump);
  return { peers, room, join, pump, near, all };
}
const clock = { now: 1_000_000 };
const step = (w, secs = 1) => { for (let t = 0; t < secs; t += 0.1) { clock.now += 100; for (const p of w.peers) { p.field.setActive(true); if (!p.sync.follow) p.field.update(0.1); p.sync.tick(0.1); } w.all(); } };

test('cleanSquirrels validates every message kind', () => {
  const a9 = [1, 0, 2, 0.5, 0, 0.5, 1, 3, 1], good = { t: 'sq', k: 's', a: [a9, a9, a9] };
  assert.deepEqual(cleanSquirrels(JSON.stringify({ t: 'sq', k: 'on' })), { k: 'on' });
  assert.equal(cleanSquirrels(JSON.stringify(good)).a.length, 3);
  for (const bad of [{ ...good, a: [a9, a9] }, { ...good, a: [a9, a9, [...a9.slice(0, 7), 12, 1]] }, { t: 'sq', k: 'n', v: [1, 2, 3] }, { t: 'sq', k: 'n', v: [200, 0, 0, 0] }, { t: 'sq', k: 'n', v: Array(4 * (C.maxNuts + 1)).fill(0) },
    { t: 'sq', k: 't', s: C.maxNuts, b: 1 }, { t: 'sq', k: 't', s: 0 }, { t: 'sq', k: 'p', s: 0, b: 1, x: 'a', z: 0 }, { t: 'sq', k: 'f', s: 0, b: 1, to: 'x'.repeat(40), an: 0 }, { t: 'sq', k: 'f', s: 0, b: 1, to: 'a', an: 3 }, { t: 'sq', k: 'zz' }]) assert.equal(cleanSquirrels(JSON.stringify(bad)), null, JSON.stringify(bad));
  assert.equal(cleanSquirrels('nope'), null);
  const full = JSON.stringify({ t: 'sq', k: 'n', v: Array.from({ length: C.maxNuts }, (_, i) => [i + 64, -15012, 21688, 12345]).flat() });
  assert.ok(full.length < PLAYERS.maxBytes, `a full nut list fits the ordinary message size: ${full.length}`);
  assert.ok(JSON.stringify(good).length < PLAYERS.maxBytes);
});

test('the first player near the squirrels leads; a newcomer follows and gets the scene at once', () => {
  const w = world(), a = w.join('A', 1), b = w.join('B', 2);
  w.near(a); w.all(); step(w, 3);
  assert.ok(a.sync.lead && a.sync.n === 0 && a.sync.sent === 0, 'alone: leads, tells nobody');
  const alive = a.field.count; assert.ok(alive > 0);
  w.near(b); w.all();
  assert.equal(a.sync.n, 1); assert.ok(!b.sync.lead);
  step(w, 2);
  assert.ok(b.sync.follow, 'B follows the snapshots');
  assert.equal(b.field.count, a.field.count, 'the same nuts');
  for (const s of a.field.slots) if (s.alive) { const t = b.field.slots[a.field.slots.indexOf(s)]; assert.ok(t.alive && Math.abs(t.x - s.x) < 0.01 && Math.abs(t.z - s.z) < 0.01 && t.born === s.born); }
  a.brains.forEach((br, i) => assert.ok(Math.hypot(b.brains[i].x - br.x, b.brains[i].z - br.z) < 6, 'animals roughly in step'));
  assert.ok(a.sync.sent > 0);
});

test('a nut taken by a follower is gone for everybody; a second taker is refused (no double pick)', () => {
  const w = world(), a = w.join('A', 1), b = w.join('B', 2), c = w.join('C', 3);
  w.near(a); step(w, 3); w.near(b); w.near(c); step(w, 2);
  const i = a.field.slots.findIndex((s) => s.alive), sa = a.field.slots[i], sb = b.field.slots[i], sc = c.field.slots[i];
  // B and C grab the same nut in the same instant (optimistic: held locally first)
  sb.held = true; sc.held = true; b.sync.take(sb); c.sync.take(sc); w.all();
  assert.ok(sa.held && sa.by === 'B', 'the leader keeps it out of play, held by B');
  assert.equal(b.dropped.length, 0, 'B was first and keeps it'); assert.equal(c.dropped.length, 1, 'C is refused and its nut leaves the hand');
  assert.ok(!sc.alive && !sc.held);
  step(w, 1);
  assert.ok(sb.alive && sb.held, 'B still has it (not erased by snapshots)');
  assert.ok(![...a.field.slots].some((s) => s !== sa && s.born === sa.born && s === sa && !s.held), 'not lying out at the leader');
});

test('the leader and a follower race for one nut: still exactly one winner', () => {
  const w = world(), a = w.join('A', 1), b = w.join('B', 2);
  w.near(a); step(w, 3); w.near(b); step(w, 2);
  const i = a.field.slots.findIndex((s) => s.alive), sa = a.field.slots[i], sb = b.field.slots[i];
  sa.held = true; sb.held = true; a.sync.take(sa); b.sync.take(sb); w.all();
  assert.equal(a.dropped.length + b.dropped.length, 1);
});

test('putting a nut down shares where it lies; a put-down too far from the player is ignored', () => {
  const w = world(), a = w.join('A', 1), b = w.join('B', 2);
  w.near(a); step(w, 3); w.near(b); step(w, 2);
  const i = a.field.slots.findIndex((s) => s.alive), sa = a.field.slots[i], sb = b.field.slots[i];
  sb.held = true; b.sync.take(sb); w.all(); step(w, 1);
  b.peer = w.peers[1]; b.peer.a.s.p = [5, 0, 5];
  b.sync.put(sb, 5.5, 5.5); sb.held = false; w.all();
  assert.ok(sa.alive && !sa.held && sa.by === null && Math.abs(sa.x - 5.5) < 0.01 && Math.abs(sa.z - 5.5) < 0.01, 'the leader has it on the ground again');
  sb.held = true; b.sync.take(sb); w.all();
  b.sync.put(sb, 400, 400); w.all(); assert.ok(sa.held, 'far away put-down refused: stays claimed');
});

test('a squirrel feeding a follower: F reaches the others and the feeder only, the claim is spent', () => {
  const w = world(), a = w.join('A', 1), b = w.join('B', 2), c = w.join('C', 3);
  w.near(a); step(w, 3); w.near(b); w.near(c); step(w, 2);
  const i = a.field.slots.findIndex((s) => s.alive), sa = a.field.slots[i], sb = b.field.slots[i];
  sb.held = true; b.sync.take(sb); w.all();
  assert.equal(a.sync.remoteHeld.get('B'), i);
  a.sync.feed(sa, 'B', 2); a.field.remove(sa); w.all();
  assert.deepEqual(b.fed, [[2, 'B']]); assert.deepEqual(c.fed, [[2, 'B']]); assert.deepEqual(a.fed, []);
  b.sync.feed; // a second feed of the same claim does nothing
  a.sync.feed(sa, 'B', 1); w.all(); assert.equal(b.fed.length, 1, 'no double score');
});

test('the leader leaves: the next player leads from the shared scene, claims follow; the last one out clears the room', () => {
  const w = world(), a = w.join('A', 1), b = w.join('B', 2);
  w.near(a); step(w, 3); w.near(b); step(w, 2);
  const i = a.field.slots.findIndex((s) => s.alive), sb = b.field.slots[i];
  sb.held = true; b.sync.take(sb); w.all(); step(w, 1);
  a.sync.setNear(false); w.all();
  assert.ok(b.sync.lead && b.sync.n === 0, 'B leads now');
  assert.ok(b.field.count > 0, 'the nuts are still there');
  assert.ok(sb.held, 'B still holds its nut');
  b.sync.setNear(false); assert.equal(w.room.nuts.size, 0); assert.equal(w.room.claims.size, 0); assert.equal(w.room.snap, null);
});

test('a follower who leaves with a nut in the hand: the leader drops that nut', () => {
  const w = world(), a = w.join('A', 1), b = w.join('B', 2);
  w.near(a); step(w, 3); w.near(b); step(w, 2);
  const i = a.field.slots.findIndex((s) => s.alive), sa = a.field.slots[i], sb = b.field.slots[i];
  sb.held = true; b.sync.take(sb); w.all(); assert.ok(sa.held);
  b.sync.setNear(false); w.all();
  assert.ok(!sa.alive && !sa.held, 'removed (a new one comes later)');
});

test('encodeAnimal / adopt round trip: state names survive', () => {
  const b = new SquirrelBrain(C.animals[0], { trees: mkTrees(), ground: () => 0, walkable: () => true, nuts: null, player: {}, rnd: rng(3), onTake: () => true }, 0);
  b.state = 'approach'; b.hasNut = true;
  const e = encodeAnimal(b); assert.equal(STATES[e[7]], 'approach'); assert.equal(e[8], 1); assert.equal(e.length, 9);
});

// --- part 2: the real Worker ---
installRuntime();
let now = Date.UTC(2026, 9, 29, 12);
Date.now = () => now;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
async function connect(env) {
  const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
  const c = { ws: r.webSocket, got: [] };
  c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.sq = () => c.got.filter((m) => m.t === 'sq');
  await settle(env); return c;
}
const say = async (env, c, m, wait = 1000) => { now += wait; c.send({ t: 'sq', ...m }); await settle(env); };

test('through the Worker: leader, snapshots, a take and a feed between two sockets', async () => {
  const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
  const a = await connect(env), b = await connect(env);
  await say(env, a, { k: 'on' }); assert.deepEqual(a.sq().at(-1), { t: 'sq', k: 'L', lead: true, n: 0 });
  const v = [0 + 64, 150, 250, 7, 1, 300, 400, 3];
  await say(env, a, { k: 'n', v });
  await say(env, b, { k: 'on' });
  assert.deepEqual(b.sq().map((m) => m.k), ['L', 'n'], 'a newcomer follows and is sent the nuts at once');
  assert.deepEqual(b.sq().at(-1).v, v); assert.equal(a.sq().at(-1).n, 1);
  const a9 = [1, 0, 2, 0.5, 0, 0.5, 1, 3, 1];
  await say(env, a, { k: 's', a: [a9, a9, a9] }); assert.equal(b.sq().at(-1).k, 's');
  await say(env, b, { k: 's', a: [a9, a9, a9] }, 1000); assert.equal(a.sq().filter((m) => m.k === 's').length, 0, 'a follower cannot send snapshots');
  await say(env, b, { k: 't', s: 0, b: 7 }); assert.equal(b.sq().at(-1).k, 'ok'); assert.deepEqual(a.sq().at(-1), { t: 'sq', k: 't', s: 0, b: 7, i: a.sq().at(-1).i });
  await say(env, b, { k: 't', s: 1, b: 8 }); assert.equal(b.sq().at(-1).k, 'no', 'a nut that is not there');
  await say(env, a, { k: 'f', s: 0, b: 7, to: a.sq().at(-1).i, an: 1 });
  assert.equal(b.sq().at(-1).k, 'F'); assert.equal(b.sq().at(-1).an, 1);
  await say(env, a, { k: 'off' }); assert.deepEqual(a.sq().at(-1), { t: 'sq', k: 'L', off: true });
  assert.deepEqual(b.sq().filter((m) => m.k === 'L').at(-1), { t: 'sq', k: 'L', lead: true, n: 0 }, 'B leads when A leaves');
});
