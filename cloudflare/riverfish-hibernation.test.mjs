// #1778: the caught fish (`lives`) live in the room's memory only. A Durable Object that hibernates keeps its WebSockets, so the clients
// that stay connected keep their own `born`, while the woken room starts again at life 0. Real Worker + PlayerRoom + hibernate() (devws.mjs).
//   node --test cloudflare/riverfish-hibernation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIVER_FISH as C } from '../src/config.js';
import { fishSpec, fishAt, fishTime } from '../src/riverfishswim.js';
import { installRuntime, fakeNamespace } from './devws.mjs';
import { RoomRiverFish } from './riverfish.js';
import worker, { PlayerRoom } from './worker.js';

installRuntime();
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };

test('a still-connected client can catch the next life of a fish after the room hibernated; a newcomer and the old client agree', async () => {
  const realNow = Date.now, realRandom = Math.random;
  let now = Date.UTC(2026, 10, 3, 12);
  Date.now = () => now; Math.random = () => 0; // respawn at the minimum
  try {
    const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
    const connect = async () => {
      const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
      const c = { ws: r.webSocket, got: [] };
      c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
      c.send = (m) => c.ws.send(JSON.stringify(m)); c.rf = () => c.got.filter((m) => m.t === 'rf');
      await settle(env); return c;
    };
    const say = async (c, m, wait = 1000) => { now += wait; c.send(m); await settle(env); };
    const stand = (f, b) => { const o = fishAt(fishSpec(f, b), fishTime(now + 1000)); return [Math.round(o.x * 100) / 100, o.y ?? 0, Math.round(o.z * 100) / 100]; };
    const f = 3;
    const a = await connect();
    await say(a, { t: 'rf', k: 'on' });
    await say(a, { p: stand(f, 0), r: 0 }, 0);
    await say(a, { t: 'rf', k: 'c', f, b: 0 });
    const first = a.rf().filter((m) => m.k === 'ok' || m.k === 'no').at(-1);
    assert.equal(first.k, 'ok', 'precondition: the first catch is accepted');
    const g = a.rf().filter((m) => m.k === 'g').at(-1); // the client's own gone entry: life 1 back at g.u
    assert.equal(g.b, 1);
    // hibernation: memory lost, sockets kept; time passes until the fish is back
    env.PLAYERS.hibernate('world'); await settle(env);
    now = Math.max(now, g.u) + 5000;
    await say(a, { p: stand(f, 1), r: 0 }, 0);
    await say(a, { t: 'rf', k: 'c', f, b: 1 }, 3000);
    const second = a.rf().filter((m) => m.k === 'ok' || m.k === 'no').at(-1);
    // a newcomer's view of the same fish
    const n = await connect(); await say(n, { t: 'rf', k: 'on' });
    const L = n.rf().find((m) => m.k === 'L');
    console.log('RESULT second catch (b=1) after hibernation:', second.k, '| newcomer gone list:', JSON.stringify(L.g));
    assert.equal(second.k, 'ok', 'the old client\'s catch of life 1 must be accepted');
    for (const c of [a, n]) c.ws.close();
  } finally { Date.now = realNow; Math.random = realRandom; }
});

test('anti-cheat: a catch too far ahead, or from out of reach, is still refused', () => {
  const out = [], ws = { id: 1 }, a = { rf: true, s: { p: [0, 0, 0] } };
  const room = new RoomRiverFish(() => [{ ws, a }], (_, t) => out.push(JSON.parse(t)), () => 0);
  const now = Date.UTC(2026, 10, 3, 12), at = (b) => { const o = fishAt(fishSpec(2, b), fishTime(now)); return [o.x, 0, o.z]; };
  a.s.p = at(51); room.handle(ws, a, { k: 'c', f: 2, b: 51 }, now);
  assert.equal(out.at(-1).k, 'no', 'beyond the allowed lead');
  a.rfc = 0; a.s.p = [1e3, 0, 1e3]; room.handle(ws, a, { k: 'c', f: 2, b: 5 }, now + 5000);
  assert.equal(out.at(-1).k, 'no', 'out of reach');
  a.rfc = 0; a.s.p = at(5); room.handle(ws, a, { k: 'c', f: 2, b: 5 }, now + 10000);
  assert.ok(out.some((m) => m.k === 'ok')); assert.equal(room.lives.get(2).b, 6);
});
