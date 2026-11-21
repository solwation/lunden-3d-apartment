// #2292: the fixed wire fixtures of the players' room (/players), played against the real Worker + PlayerRoom on Node with the
// runtime stand-ins in devws.mjs. The same file (tools/unreal-engine/wire/players.json, rules in its README) drives the Unreal
// client's test, so a protocol change that breaks it shows up here first. Read-only use of players.js: nothing here changes it.
//   node --test cloudflare/playerswire.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { PLAYERS, CLOSE, COMBAT } from './players.js';
import { AWAY } from '../src/config.js';
import { webToUnrealRounded, unrealToWeb, webYawToUnrealYaw, unrealYawToWebYaw } from '../tools/unreal-engine/coordinates.mjs';

const fixture = JSON.parse(readFileSync(new URL('../tools/unreal-engine/wire/players.json', import.meta.url), 'utf8'));
installRuntime();
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
const deg = (v) => (v * 180) / Math.PI, rad = (d) => (d * Math.PI) / 180;
const r2 = (v) => Math.round(v * 100) / 100 + 0;

test('the fixture\'s limits and constants are the Worker\'s', () => {
  const L = fixture.limits;
  assert.equal(L.maxBytes, PLAYERS.maxBytes);
  assert.equal(L.perSecond, PLAYERS.perSecond);
  assert.equal(L.strikes, PLAYERS.strikes);
  assert.equal(L.idleMs, PLAYERS.idleMs);
  assert.equal(L.maxPlayers, PLAYERS.maxPlayers);
  assert.equal(L.nameMax, PLAYERS.nameMax);
  assert.equal(L.monthlyCap, PLAYERS.monthlyCap);
  assert.equal(L.msgPerRequest, PLAYERS.msgPerRequest);
  assert.equal(L.awayMs, AWAY.ms);
  assert.equal(L.lives, COMBAT.lives);
  assert.deepEqual(fixture.closeCodes, { ...CLOSE });
  assert.deepEqual(fixture.heartbeat, { send: 'p', reply: 'q' });
});

test('coordinate cases agree with tools/unreal-engine/coordinates.mjs (both directions)', () => {
  for (const c of fixture.coordinates.cases) {
    const what = c.name;
    assert.deepEqual(webToUnrealRounded(c.web.p), c.unreal.feetCm, `${what}: feet`);
    assert.equal(r2(webYawToUnrealYaw(deg(c.web.r))), c.unreal.yawDeg, `${what}: yaw`);
    if (c.web.look) {
      assert.equal(r2(deg(c.web.look[1])), c.unreal.pitchDeg, `${what}: pitch`);
      assert.equal(r2(-deg(c.web.look[0])), c.unreal.headYawDeg, `${what}: head yaw (relative, sense flipped)`);
    }
    // Unreal → web, as a Windows client would send it (rounded like the web client and the room: 0.01 m, 0.01 rad)
    assert.deepEqual(unrealToWeb(c.unreal.feetCm).map(r2), c.web.p.map(r2), `${what}: feet back`);
    const back = r2(rad(unrealYawToWebYaw(c.unreal.yawDeg)));
    assert.ok(Math.abs(Math.atan2(Math.sin(back - c.web.r), Math.cos(back - c.web.r))) <= 0.006, `${what}: yaw back (${back} vs ${c.web.r})`);
  }
});

const sub = (v, ids) => {
  if (typeof v === 'string' && v.startsWith('$')) { assert.ok(v.slice(1) in ids, `unknown placeholder ${v}`); return ids[v.slice(1)]; }
  if (Array.isArray(v)) return v.map((x) => sub(x, ids));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x, ids)]));
  return v;
};
const relevant = (m) => m === 'q' || fixture.relevantTypes.includes(m?.t);
const textOf = (step) => (step.text !== undefined ? step.text : JSON.stringify(step.json));

for (const sc of fixture.scenarios) {
  test(`scenario ${sc.id}: ${sc.title}`, async () => {
    const realNow = Date.now; let now = Date.parse(fixture.clock.start); Date.now = () => now;
    const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env);
    const clients = {}, ids = {};
    try {
      for (const [k, step] of sc.steps.entries()) {
        const at = `${sc.id} step ${k} (${step.op}${step.client ? ` ${step.client}` : ''})`;
        if (step.op === 'connect') {
          const q = new URLSearchParams({ ...(step.name !== undefined ? { n: step.name } : {}), ...(step.token ? { a: step.token } : {}) });
          const r = await worker.fetch(new Request(`https://w/players${q.size ? `?${q}` : ''}`, { headers: { Upgrade: 'websocket', ...(step.origin ? { Origin: step.origin } : {}) } }), env);
          assert.equal(r.status, step.status ?? 101, `${at}: HTTP status`);
          const c = { ws: r.webSocket, got: [], closed: null };
          c.ws?.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
          c.ws?.addEventListener('close', (e) => { c.closed = e.code; });
          clients[step.client] = c;
          await settle(env);
          const w = c.got.find((m) => m?.t === 'w');
          if (w) ids[step.client] = w.i;
        } else if (step.op === 'send') {
          for (const t of step.texts ?? [textOf(step)]) clients[step.client].ws.send(typeof t === 'string' ? t : JSON.stringify(t));
          await settle(env);
        } else if (step.op === 'close') {
          clients[step.client].ws.close(step.code, step.reason ?? '');
          await settle(env);
        } else if (step.op === 'advance') {
          now += step.ms;
        } else if (step.op === 'setBill') { // Node-only set-up: the month's counter just below the cap
          const room = env.PLAYERS.object('world');
          await room.usage(); room.bill.req = step.req; room.bill.msg = step.msg; await room.save();
        } else if (step.op === 'expect') {
          const c = clients[step.client];
          if (step.messages) {
            const got = c.got.filter(relevant), want = sub(step.messages, ids);
            assert.equal(got.length, want.length, `${at}: got ${JSON.stringify(got)}`);
            for (const [j, m] of want.entries()) {
              if (m === 'q' || m.t !== 'w') { assert.deepEqual(got[j], m, `${at}: message ${j}`); continue; }
              for (const [key, v] of Object.entries(m)) assert.deepEqual(got[j][key], v, `${at}: welcome .${key}`); // the welcome: these keys exactly, the others ignored
            }
          }
          if ('closed' in step) assert.equal(c.closed, step.closed, `${at}: close code`);
          if (step.sameId) assert.equal(ids[step.client], ids[step.sameId], `${at}: the same id as ${step.sameId}`);
          if (step.newId) assert.notEqual(ids[step.client], ids[step.newId], `${at}: a new id, not ${step.newId}'s`);
          c.got.length = 0;
        } else assert.fail(`${at}: unknown op`);
      }
      for (const c of Object.values(clients)) if (c.ws?.readyState === 1) c.ws.close(1000);
      await settle(env);
    } finally { Date.now = realNow; }
  });
}
