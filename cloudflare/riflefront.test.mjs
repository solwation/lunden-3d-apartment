// The players' room (#666): connection, forwarding, the monthly cost cap, rate / size / player limits, idle close and
// the admin brake. Runs the real Worker + PlayerRoom on Node with the runtime stand-ins in devws.mjs.
//   node --test cloudflare/players.test.mjs
import { test } from 'node:test';
import { PVP_SCORE, SCORE, pvpHitPoints, avatarLook, rifleHeadFrontRegion, rifleHeadContact, rifleSkullEntry, PVP_RIFLE_HEAD as H } from '../src/config.js';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { PLAYERS, CLOSE, COMBAT, CHAT, cleanText, cleanShot } from './players.js';

installRuntime();
const realNow = Date.now;
let now = Date.UTC(2026, 9, 11, 12);
Date.now = () => now;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };

function setup() {
  const env = { ADMIN_TOKEN: 'tok' };
  env.PLAYERS = fakeNamespace(PlayerRoom, env);
  return env;
}
const bill = (env) => env.PLAYERS.ctx('world').data.get(`bill:${new Date(now).toISOString().slice(0, 7)}`) ?? { req: 0, msg: 0 };

async function connect(env, name = '', origin = 'https://solwation.github.io') {
  const r = await worker.fetch(new Request(`https://w/players${name ? `?n=${encodeURIComponent(name)}` : ''}`,
    { headers: { Upgrade: 'websocket', ...(origin ? { Origin: origin } : {}) } }), env);
  const ws = r.webSocket, c = { r, ws, got: [], closed: null };
  ws?.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
  ws?.addEventListener('close', (e) => { c.closed = e.code; });
  c.states = () => c.got.filter((m) => m.t === 's');
  c.send = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  await settle(env);
  return c;
}
const admin = (env, method, what = 'players', token = 'tok') => worker.fetch(new Request(`https://w/admin/${what}`, { method, headers: { Authorization: `Bearer ${token}` } }), env);


test('extra-front four fresh identities: actual Worker head2, body1 forgery, one death receipt and recovery', async()=>{
 for(let style=0;style<4;style++){
  const env=setup(),a=await connect(env),b=await connect(env),id=b.got[0].i,look=avatarLook(id);
  a.send({p:[0,0,-4],r:0,h:'rifle'});b.send({p:[0,0,0],r:0,h:'rifle'});await settle(env);now+=1000;
  const state={p:[0,0,0],r:0},o=[0,1.62,-4],w=[.93,1,1.08][look.build],target=[-.068*w,(H.headY+.09)*look.tall,0],v=target.map((x,i)=>x-o[i]),len=Math.hypot(...v),d=v.map(x=>+ (x/len).toFixed(3)),unit=d.map(x=>x/Math.hypot(...d)),entry=rifleSkullEntry(id,state,o,d),hc=[1,...o.map((x,i)=>+(x+unit[i]*entry).toFixed(3))],shot={t:'a',w:'rifle',o,d,to:id,hc};
  assert.equal(rifleHeadFrontRegion(id,state,hc.slice(1),o,d),true);assert.equal(rifleHeadFrontRegion(id,state,hc.slice(1)),false);
  assert.equal(rifleHeadContact(id,state,shot,[0,0,-4],40,4),true);assert.ok(Buffer.byteLength(JSON.stringify(shot))<=PLAYERS.maxBytes);
  a.send(shot);await settle(env);let hit=a.got.filter(x=>x.t==='hit').at(-1);assert.equal(hit.head,true);assert.equal(hit.l,8);assert.equal(hit.award.points,5);
  now+=1000;a.send({...shot,hc:[2,...hc.slice(1)],head:true,damage:999});await settle(env);hit=a.got.filter(x=>x.t==='hit').at(-1);assert.equal(hit.head,undefined);assert.equal(hit.l,7);
  for(let j=0;j<6;j++){now+=1000;a.send({...shot,hc:undefined});await settle(env);}assert.equal(a.got.filter(x=>x.t==='hit').at(-1).l,1);
  now+=1000;a.send(shot);await settle(env);hit=a.got.filter(x=>x.t==='hit').at(-1);assert.equal(hit.dead,true);assert.equal(hit.head,true);assert.equal(hit.award.points,5);assert.equal(typeof hit.kill,'string');assert.equal(b.got.filter(x=>x.t==='hurt').at(-1).dead,true);
  now+=1000;a.send({...shot,hc:undefined});await settle(env);assert.equal(a.got.filter(x=>x.t==='hit').at(-1).l,9);
  now+=60000;for(const ws of env.PLAYERS.ctx('world').getWebSockets())ws.autoAt=new Date(now);await env.PLAYERS.ctx('world').fireAlarm();await settle(env);assert.ok(b.got.some(x=>x.t==='life'&&x.l===10));a.ws.close();b.ws.close();await settle(env);
 }
});

test('front cell/ray/wire guards preserve all60 canonical appearances and maximum coordinates',()=>{
 const seen=new Set();for(let n=0;n<10000&&seen.size<60;n++){
  const id='front-'+n,look=avatarLook(id),key=[look.style,look.build,look.tall].join('/');if(seen.has(key))continue;seen.add(key);
  const w=[.93,1,1.08][look.build];for(const shift of [[0,0,0],[4990,4980,4990],[-4990,-4980,-4990]]){
   const state={p:shift,r:0},o=[shift[0],shift[1]+1.62,shift[2]-4],target=[shift[0]-.068*w,shift[1]+(H.headY+.09)*look.tall,shift[2]],v=target.map((x,i)=>x-o[i]),d=v.map(x=>+(x/Math.hypot(...v)).toFixed(3)),unit=d.map(x=>x/Math.hypot(...d)),entry=rifleSkullEntry(id,state,o,d),point=o.map((x,i)=>+(x+unit[i]*entry).toFixed(3)),shot={t:'a',w:'rifle',o,d,hc:[1,...point]};
   assert.equal(rifleHeadFrontRegion(id,state,point,o,d),true);assert.equal(rifleHeadContact(id,state,shot,[shift[0],shift[1],shift[2]-4],40,4),true);
   for(const badRay of [[0,1,0],[1,0,0],[0,0,-1],[0,0,0],[NaN,0,1]])assert.equal(rifleHeadFrontRegion(id,state,point,o,badRay),false);
   assert.equal(rifleHeadFrontRegion(id,{...state,c:true},point,o,d),false);assert.equal(rifleHeadFrontRegion(id,state,point,undefined,d),false);
   const snapped=cleanShot(JSON.stringify(shot));assert.deepEqual(snapped.hc,shot.hc);assert.deepEqual(snapped.d,d);assert.equal(Buffer.byteLength(JSON.stringify(shot))<=256,true);
  }
 }assert.equal(seen.size,60);
});
