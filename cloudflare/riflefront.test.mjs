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

function frontWire(id,state={p:[0,0,0],r:0}) {
 const look=avatarLook(id),width=[.93,1,1.08][look.build],c=Math.cos(state.r),s=Math.sin(state.r),turn=([x,y,z])=>[c*x+s*z,y,-s*x+c*z],o=turn([0,1.62,-4]).map((v,i)=>+(v+state.p[i]).toFixed(2)),point=turn([-.068*width,(H.headY+.09)*look.tall,0]).map((v,i)=>v+state.p[i]),v=point.map((x,i)=>x-o[i]),d=v.map(x=>+(x/Math.hypot(...v)).toFixed(3)),unit=d.map(x=>x/Math.hypot(...d)),t=rifleSkullEntry(id,state,o,d);
 return {t:'a',w:'rifle',to:id,o,d,hc:[1,...o.map((x,i)=>+(x+unit[i]*t).toFixed(3))]};
}
async function historyFixture(initial=0) {
 const env=setup(),a=await connect(env),b=await connect(env),id=b.got[0].i,server=b.ws.peer;
 assert.equal(server.deserializeAttachment().turned,false,'known history initialized at NEW connection, before state');
 b.send({p:[0,0,0],r:initial,h:'rifle'});a.send({p:[0,0,-4],r:0,h:'rifle'});await settle(env);now+=1000;
 const shoot=async()=>{const state=server.deserializeAttachment().s,wire=frontWire(id,state),feet=[wire.o[0],wire.o[1]-1.62,wire.o[2]];a.send({p:feet,r:0,h:'rifle'});await settle(env);now+=1000;a.send(wire);await settle(env);return a.got.filter(x=>x.t==='hit').at(-1);};
 const close=async()=>{a.ws.close();b.ws.close();await settle(env);};return{env,a,b,id,server,shoot,close};
}
test('front private history: first heading, invalid/rounded/rate-rejected states, monotone turn and hibernation',async()=>{
 const f=await historyFixture(1.23);assert.equal(f.server.deserializeAttachment().turned,false);
 const before=await f.shoot();assert.equal(before.head,true);assert.equal(before.l,8);
 f.b.send({p:[0,0,0],r:'invalid',h:'rifle',turned:false});await settle(f.env);assert.equal(f.server.deserializeAttachment().turned,false);
 now+=1000;f.b.send({p:[0,0,0],r:1.23001,h:'rifle',turned:true});await settle(f.env);assert.equal(f.server.deserializeAttachment().turned,false,'same CLEAN r2 heading is not a turn');
 now+=1000;for(let i=0;i<PLAYERS.perSecond;i++)f.b.send({p:[0,0,0],r:1.23,h:'rifle'});f.b.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(f.env);assert.equal(f.server.deserializeAttachment().turned,false,'rate-rejected heading cannot corrupt private history');
 now+=1000;f.b.send({p:[0,0,0],r:3.14,h:'rifle',turned:false});await settle(f.env);assert.equal(f.server.deserializeAttachment().turned,true);
 const denied=await f.shoot();assert.equal(denied.head,undefined);assert.equal(denied.l,7);
 now+=1000;f.b.send({p:[0,0,0],r:1.23,h:'rifle',turned:false});await settle(f.env);assert.equal(f.server.deserializeAttachment().turned,true,'turning back cannot reset history');
 f.env.PLAYERS.hibernate('world');const resumed=await f.shoot();assert.equal(resumed.head,undefined);assert.equal(resumed.l,6);assert.equal(f.server.deserializeAttachment().turned,true);await f.close();
});
test('front legacy unknown attachments fail closed, including old pending first state; new socket remains eligible',async()=>{
 const f=await historyFixture();let state=f.server.deserializeAttachment();delete state.turned;f.server.serializeAttachment(state);f.env.PLAYERS.hibernate('world');const legacy=await f.shoot();assert.equal(legacy.head,undefined);assert.equal(legacy.l,9);
 state=f.server.deserializeAttachment();state.s=null;delete state.turned;f.server.serializeAttachment(state);now+=1000;f.b.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(f.env);assert.equal(f.server.deserializeAttachment().turned,undefined,'old unknown pending attachment never gains false trusted history');const pending=await f.shoot();assert.equal(pending.head,undefined);await f.close();
 const fresh=await historyFixture(3.14);const hit=await fresh.shoot();assert.equal(hit.head,true);assert.equal(hit.l,8);await fresh.close();
});
test('front accepted greeting permanently suppresses only new front; late observer and client flags cannot reset it',async()=>{
 const f=await historyFixture();const first=await f.shoot();assert.equal(first.head,true);
 now+=1000;f.b.send({t:'g',to:f.a.got[0].i,k:0});await settle(f.env);assert.equal(typeof f.server.deserializeAttachment().gt,'number');
 const observer=await connect(f.env);assert.ok(observer.got[0].ps.some(p=>p.i===f.id));assert.ok(observer.got[0].ps.every(p=>!('turned' in p)&&!('gt' in p)),'history remains PRIVATE, not client authority');
 now+=1000;f.b.send({p:[0,0,0],r:0,h:'rifle',gt:null,turned:false,allowFront:true});await settle(f.env);f.env.PLAYERS.hibernate('world');const denied=await f.shoot();assert.equal(denied.head,undefined);assert.equal(denied.l,7);observer.ws.close();await f.close();
});
test('denied post-turn Front keeps one body-only kill/award/reset and normal recovery without restoring permission',async()=>{
 const f=await historyFixture();assert.equal((await f.shoot()).l,8);now+=1000;f.b.send({p:[0,0,0],r:3.14,h:'rifle'});await settle(f.env);
 const results=[];for(let i=0;i<8;i++)results.push(await f.shoot());assert.ok(results.every(h=>h.head===undefined));assert.equal(results.filter(h=>h.dead).length,1);assert.equal(typeof results.at(-1).kill,'string');assert.equal(results.at(-1).award.seq,9);assert.equal(f.server.deserializeAttachment().l,COMBAT.lives);assert.equal(f.server.deserializeAttachment().turned,true);
 const after=await f.shoot();assert.equal(after.head,undefined);assert.equal(after.l,9);now+=60000;for(const ws of f.env.PLAYERS.ctx('world').getWebSockets())ws.autoAt=new Date(now);await f.env.PLAYERS.ctx('world').fireAlarm();await settle(f.env);assert.equal(f.server.deserializeAttachment().l,COMBAT.lives);assert.equal(f.server.deserializeAttachment().turned,true);await f.close();
});
