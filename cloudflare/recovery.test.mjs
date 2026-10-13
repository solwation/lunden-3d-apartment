// #867: production room/attachments, controlled server clock; no extra health model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import { PlayerRoom, COMBAT, PLAYERS, CLOSE } from './players.js';
installRuntime();
let now = Date.UTC(2026, 9, 13, 12);
Date.now = () => now;
const settle = async ctx => { await ctx.idle(); await new Promise(r => setTimeout(r, 0)); };
async function fixture() {
  const ns = fakeNamespace(PlayerRoom), ctx = ns.ctx('world');
  const connect = async () => {
    const r = await ns.object('world').fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket' } }));
    const ws = r.webSocket, got = []; ws.addEventListener('message', e => got.push(JSON.parse(e.data === 'q' ? 'null' : e.data)));
    await settle(ctx); return { ws, got, server: ws.peer };
  };
  const a = await connect(), b = await connect();
  a.ws.send(JSON.stringify({ p: [0, 0, 0], r: 0, h: 'nerf' }));
  b.ws.send(JSON.stringify({ p: [2, 0, 0], r: 0, h: 'nerf' })); await settle(ctx);
  const hit = async () => { a.ws.send(JSON.stringify({ t: 'f', w: 'nerf', to: b.server.deserializeAttachment().i })); await settle(ctx); };
  const alive = () => { for (const ws of ctx.getWebSockets()) ws.autoAt = new Date(now); };
  return { ns, ctx, a, b, hit, alive };
}
test('first minute boundary, more damage keeps phase, hibernation and duplicate alarms, observer sync and cap', async () => {
  const f = await fixture(); const { ctx, b, a, hit, alive, ns } = f;
  await hit(); const due = now + COMBAT.recoverMs;
  assert.equal(await ctx.storage.getAlarm(), due);
  now += 20_000; await hit(); assert.equal(await ctx.storage.getAlarm(), due);
  assert.equal(b.server.deserializeAttachment().l, 8);
  ns.hibernate('world'); now = due - 1; alive(); await ctx.fireAlarm(); await settle(ctx);
  assert.equal(b.server.deserializeAttachment().l, 8);
  now++; alive(); await ctx.fireAlarm(); await settle(ctx);
  assert.equal(b.got.at(-1).l, 9); assert.equal(b.got.at(-1).t, 'life');
  assert.equal(a.got.at(-1).l, 9); assert.equal(a.got.at(-1).t, 's');
  await ctx.fireAlarm(); assert.equal(b.server.deserializeAttachment().l, 9, 'retry grants nothing twice');
  now += COMBAT.recoverMs; alive(); await ctx.fireAlarm(); await settle(ctx);
  assert.equal(b.server.deserializeAttachment().l, 10); assert.equal(await ctx.storage.getAlarm(), null);
  now += 120_000; alive(); await ctx.fireAlarm(); assert.equal(b.server.deserializeAttachment().l, 10);
  await ctx.storage.deleteAlarm(); a.ws.close(); b.ws.close(); await settle(ctx);
});
test('fractional shared damage, delayed execution catches up without overmax, reconnect discards prior connection clock', async () => {
  const { ctx, b, ns, alive } = await fixture();
  const a = b.server.deserializeAttachment(); a.l = 7.5; ns.object('world').recoveryClock(a, now); b.server.serializeAttachment(a);
  await ns.object('world').scheduleRecovery();
  now += 180_000; alive(); await ctx.fireAlarm(); await settle(ctx);
  assert.equal(b.server.deserializeAttachment().l, 10); assert.equal(await ctx.storage.getAlarm(), null);
  b.ws.close(); await settle(ctx);
  const r = await ns.object('world').fetch(new Request('https://w/players', { headers: { Upgrade: 'websocket' } }));
  assert.equal(r.webSocket.peer.deserializeAttachment().healAt, undefined);
  for (const ws of ctx.getWebSockets()) ws.close(); await ctx.storage.deleteAlarm();
});
test('death cancels phase; disconnect and idle cancel alarm; billing brake prevents healing', async () => {
  const { ctx, b, a, hit, ns, alive } = await fixture();
  await hit(); let s = b.server.deserializeAttachment(); s.l = 1; b.server.serializeAttachment(s);
  now += 1000; await hit(); assert.equal(b.server.deserializeAttachment().l, COMBAT.lives);
  assert.equal(b.server.deserializeAttachment().healAt, undefined); assert.equal(await ctx.storage.getAlarm(), null);
  now += 1000; await hit(); b.ws.close(); await settle(ctx); assert.equal(await ctx.storage.getAlarm(), null);
  a.ws.close(); await settle(ctx);
  const f = await fixture(); await f.hit(); now += COMBAT.recoverMs + 1;
  await f.ctx.fireAlarm(); assert.equal(f.ctx.getWebSockets().length, 0, 'idle sockets dropped, never kept alive for healing');
  assert.equal(await f.ctx.storage.getAlarm(), null);
  const g = await fixture(); await g.hit(); now += COMBAT.recoverMs; g.alive();
  const room = g.ns.object('world'); room.bill.req = PLAYERS.monthlyCap - 1;
  await g.ctx.fireAlarm(); assert.equal(g.b.server.readyState, 3); assert.equal(await g.ctx.storage.getAlarm(), null);
  await settle(g.ctx); assert.equal(g.b.got.some(m => m?.t === 'life'), false);
});
test('off→on reschedules same deadline; failed scheduling/retry and ordinary traffic avoid extra writes', async () => {
  const { ns, ctx, a, b, hit, alive } = await fixture();
  await hit(); const due = await ctx.storage.getAlarm();
  await ns.object('world').fetch(new Request('https://w/admin', { method: 'DELETE' }));
  assert.equal(await ctx.storage.getAlarm(), null); assert.equal(ns.object('world').recoveryAlarm, null);
  await ns.object('world').fetch(new Request('https://w/admin', { method: 'PUT' }));
  // Same wall-clock deadline reused after an admin restart must create a real alarm.
  const pair = new WebSocketPair(), socket = pair[1]; ctx.acceptWebSocket(socket);
  socket.serializeAttachment({ i: 'restart', l: 9, healAt: due, t: now, s: { p: [0, 0, 0], r: 0, h: '' } });
  const set = ctx.storage.setAlarm; let writes = 0;
  ctx.storage.setAlarm = async at => { writes++; if (writes === 1) throw Error('storage failure'); return set(at); };
  await assert.rejects(ns.object('world').scheduleRecovery(), /storage failure/);
  assert.equal(ns.object('world').recoveryAlarm, null, 'cache updated only after successful scheduling');
  await ns.object('world').scheduleRecovery(); assert.equal(await ctx.storage.getAlarm(), due);
  await ns.object('world').scheduleRecovery(); assert.equal(writes, 2, 'unchanged phase performs no extra setAlarm write');
  now = due; alive();
  const schedule = ns.object('world').scheduleRecovery;
  ns.object('world').scheduleRecovery = async () => { throw Error('failed after attachment committed'); };
  await assert.rejects(ctx.fireAlarm(), /failed after attachment/);
  assert.equal(socket.deserializeAttachment().l, 10);
  ns.object('world').scheduleRecovery = schedule; await ctx.fireAlarm();
  assert.equal(socket.deserializeAttachment().l, 10, 'retry after committed life cannot grant twice');
  await ctx.storage.deleteAlarm(); socket.close(); await settle(ctx);
});
test('a new hit settles due recovery first, including delayed alarm after lethal-looking health', async () => {
  const { ctx, ns, b, hit, alive } = await fixture(); await hit();
  let state = b.server.deserializeAttachment(); state.l = 1; b.server.serializeAttachment(state);
  now = state.healAt; alive();
  await hit(); await settle(ctx);
  const hurt = b.got.filter(m => m?.t === 'hurt').at(-1);
  assert.equal(hurt.dead, false); assert.equal(hurt.l, 1, 'due one life restored before incoming damage');
  assert.equal(b.server.deserializeAttachment().healAt, now + COMBAT.recoverMs);
  await ctx.storage.deleteAlarm(); for (const socket of ctx.getWebSockets()) socket.close(); await settle(ctx);
});
