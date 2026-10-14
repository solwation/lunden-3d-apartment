import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nerfHeadContact, nerfSegments, nerfBodyContact, nerfPlayerContact } from '../src/nerf.js';
import { avatarLook, rifleBoxHeadContact, PVP_HEAD_BOXES as HB } from '../src/config.js';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { COMBAT } from './players.js';
const seed='nerf-head', state={p:[20,0,0],r:0}, tall=avatarLook(seed).tall;
test('Nerf head follows the falling muzzle arc rather than the sight line',()=>{
  const y=1.64*tall, shot={t:'a',w:'nerf',o:[0,y+4*(20/30)**2/2,0],d:[1,0,0],s:30};
  assert.equal(rifleBoxHeadContact(seed,state,shot.o,shot.d,25),null);
  assert.ok(nerfHeadContact(seed,state,shot,25));
  assert.equal(nerfHeadContact(seed,state,{...shot,o:[0,y,0]},25),null);
  assert.equal(nerfHeadContact(seed,state,shot,19),null);
  assert.equal(nerfHeadContact(seed,state,{...shot,o:[0,.01,0]},25),null);
  assert.equal(nerfHeadContact(seed,state,{...shot,d:[0,0,0]},25),null);
});
test('Nerf segment integration clips floor and travel without changing launch speed',()=>{
  const shot={o:[0,1.6,0],d:[1,0,0],s:30};
  const pieces=[...nerfSegments(shot,25)];
  assert.ok(Math.abs(pieces.reduce((s,p)=>s+p.length,0)-25)<1e-6);
  assert.ok(pieces.at(-1).end[1]<1.6);
  const floor=[...nerfSegments({...shot,o:[0,.01,0]},25)];
  assert.ok(floor.at(-1).end[1]>=.008);
  assert.ok(floor.reduce((s,p)=>s+p.length,0)<25);
});

installRuntime();
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const settle = async env => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } };

test('Nerf head boxes keep authoritative damage, movement, recovery and lethal receipt', async () => {
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
    let state = { p: [2, 0, 0], r: 0, h: 'nerf' };
    a.send({ p: [0, 0, 0], r: 0, h: 'nerf' }); b.send(state); await settle(env);
    const shoot = async (y, hc = true, z = 0) => {
      now += 1000;
      const o = [0, Math.round((y+.01) * 100) / 100, z], d = [1, 0, 0];
      const contact = nerfHeadContact(b.id, state, {t:'a',w:'nerf',o,d}, COMBAT.weapons.nerf.range);
      const shot = { t: 'a', w: 'nerf', o, d, to: b.id, ...(hc ? { hc: [HB.version, ...(contact?.point ?? [2, y, z])] } : {}) };
      a.send(shot); await settle(env);
      return a.got.filter(m => m.t === 'hit').at(-1);
    };
    const rising=[2,.72,0], norm=Math.hypot(...rising);
    now+=1000;
    a.send({t:'a',w:'nerf',o:[0,.9,0],d:rising.map(x=>x/norm),to:b.id,hc:[2,2,1.6,0]}); await settle(env);
    const risingHit=a.got.filter(m=>m.t==='hit').at(-1);
    assert.equal(risingHit.head,undefined,'Worker rejects a forged later-head claim behind the first body contact');
    const count=a.got.filter(m=>m.t==='hit').length;
    a.send({t:'a',w:'nerf',o:[0,1.64*tall+.01,0],d:[1,0,0],to:b.id,hc:[2,2,1.6,0]}); await settle(env);
    assert.equal(a.got.filter(m=>m.t==='hit').length,count,'existing authoritative shot rate still rejects an immediate second hit');
    const legacy = await shoot(1.64*tall, false);
    assert.equal(legacy.head, undefined); assert.equal(legacy.l, 8, 'unversioned cached Nerf client keeps ordinary body damage');
    const attachment = env.PLAYERS.ctx('world').getWebSockets().find(ws => ws.deserializeAttachment().i === b.id);
    const saved = attachment.deserializeAttachment(); saved.l=10; attachment.serializeAttachment(saved);
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
    a.send({ p: [0, 0, 0], r: 0, h: 'nerf' }); b.send(state); await settle(env);
    assert.equal(b.got.filter(m => m.t === 'life').at(-1)?.l, 3);
    state = { ...state, r: 1.2, p: [2.1, 0, 0] }; b.send(state); await settle(env);
    const turned = await shoot(1.64 * tall);
    assert.equal(turned.head, true); assert.equal(turned.l, 1, 'turn and movement require no anatomy history');
    state = { ...state, c: true }; now += 1000; b.send(state); await settle(env);
    let crouchRay;
    for (let y = 1; y < 1.7 && !crouchRay; y += .02) {
      for (let z = -.5; z < .5; z += .02) {
        if (nerfHeadContact(b.id, state, {t:'a',w:'nerf',o:[0,y+.01,z],d:[1,0,0]}, 25)) { crouchRay = [y, z]; break; }
      }
    }
    assert.ok(crouchRay);
    const lethal = await shoot(crouchRay[0], true, crouchRay[1]);
    assert.equal(lethal.head, true); assert.equal(lethal.dead, true); assert.equal(typeof lethal.kill, 'string');
    assert.equal(lethal.award.points, 5); assert.equal(lethal.award.seq, 9);
    assert.equal(b.got.filter(m => m.t === 'hurt').at(-1).dead, true);
    const target = env.PLAYERS.ctx('world').getWebSockets().find(ws => ws.deserializeAttachment().i === b.id);
    assert.equal(target.deserializeAttachment().l, COMBAT.lives);
    a.ws.close(); b.ws.close();
  } finally { Date.now = oldNow; }
});


test('existing generous body capsule survives outside the cosmetic mesh and stops a later head',()=>{
  const target={p:[2,0,0],r:0}, feet=target.p;
  const side={origin:[0,.95,.35],direction:[1,0,0],length:3};
  const old=nerfBodyContact(side.origin,side.direction,side.length,feet);
  const contact=nerfPlayerContact(seed,target,side);
  assert.ok(old!==null && contact && !contact.head);
  assert.equal(contact.distance,old,'ordinary below-neck capsule entry is exactly preserved');
  const d=[2,.72,0],norm=Math.hypot(...d), shot={t:'a',w:'nerf',o:[0,.9,0],d:d.map(x=>x/norm),s:30};
  const segments=[...nerfSegments(shot,25)];
  assert.ok(segments.some(p=>rifleBoxHeadContact(seed,target,p.origin,p.direction,p.length)),'the continued rising path intersects a head box');
  assert.equal(nerfHeadContact(seed,target,shot,25),null,'earlier body contact vetoes that later head on the server');
});
