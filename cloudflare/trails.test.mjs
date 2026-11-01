// #1773: the players room's recent paths for late joiners' footprints (cloudflare/trails.js): sparse, bounded, memory only, in the welcome.
//   node --test cloudflare/trails.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOTPRINTS } from '../src/config.js';
import { RoomTrails } from './trails.js';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';

const R = FOOTPRINTS.room;

test('a sparse point per gap m walked; a jump, a ride, the jetpack or sitting starts a new trail', () => {
  const T = new RoomTrails(), t0 = 1e12;
  for (let k = 0; k <= 50; k++) T.record('a', { p: [k * 0.25, 0, 0] }, t0 + k * 200); // 12.5 m at 1.25 m/s
  let s = T.snapshot(t0 + 10_000).k;
  assert.ok(s.length >= 9 && s.length <= 11, `points every ${R.gap} m: ${s.length}`);
  for (let i = 1; i < s.length; i++) assert.ok(Math.hypot(s[i][1] - s[i - 1][1], s[i][3] - s[i - 1][3]) >= R.gap - 1e-9);
  assert.ok(s.every((p) => p[0] === s[0][0]), 'one trail');
  T.record('a', { p: [40, 0, 0] }, t0 + 10_200); // teleported
  T.record('a', { p: [42, 0, 0], bk: 1 }, t0 + 10_400); // riding: nothing, and the trail breaks
  T.record('a', { p: [44, 0, 0] }, t0 + 10_600);
  T.record('a', { p: [46, 0, 0], pose: 1 }, t0 + 10_800);
  T.record('a', { p: [48, 0, 0], jp: 2 }, t0 + 11_000);
  s = T.snapshot(t0 + 11_000).k;
  assert.deepEqual(new Set(s.map((p) => p[0])).size, 3, 'jump and ride make new trails');
  assert.ok(!s.some((p) => p[1] === 42 || p[1] === 46 || p[1] === 48), 'no point while riding, sitting or flying');
});

test('bounded: at most `max` points, the oldest go first, and none older than FOOTPRINTS.life', () => {
  const T = new RoomTrails(50), t0 = 1e12;
  for (let k = 0; k < 400; k++) T.record('a', { p: [k * 1.3, 0, 0] }, t0 + k * 1000);
  const s = T.snapshot(t0 + 400_000).k;
  assert.equal(T.pts.length, 50); assert.equal(s.length, 50);
  assert.equal(s[0][1], Math.round(350 * 1.3 * 10) / 10, 'the newest 50 kept, oldest first');
  assert.deepEqual(s.map((p) => p[4]), [...s.map((p) => p[4])].sort((a, b) => b - a), 'ages oldest first');
  assert.equal(T.snapshot(t0 + 400_000 + FOOTPRINTS.life * 1000 + 2000).k.length, 0, 'all older than life: gone');
  assert.equal(new RoomTrails().max, R.max);
});

test('the room: a walker\'s path is in a late joiner\'s welcome (no new message type), the trail stays after they leave', async () => {
  installRuntime();
  const realNow = Date.now; let now = Date.UTC(2026, 11, 20, 12); Date.now = () => now;
  try {
    const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
    const tick = () => new Promise((r) => setTimeout(r, 0)), settle = async () => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
    const connect = async () => {
      const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
      const c = { ws: r.webSocket, got: [] };
      c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
      await settle(); return c;
    };
    const a = await connect();
    assert.deepEqual(a.got[0].trails, { k: [] });
    for (let k = 0; k <= 20; k++) { a.ws.send(JSON.stringify({ p: [-10 + k * 0.3, 0.2, 22], r: 0 })); now += 250; await settle(); }
    const b = await connect();
    const k = b.got[0].trails.k;
    assert.equal(b.got[0].t, 'w');
    assert.ok(k.length >= 4, `A's path: ${k.length} points`);
    assert.deepEqual(k[0].slice(1, 4), [-10, 0.2, 22]);
    assert.ok(k.every((p) => p[4] >= 0 && p[4] <= 6), 'ages in s');
    a.ws.close(1000); await settle();
    now += 60_000;
    const c = await connect();
    assert.equal(c.got[0].trails.k.length, k.length, 'still there a minute after A left');
    now += FOOTPRINTS.life * 1000;
    const d = await connect();
    assert.equal(d.got[0].trails.k.length, 0, 'gone after 30 minutes');
  } finally { Date.now = realNow; }
});
