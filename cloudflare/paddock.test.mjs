// The shared pony paddock (#1644): validation, one leader among the players present, snapshot / grass relay, pats to the
// leader only, the leader handing over on leave / disconnect, and the one bigger message. Real Worker + PlayerRoom on Node (devws.mjs).
//   node --test cloudflare/paddock.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { PLAYERS } from './players.js';
import { cleanPaddock, PADDOCK_SYNC } from './paddock.js';
import { centre } from '../src/paddockgeo.js';

installRuntime();
let now = Date.UTC(2026, 9, 27, 12);
Date.now = () => now;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
const setup = () => { const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env); return env; };
async function connect(env) {
  const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
  const c = { ws: r.webSocket, got: [], closed: null };
  c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
  c.ws.addEventListener('close', (e) => { c.closed = e.code; });
  c.send = (m) => c.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  c.pk = () => c.got.filter((m) => m.t === 'pk' || m.t === 'pkg');
  c.lead = () => c.got.filter((m) => m.t === 'pk' && m.k === 'L').at(-1);
  await settle(env);
  return c;
}
const NEAR = [centre.x + 5, 0, centre.z + 5], FAR = [centre.x + PADDOCK_SYNC.leave + 50, 0, centre.z];
const place = async (env, c, p) => { now += 250; c.send({ p, r: 0 }); await settle(env); };
const say = async (env, c, m, wait = 1000) => { now += wait; c.send(m); await settle(env); };
const snap = (x = 1) => ({ t: 'pk', k: 's', p: [[centre.x + x, centre.z, 0.5, 2, 0], [centre.x - x, centre.z + 3, -1, 1, 0]], h: [1, 0.4] });
const grass = (W = 111, H = 81) => ({ t: 'pkg', W, H, v: 'A/'.repeat(Math.ceil(W * H / 2)).slice(0, W * H) });

test('cleanPaddock validates snapshots, grass and pats', () => {
  assert.deepEqual(cleanPaddock(JSON.stringify({ t: 'pk', k: 'pet', i: 1 })), { k: 'pet', i: 1 });
  assert.deepEqual(cleanPaddock(JSON.stringify(snap())).p[0], [centre.x + 1, centre.z, 0.5, 2, 0].map((v) => Math.round(v * 100) / 100));
  assert.equal(cleanPaddock(JSON.stringify(grass())).v.length, 111 * 81);
  for (const bad of [{ t: 'pk', k: 'pet', i: 2 }, { t: 'pk', k: 'pet', i: -1 }, { t: 'pk', k: 's', p: [[0, 0, 0, 0, 0]] }, { t: 'pk', k: 's', p: [[0, 0, 0, 6, 0], [0, 0, 0, 0, 0]] },
    { t: 'pk', k: 's', p: [[0, 0, 0, 0, 2], [0, 0, 0, 0, 0]] }, { ...snap(), h: [2] }, { t: 'pk', k: 'x' }, { t: 'pkg', W: 2, H: 2, v: 'AAA' }, { t: 'pkg', W: 2, H: 2, v: 'AA<A' },
    { t: 'pkg', W: 200, H: 200, v: 'A'.repeat(40000) }]) assert.equal(cleanPaddock(JSON.stringify(bad)), null, JSON.stringify(bad));
  assert.equal(cleanPaddock('nope'), null);
  assert.ok(JSON.stringify(snap(1000.123)).length < PLAYERS.maxBytes, 'a snapshot fits the ordinary message size');
});

test('the first player at the paddock leads; snapshots and grass reach the others present only', async () => {
  const env = setup(), a = await connect(env), b = await connect(env), far = await connect(env);
  await place(env, far, FAR);
  await place(env, a, NEAR);
  assert.deepEqual(a.lead(), { t: 'pk', k: 'L', n: 0 }, 'alone: leads with nobody to tell');
  await place(env, b, NEAR);
  assert.deepEqual(a.lead(), { t: 'pk', k: 'L', n: 1, need: true }, 'B arrives: A is told to send the grass');
  assert.equal(b.lead(), undefined, 'B follows');
  await say(env, a, snap());
  assert.deepEqual(b.pk().at(-1), { t: 'pk', k: 's', ...cleanPaddock(JSON.stringify(snap())) });
  await say(env, a, grass());
  assert.equal(b.pk().at(-1).t, 'pkg'); assert.equal(b.pk().at(-1).v.length, 111 * 81);
  assert.equal(a.closed, null, 'the big grass message is accepted');
  assert.equal(far.pk().length, 0, 'a player far away gets nothing');
  const n = b.pk().length;
  await say(env, b, snap(3)); await say(env, far, snap(3));
  assert.equal(a.pk().filter((m) => m.k === 's').length, 0, 'a follower cannot send snapshots');
  await say(env, a, snap()); assert.equal(b.pk().length, n + 1);
  await say(env, a, snap(), 100); assert.equal(b.pk().length, n + 1, 'too fast a snapshot is dropped');
});

test('a pat goes to the leader with the patter\'s own position', async () => {
  const env = setup(), a = await connect(env), b = await connect(env);
  await place(env, a, NEAR); await place(env, b, [NEAR[0] + 2, 0, NEAR[2]]);
  await say(env, b, { t: 'pk', k: 'pet', i: 1, x: 999 });
  assert.deepEqual(a.pk().at(-1), { t: 'pk', k: 'pet', i: 1, x: Math.round((NEAR[0] + 2) * 100) / 100, z: Math.round(NEAR[2] * 100) / 100 });
  await say(env, b, { t: 'pk', k: 'pet', i: 0 }, 100);
  assert.equal(a.pk().filter((m) => m.k === 'pet').length, 1, 'too fast a pat is dropped');
});

test('the lead passes on when the leader walks away or disconnects', async () => {
  const env = setup(), a = await connect(env), b = await connect(env), c = await connect(env);
  await place(env, a, NEAR); await place(env, b, NEAR); await place(env, c, NEAR);
  assert.equal(a.lead().n, 2);
  await place(env, a, FAR);
  assert.deepEqual(a.lead(), { t: 'pk', k: 'L', off: true });
  assert.deepEqual(b.lead(), { t: 'pk', k: 'L', n: 1 }, 'B (the next to arrive) leads');
  await say(env, a, snap()); assert.equal(c.pk().filter((m) => m.k === 's').length, 0, 'the old leader is no longer relayed');
  b.ws.close(1000); await settle(env);
  assert.deepEqual(c.lead(), { t: 'pk', k: 'L', n: 0 }, 'C leads when B disconnects');
  await place(env, a, NEAR);
  assert.deepEqual(c.lead(), { t: 'pk', k: 'L', n: 1, need: true });
});

test('an oversized message of another kind is still refused', async () => {
  const env = setup(), a = await connect(env);
  a.send(JSON.stringify({ t: 'pk', k: 's', pad: 'x'.repeat(PLAYERS.maxBytes) })); await settle(env);
  assert.equal(a.closed, 1009);
});
