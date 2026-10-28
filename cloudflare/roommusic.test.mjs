// The shared children's-room music (#1624): validation, room-owned transport, stale / fast / outside senders, late welcome,
// mix timing, pause/resume, hibernation and the empty room. Real Worker + PlayerRoom on Node (devws.mjs).
//   node --test cloudflare/roommusic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { PLAYERS, cleanMusic } from './players.js';
import { PLAYROOM, MUSIC, SONOS, PLAYROOM_TRACKS } from '../src/config.js';

installRuntime();
let now = Date.UTC(2026, 9, 26, 12);
Date.now = () => now;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };
const setup = () => { const env = { ADMIN_TOKEN: 'tok' }; env.PLAYERS = fakeNamespace(PlayerRoom, env); return env; };
async function connect(env) {
  const r = await worker.fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
  const c = { ws: r.webSocket, got: [] };
  c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.mus = () => c.got.filter((m) => m.t === 'mus');
  c.last = () => c.mus().at(-1);
  await settle(env);
  return c;
}
const ROOM = [PLAYROOM.x + 1, 0, PLAYROOM.z + 1], OUT = [0, 0, 0];
const place = async (env, c, p) => { now += 250; c.send({ p, r: 0 }); await settle(env); };
const cmd = async (env, c, m, wait = 700) => { now += wait; c.send({ t: 'mus', ...m }); await settle(env); };
const N = PLAYROOM_TRACKS.length;
const room = (env) => env.PLAYERS.object('world');

test('cleanMusic validates keys and track index', () => {
  assert.deepEqual(cleanMusic('{"t":"mus","k":"p"}'), { k: 'p' });
  assert.deepEqual(cleanMusic('{"t":"mus","k":"n","ix":3}'), { k: 'n', ix: 3 });
  assert.deepEqual(cleanMusic('{"t":"mus","k":"n","ix":3,"to":5}'), { k: 'n', ix: 3, to: 5 });
  for (const bad of ['{"t":"mus"}', '{"t":"mus","k":"x"}', `{"t":"mus","k":"n","ix":${N}}`, '{"t":"mus","k":"n","ix":-1}', '{"t":"mus","k":"n","ix":"1"}', '{"t":"mus","k":"n","ix":1.5}', `{"t":"mus","k":"n","ix":3,"to":${N}}`, '{"t":"mus","k":"n","ix":3,"to":-1}', 'nope', '{"t":"pool","k":"p"}']) assert.equal(cleanMusic(bad), null, bad);
});

test('play/pause/next/mix/off are room-owned and reach only players inside', async () => {
  const env = setup(), a = await connect(env), b = await connect(env), far = await connect(env);
  await place(env, a, ROOM); await place(env, b, ROOM); await place(env, far, OUT);
  await cmd(env, far, { k: 'p' }); assert.equal(a.mus().length, 0, 'a sender outside the room is ignored');
  await cmd(env, a, { k: 'p' });
  assert.deepEqual(a.last(), { t: 'mus', st: 'playing', ix: 0, pos: 0 }); assert.deepEqual(b.last(), a.last()); assert.equal(far.mus().length, 0);
  now += 5000; await cmd(env, b, { k: 'n', ix: 0, to: 7 });
  assert.equal(a.last().ix, 7, 'next with specific destination to sets track 7'); assert.equal(a.last().pos, 0); assert.deepEqual(a.last(), b.last());
  now += 5000; await cmd(env, b, { k: 'n', ix: 7 });
  assert.equal(a.last().ix, 8); assert.equal(a.last().pos, 0); assert.deepEqual(a.last(), b.last());
  await cmd(env, a, { k: 'n', ix: 7 }); assert.equal(a.last().ix, 8, 'a stale next (old index) is refused with a resync'); assert.equal(b.last().ix, 8);
  const before = b.mus().length;
  now += 2000; await cmd(env, a, { k: 'm', ix: 8, to: 12 });
  assert.equal(a.last().ix, 8); assert.deepEqual(a.last().mx, { to: 12, el: 0 }); assert.equal(b.mus().length, before + 1);
  await cmd(env, b, { k: 'n', ix: 8 }); assert.deepEqual(b.last().mx.to, 12, 'refused while mixing');
  assert.ok(b.last().mx.el > 0, 'the resync carries the elapsed fade');
  now += MUSIC.crossfade * 1000; await cmd(env, b, { k: 'z' });
  assert.equal(b.last().st, 'paused'); assert.equal(b.last().ix, 12); assert.equal(b.last().mx, undefined); assert.ok(b.last().pos >= 1000);
  await cmd(env, a, { k: 'p' }); assert.equal(a.last().st, 'playing');
  await cmd(env, a, { k: 'o' }); assert.deepEqual(b.last(), { t: 'mus', st: 'off', ix: 12, pos: 0 });
  await cmd(env, a, { k: 'n' }); assert.equal(a.last().st, 'off', 'next while off is refused');
});

test('pausing during a mix freezes the fade; resuming continues it', async () => {
  const env = setup(), a = await connect(env); await place(env, a, ROOM);
  await cmd(env, a, { k: 'p' }); now += 3000; await cmd(env, a, { k: 'm' }); now += 2000;
  await cmd(env, a, { k: 'z' }); const paused = a.last(); assert.equal(paused.st, 'paused'); assert.ok(paused.mx.el >= 2000 && paused.mx.el < 3000);
  now += 60_000; await cmd(env, a, { k: 'p' });
  assert.ok(a.last().mx && Math.abs(a.last().mx.el - paused.mx.el) < 1500, 'the fade waited while paused');
});

test('too-fast commands only resync the sender; late and reconnecting players get the current track and position', async () => {
  const env = setup(), a = await connect(env); await place(env, a, ROOM);
  await cmd(env, a, { k: 'p' }); await cmd(env, a, { k: 'n' }); now += 1000;
  a.send({ t: 'mus', k: 'n' }); a.send({ t: 'mus', k: 'n' }); await settle(env); // the 2nd arrives within the rate window
  assert.equal(room(env).mus.ix, 2);
  now += 30_000;
  const b = await connect(env); assert.equal(b.mus().length, 0);
  await place(env, b, ROOM);
  assert.equal(b.last().st, 'playing'); assert.equal(b.last().ix, 2); assert.ok(b.last().pos >= 30_000, 'late welcome carries the position');
  env.PLAYERS.hibernate('world'); await settle(env);
  now += 1000; const c = await connect(env); await place(env, c, ROOM);
  assert.equal(c.last().ix, 2, 'hibernation keeps the transport'); assert.ok(c.last().pos >= 31_000);
});

test('an empty room forgets the music; a paused track is not announced as playing to late joiners', async () => {
  const env = setup(), a = await connect(env); await place(env, a, ROOM);
  await cmd(env, a, { k: 'p' }); await cmd(env, a, { k: 'z' });
  const b = await connect(env); await place(env, b, ROOM); assert.equal(b.last().st, 'paused');
  await place(env, a, OUT); await place(env, b, OUT);
  assert.equal(env.PLAYERS.ctx('world').data.get('mus'), undefined);
  const d = await connect(env); await place(env, d, ROOM); assert.equal(d.mus().length, 0, 'nothing plays in a fresh room');
});

test('messages are tiny and one command is one message', async () => {
  const env = setup(), a = await connect(env); await place(env, a, ROOM);
  await cmd(env, a, { k: 'p' }); await cmd(env, a, { k: 'm' });
  assert.equal(a.mus().length, 2); assert.ok(JSON.stringify(a.last()).length < PLAYERS.maxBytes / 2);
});

test('#1664: bounded physical controls share both decks, faders and positions with observers and late/hibernated joins',async()=>{
 for(const bad of [{c:'gain',s:3,v:1},{c:'cross',v:2},{c:'track',s:0,v:N},{c:'volume',v:1.5},{c:'play',s:'0'},{c:'hack'}])assert.equal(cleanMusic(JSON.stringify({t:'mus',k:'d',...bad})),null);
 const env=setup(),a=await connect(env),b=await connect(env),far=await connect(env);await place(env,a,ROOM);await place(env,b,ROOM);await place(env,far,OUT);
 const control=async m=>cmd(env,a,{k:'d',...m});
 await control({c:'play',s:0});await control({c:'track',s:1,v:7});await control({c:'play',s:1});now+=5000;
 await control({c:'cross',v:.5});await control({c:'gain',s:0,v:.4});await control({c:'volume',v:3});
 assert.deepEqual(a.last(),b.last());assert.equal(far.mus().length,0);assert.deepEqual(b.last().dj.ix,[0,7]);assert.deepEqual(b.last().dj.on,[true,true]);assert.equal(b.last().dj.cross,.5);assert.equal(b.last().dj.gain[0],.4);assert.equal(b.last().dj.volume,3);
 await control({c:'play',s:0});const pos=a.last().dj.pos[0];env.PLAYERS.hibernate('world');await settle(env);now+=5000;
 const late=await connect(env);await place(env,late,ROOM);assert.deepEqual(late.last().dj.on,[false,true]);assert.equal(late.last().dj.pos[0],pos);assert.ok(late.last().dj.pos[1]>5000);
 await control({c:'stop'});assert.equal(b.last().st,'off');assert.deepEqual(b.last().dj.pos,[0,0]);
});
