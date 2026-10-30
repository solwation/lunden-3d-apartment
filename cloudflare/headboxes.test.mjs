// #974: ordinary shared-box gameplay through the actual PlayerRoom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { COMBAT, cleanShot } from './players.js';
import { avatarLook, PVP_HEAD_BOXES as HB, rifleBoxHeadContact } from '../src/config.js';

installRuntime();
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const settle = async env => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } };

test('version 2 head boxes keep authoritative damage, movement, recovery and lethal receipt', async () => {
  const oldNow = Date.now;
  let now = Date.UTC(2026, 9, 14, 12);
  Date.now = () => now;
  const env = { ADMIN_TOKEN: 'tok' };
  env.PLAYERS = fakeNamespace(PlayerRoom, env);
  const connect = async () => {
    const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
    const ws = r.webSocket, got = [];
    ws.addEventListener('message', e => { if (e.data !== 'q') got.push(JSON.parse(e.data)); });
    await settle(env);
    return { ws, got, id: got[0].i, send: m => ws.send(JSON.stringify(m)) };
  };
  try {
    const a = await connect(), b = await connect();
    const tall = avatarLook(b.id).tall;
    let state = { p: [2, 0, 0], r: 0, h: 'rifle' };
    a.send({ p: [0, 0, 0], r: 0, h: 'rifle' }); b.send(state); await settle(env);
    const shoot = async (y, hc = true, z = 0) => {
      now += 1000;
      const o = [0, Math.round(y * 100) / 100, z], d = [1, 0, 0];
      const contact = rifleBoxHeadContact(b.id, state, o, d, COMBAT.weapons.rifle.range);
      const shot = { t: 'a', w: 'rifle', o, d, to: b.id, ...(hc ? { hc: [HB.version, ...(contact?.point ?? [2, y, z])] } : {}) };
      a.send(shot); await settle(env);
      return a.got.filter(m => m.t === 'hit').at(-1);
    };
    for (const y of [1.55, 1.64, 1.72]) {
      const hit = await shoot(y * tall);
      assert.equal(hit.head, true, `level ${y} removes two lives`);
    }
    assert.equal(b.got.filter(m => m.t === 'hurt').at(-1).l, 4);
    const body = await shoot(.9, false);
    assert.equal(body.head, undefined); assert.equal(body.l, 3);
    const missHead = await shoot(.9, true);
    assert.equal(missHead.head, undefined, 'a head claim on a torso ray remains body damage');
    assert.equal(missHead.l, 2);
    for (let i = 0; i < 2; i++) { now += COMBAT.recoverMs / 2; a.ws.send('p'); b.ws.send('p'); await settle(env); }
    await env.PLAYERS.ctx('world').fireAlarm(); await settle(env);
    // Ordinary states retain the recovered life before the next hit.
    a.send({ p: [0, 0, 0], r: 0, h: 'rifle' }); b.send(state); await settle(env);
    assert.equal(b.got.filter(m => m.t === 'life').at(-1)?.l, 3);
    state = { ...state, r: 1.2, p: [2.1, 0, 0] }; b.send(state); await settle(env);
    const turned = await shoot(1.64 * tall);
    assert.equal(turned.head, true); assert.equal(turned.l, 1, 'turn and movement require no anatomy history');
    state = { ...state, c: true }; now += 1000; b.send(state); await settle(env);
    let crouchRay;
    for (let y = 1; y < 1.7 && !crouchRay; y += .02) {
      for (let z = -.5; z < .5; z += .02) {
        if (rifleBoxHeadContact(b.id, state, [0, y, z], [1, 0, 0], 40)) { crouchRay = [y, z]; break; }
      }
    }
    assert.ok(crouchRay);
    const lethal = await shoot(crouchRay[0], true, crouchRay[1]);
    assert.equal(lethal.head, true); assert.equal(lethal.dead, true); assert.equal(typeof lethal.kill, 'string');
    assert.equal(lethal.award.points, 5); assert.equal(lethal.award.seq, 7);
    assert.equal(b.got.filter(m => m.t === 'hurt').at(-1).dead, true);
    const target = env.PLAYERS.ctx('world').getWebSockets().find(ws => ws.deserializeAttachment().i === b.id);
    assert.equal(target.deserializeAttachment().l, COMBAT.lives);
    a.ws.close(); b.ws.close();
  } finally { Date.now = oldNow; }
});

test('cleanShot accepts legacy and box contact versions, drops unknown versions', () => {
  const input = { t: 'a', w: 'rifle', o: [0, 1.6, 0], d: [1, 0, 0], hc: [2, 2, 1.6, 0] };
  assert.equal(cleanShot(JSON.stringify(input)).hc[0], 2);
  assert.equal(cleanShot(JSON.stringify({ ...input, hc: [1, 2, 1.6, 0] })).hc[0], 1);
  assert.equal(cleanShot(JSON.stringify({ ...input, hc: [9, 2, 1.6, 0] })).hc, undefined);
});


test('straight weapon box heads retain body fallback, legacy packets, origin/range and flame direction', async () => {
  const oldNow = Date.now; let now = Date.UTC(2026, 9, 14, 13); Date.now = () => now;
  const env = {}; env.PLAYERS = fakeNamespace(PlayerRoom, env);
  const connect = async () => {
    const response = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
    const ws = response.webSocket, got = []; ws.addEventListener('message', e => { if (e.data !== 'q') got.push(JSON.parse(e.data)); });
    await settle(env); return { ws, got, id: got[0].i, send: m => ws.send(JSON.stringify(m)) };
  };
  try {
    for (const w of ['wand', 'web', 'saber']) {
      const a = await connect(), b = await connect(), tall = avatarLook(b.id).tall;
      const feet = w === 'jetpack' ? [2, 2, 0] : [0, 0, 0];
      a.send({ p: feet, r: 0, h: w }); b.send({ p: [2, 0, 0], r: 0, h: 'rifle' }); await settle(env);
      const base = { t: 'a', w, to: b.id, o: w === 'jetpack' ? [2, 3, 0] : [0, Math.round(1.64*tall*100)/100, 0], d: w === 'jetpack' ? [0, -1, 0] : [1, 0, 0], hc: [2, 2, 1.6, 0] };
      const fire = async shot => { now += 1100; a.send(shot); await settle(env); return a.got.filter(m => m.t === 'hit').at(-1); };
      assert.equal((await fire(base)).l, 8, w+' actual box costs two');
      assert.equal((await fire({ ...base, hc: undefined })).l, 7, w+' cached no-hc stays one');
      const bad = w === 'jetpack' ? { ...base, d: [1, 0, 0] } : { ...base, o: [0, .9, 0] };
      assert.equal((await fire(bad)).head, undefined, w+' a contact claim cannot turn a body ray into a head');
      const origin = { ...base, o: [0, 20, 0] };
      assert.equal((await fire(origin)).head, undefined, w+' far origin cannot award head');
      const count = a.got.filter(m => m.t === 'hit').length;
      a.send(base); await settle(env);
      assert.equal(a.got.filter(m => m.t === 'hit').length, count, w+' existing attack rate remains enforced');
      a.ws.close(); b.ws.close(); await settle(env);
    }
  } finally { Date.now = oldNow; }
});
