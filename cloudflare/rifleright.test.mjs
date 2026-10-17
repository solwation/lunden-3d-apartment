// #946: actual Worker immutable greeting RIGHT/back policy and ordinary authoritative receipts.
import { test } from 'node:test';
import { avatarLook, rifleHeadGreetingRightRegion, rifleHeadContact, rifleSkullEntry, PVP_RIFLE_HEAD as H } from '../src/config.js';
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
function rightWire(id,state={p:[0,0,0],r:0}){
 const look=avatarLook(id),w=[.93,1,1.08][look.build],c=Math.cos(state.r),s=Math.sin(state.r),turn=([x,y,z])=>[c*x+s*z,y,-s*x+c*z];
 for(const distance of [3,2,2.5,3.5,4,1.5])for(let yy=.0975;yy<=.10251;yy+=.00025)for(let zz=.0375;zz<=.04251;zz+=.00025){
 const y=(H.headY+yy)*look.tall,o=turn([distance,y,-zz*w]).map((v,i)=>+(v+state.p[i]).toFixed(2)),p=turn([.09*w,y,-zz*w]).map((v,i)=>v+state.p[i]),raw=p.map((v,i)=>v-o[i]),d=raw.map(v=>+(v/Math.hypot(...raw)).toFixed(3)),u=d.map(v=>v/Math.hypot(...d)),entry=rifleSkullEntry(id,state,o,d);if(entry===null)continue;const hc=[1,...o.map((v,i)=>+(v+u[i]*entry).toFixed(3))],shot={t:'a',w:'rifle',o,d,hc,to:id};
 if(rifleHeadGreetingRightRegion(id,state,hc.slice(1),o,d)&&rifleHeadContact(id,state,shot,o,40,4,false,{allowFront:false,allowRear:false,allowGreetingRight:true}))return shot;
 }throw Error('no supported actual snapped profile ray for assigned right appearance');
}
async function fixture(r=0){
 const env=setup(),a=await connect(env),b=await connect(env),id=b.got[0].i,server=b.ws.peer;
 b.send({p:[0,0,0],r,h:'rifle'});await settle(env);now+=1000;
 const send=async(m)=>{now+=1000;b.send(m);await settle(env);};
 const greet=()=>send({t:'g',to:a.got[0].i,k:0});
 const shoot=async(extra={})=>{const shot=rightWire(id,server.deserializeAttachment().s);a.send({p:[shot.o[0],shot.o[1]-1.62,shot.o[2]],r:0,h:'rifle'});await settle(env);now+=1000;a.send({...shot,...extra});await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
 const close=async()=>{a.ws.close();b.ws.close();await settle(env);};return{env,a,b,id,server,send,greet,shoot,close};
}
test('right/back named permission is independent, default-off and preserves original named/legacy branches',()=>{
 const id='right-permission',state={p:[0,0,0],r:.8},shot=rightWire(id,state);
 assert.equal(rifleHeadContact(id,state,shot,shot.o,40,4,false,{allowFront:false,allowRear:false}),false);
 assert.equal(rifleHeadContact(id,state,shot,shot.o,40,4,false,{allowFront:false,allowRear:false,allowGreetingLeft:true,allowGreetingFront:true}),false);
 assert.equal(rifleHeadContact(id,state,shot,shot.o,40,4,false,{allowFront:false,allowRear:false,allowGreetingRight:true}),true);
 assert.equal(rifleHeadContact(id,state,shot,shot.o,40,4,false,false,false),false);
 for(const invalid of [undefined,null,[NaN,0,1],[0,0,0]])assert.equal(rifleHeadGreetingRightRegion(id,state,shot.hc.slice(1),shot.o,invalid),false);
 assert.ok(Buffer.byteLength(JSON.stringify(shot))<=256);assert.equal(rifleHeadContact(id,{...state,c:true},shot,shot.o,40,4,false,{allowFront:false,allowRear:false,allowGreetingRight:true}),false,'shared authoritative contact crouch gate is preserved');
});
test('actual Worker right greeting2HP/self-public HP, repeat/hibernate/latewelcome and unknown legacy stay authoritative',async()=>{
 const f=await fixture(.8);let hit=await f.shoot();assert.equal(hit.head,true);assert.equal(hit.l,8);await f.greet();hit=await f.shoot();assert.equal(hit.head,true);assert.equal(hit.l,6);assert.equal(f.b.got.filter(m=>m.t==='hurt').at(-1).l,6);
 assert.equal(f.server.deserializeAttachment().headPoseFixed,true);assert.equal(f.server.deserializeAttachment().turned,false);await f.greet();f.env.PLAYERS.hibernate('world');hit=await f.shoot();assert.equal(hit.head,true);assert.equal(hit.l,4);
 const late=await connect(f.env);const state=late.got[0].ps.find(s=>s.i===f.id);assert.equal(state.l,4);for(const k of ['gt','headPoseFixed','turned'])assert.equal(k in state,false);late.ws.close();
 for(const field of ['headPoseFixed','turned']){const a=f.server.deserializeAttachment(),old=a[field];delete a[field];f.server.serializeAttachment(a);f.env.PLAYERS.hibernate('world');assert.equal((await f.shoot()).head,undefined);a.l=10;a[field]=old;f.server.serializeAttachment(a);}
 await f.close();
});
test('immutable right branch cannot reset after accepted p/r/c change, return, invalid/rate/client claims',async()=>{
 for(const changed of [{p:[.1,0,0],r:0},{p:[0,0,0],r:.01},{p:[0,0,0],r:0,c:true}]){
 const f=await fixture();await f.greet();assert.equal((await f.shoot()).head,true);await f.send({p:[0,0,0],r:'invalid',headPoseFixed:false});assert.equal(f.server.deserializeAttachment().headPoseFixed,true);
 now+=1000;for(let i=0;i<PLAYERS.perSecond;i++)f.b.send({p:[0,0,0],r:0,h:'rifle'});f.b.send({...changed,h:'rifle'});await settle(f.env);assert.equal(f.server.deserializeAttachment().headPoseFixed,true,'rate-rejected change does not corrupt history');
 await f.send({...changed,h:'rifle'});assert.equal(f.server.deserializeAttachment().headPoseFixed,false);await f.send({p:[0,0,0],r:0,h:'rifle',gt:null,headPoseFixed:true,turned:false,allowGreetingRight:true});f.env.PLAYERS.hibernate('world');assert.equal((await f.shoot({head:true,damage:99})).head,undefined);await f.close();
 }
});
test('one right greeting lethal UUID/award/reset, replay and minute recovery preserve history and fresh identities',async()=>{
 const f=await fixture();await f.greet();const a=f.server.deserializeAttachment();a.l=1;f.server.serializeAttachment(a);const hit=await f.shoot();assert.equal(hit.head,true);assert.equal(hit.l,-1);assert.equal(hit.dead,true);assert.match(hit.kill,/^[0-9a-f-]{36}$/);assert.equal(hit.award.seq,1);assert.equal(f.b.got.filter(m=>m.t==='hurt'&&m.dead).length,1);
 const count=f.a.got.filter(m=>m.t==='hit').length;f.a.send(rightWire(f.id,f.server.deserializeAttachment().s));await settle(f.env);assert.equal(f.a.got.filter(m=>m.t==='hit').length,count);
 assert.equal(f.server.deserializeAttachment().headPoseFixed,true);assert.equal((await f.shoot()).l,8);
 for(const expected of [9,10]){now+=60000;for(const ws of f.env.PLAYERS.ctx('world').getWebSockets())ws.autoAt=new Date(now);await f.env.PLAYERS.ctx('world').fireAlarm();await settle(f.env);assert.ok(f.b.got.some(m=>m.t==='life'&&m.l===expected));}
 assert.equal((await f.shoot()).head,true);assert.equal((await f.shoot({hc:undefined})).head,undefined);await f.close();
 const fresh=await fixture(3.14);await fresh.greet();assert.equal((await fresh.shoot()).head,true);await fresh.close();
});
