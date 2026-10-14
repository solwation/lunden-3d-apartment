import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepArrow, bowSegments, bowHeadContact } from '../src/bowflight.js';
import { avatarLook, BOW, rifleBoxHeadContact } from '../src/config.js';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { COMBAT } from './players.js';

test('arrow step preserves original gravity-before-translation at representative actual frame times',()=>{
 for(const dt of [1/60,.02,.037]) {
  const p={x:1,y:2,z:3},v={x:28,y:4,z:-2},oldV=4-BOW.gravity*dt;
  stepArrow(p,v,dt);assert.deepEqual(v,{x:28,y:oldV,z:-2});
  assert.deepEqual(p,{x:1+28*dt,y:2+oldV*dt,z:3-2*dt});
 }
});
test('bow follows falling physical arrow-tip segments within original range and flight life',()=>{
 const seed='bow-head',state={p:[10,0,0],r:0};
 let shot;
 for(let y=1.8;y<3&&!shot;y+=.01){const candidate={t:'a',w:'bow',o:[0,Math.round(y*100)/100,0],d:[1,0,0],s:28};if(bowHeadContact(seed,state,candidate,60))shot=candidate;}
 assert.ok(shot);assert.equal(rifleBoxHeadContact(seed,state,shot.o,shot.d,60),null,'straight sight line is above the head');
 assert.equal(bowHeadContact(seed,state,shot,5),null);
 const pieces=[...bowSegments(shot,5)];assert.ok(Math.abs(pieces.reduce((s,p)=>s+p.length,BOW.len)-5)<1e-8);
 assert.ok(pieces[0].origin[0]>.7&&pieces[0].origin[1]<shot.o[1],'tip begins ahead and already follows rotated velocity');
 assert.ok(pieces.at(-1).end[1]<pieces[0].origin[1]);
 assert.equal([...bowSegments({...shot,s:100},60)].length,0);
 assert.equal(bowHeadContact(seed,null,shot,60),null);
});
test('an earlier capsule body contact prevents a later arrow-tip head claim',()=>{
 const seed='bow-head',state={p:[2,0,0],r:0},norm=Math.hypot(2,1);
 const shot={t:'a',w:'bow',o:[0,.6,0],d:[2/norm,1/norm,0],s:28};
 assert.ok([...bowSegments(shot,60)].some(s=>rifleBoxHeadContact(seed,state,s.origin,s.direction,s.length)),'same arc reaches a later logical head');
 assert.equal(bowHeadContact(seed,state,shot,60),null,'first body wins');
});

installRuntime();
const settle=async env=>{for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,0));await env.PLAYERS.ctx('world').idle();}};
test('bow room keeps authoritative 2/1 damage, legacy, forged-head/rate/origin checks, recovery and one lethal UUID',async()=>{
 const realNow=Date.now;let now=Date.UTC(2026,9,14,13);Date.now=()=>now;
 const env={};env.PLAYERS=fakeNamespace(PlayerRoom,env);
 const connect=async()=>{const res=await worker.fetch(new Request('https://w/players',{headers:{Upgrade:'websocket',Origin:'https://solwation.github.io'}}),env);const ws=res.webSocket,got=[];ws.addEventListener('message',e=>{if(e.data!=='q')got.push(JSON.parse(e.data));});await settle(env);return{ws,got,id:got[0].i,send:m=>ws.send(JSON.stringify(m))};};
 try{
  const a=await connect(),b=await connect();let state={p:[2,0,0],r:0,h:'rifle'};
  a.send({p:[0,0,0],r:0,h:'bow'});b.send(state);await settle(env);
  const tall=avatarLook(b.id).tall;
  const shoot=async(o,hc=true,d=[1,0,0])=>{now+=1000;const shot={t:'a',w:'bow',o,d,s:28,to:b.id,...(hc?{hc:[2,2,1.6,0]}:{})};a.send(shot);await settle(env);return a.got.filter(m=>m.t==='hit').at(-1);};
  const legacy=await shoot([.35,1.64*tall+.04,0],false);assert.equal(legacy.head,undefined);assert.equal(legacy.l,9);
  const socket=env.PLAYERS.ctx('world').getWebSockets().find(s=>s.deserializeAttachment().i===b.id);const saved=socket.deserializeAttachment();saved.l=10;socket.serializeAttachment(saved);
  for(const y of [1.55,1.64,1.72])assert.equal((await shoot([.35,Math.round((y*tall+.04)*100)/100,0])).head,true);
  assert.equal(a.got.filter(m=>m.t==='hit').at(-1).l,4);
  assert.equal((await shoot([.35,.9,0],false)).l,3);
  const forged=await shoot([.35,.9,0]);assert.equal(forged.head,undefined);assert.equal(forged.l,2);
  const count=a.got.filter(m=>m.t==='hit').length;a.send({t:'a',w:'bow',o:[.35,1.64*tall+.04,0],d:[1,0,0],s:28,to:b.id,hc:[2,2,1.6,0]});await settle(env);assert.equal(a.got.filter(m=>m.t==='hit').length,count,'immediate second shot is rate rejected');
  for(let i=0;i<2;i++){now+=COMBAT.recoverMs/2;a.ws.send('p');b.ws.send('p');await settle(env);}await env.PLAYERS.ctx('world').fireAlarm();await settle(env);assert.equal(b.got.filter(m=>m.t==='life').at(-1)?.l,3);
  state={...state,p:[2.1,0,0],r:1.2};a.send({p:[0,0,0],r:0,h:'bow'});b.send(state);await settle(env);const moved=await shoot([.35,1.64*tall+.04,0]);assert.equal(moved.head,true);assert.equal(moved.l,1);
  const lethal=await shoot([.35,1.64*tall+.04,0]);assert.equal(lethal.dead,true);assert.equal(typeof lethal.kill,'string');assert.equal(lethal.l,-1);assert.equal(lethal.award.points,5);assert.equal(socket.deserializeAttachment().l,10);
  const origin=await shoot([.35,20,0]);assert.equal(origin.head,undefined,'distant origin cannot award head');
  a.ws.close();b.ws.close();
 }finally{Date.now=realNow;}
});
