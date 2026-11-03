import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGET as T} from '../src/config.js';
import {initialTarget,chooseTargetSpot,advanceTarget,TargetSync,validTargetState} from '../src/targetmove.js';
import {cleanTarget,RoomTarget} from '../cloudflare/target.js';
import {installRuntime,fakeNamespace} from '../cloudflare/devws.mjs';
import worker,{PlayerRoom} from '../cloudflare/worker.js';

test('every candidate is a configured valid spot at 45–55 m, faces shooter; no choices falls back',()=>{
  const from=[0,0,0], origin=initialTarget();
  assert.ok(T.moveSpots.length>20);
  for(const old of [origin,...T.moveSpots.map(([x,z])=>({x,z}))]) {
    const eligible=T.moveSpots.filter(([x,z])=>Math.abs(Math.hypot(x-old.x,z-old.z)-T.moveDist)<=T.moveSlack);
    assert.ok(eligible.length>0,`a next hop exists at ${old.x},${old.z}`);
    const seen=new Set();
    for(let i=0;i<eligible.length;i++) {
      const s=chooseTargetSpot(old,from,()=>i/eligible.length);
      assert.ok(Math.abs(Math.hypot(s.x-old.x,s.z-old.z)-50)<=5);
      assert.ok(-Math.sin(s.rot)*(-s.x)-Math.cos(s.rot)*(-s.z) > 0);
      seen.add(`${s.x},${s.z}`);
    }
    assert.equal(seen.size,eligible.length,'uniform intervals reach every eligible direction/spot');
  }
  assert.deepEqual(chooseTargetSpot(origin,from,()=>0,[]),{x:T.x,z:T.z,rot:Math.atan2(T.x,T.z)});
});
test('50 points trigger once, excess does not trigger a second move; offline and network replica',()=>{
  let moves=0;const sync=new TargetSync(()=>moves++), from={x:0,y:0,z:0};
  sync.hit(40,from);assert.equal(sync.state.points,40);assert.equal(moves,0);
  sync.hit(10,from);assert.equal(moves,1);assert.equal(sync.state.points,0);assert.equal(sync.state.v,1);
  assert.ok(validTargetState(sync.state));
  const sent=[];sync.net={ready:()=>true,send:m=>sent.push(m)};sync.hit(40,from);
  assert.equal(sync.state.points,0);assert.equal(sent[0].v,1);
  assert.equal(sync.receive({...initialTarget(),v:0}),false);
  assert.equal(sync.receive(initialTarget(),true),true,'fresh welcome overrides offline state');
  assert.equal(sync.receive({...sync.state,x:999}),false);
});
test('hit validator rejects spoofed positions, points, revisions and sequence; room deduplicates and limits',()=>{
  assert.deepEqual(cleanTarget('{"t":"tg","pts":40,"v":0,"n":1,"x":999}'),{pts:40,v:0,n:1});
  for(const change of [{pts:50},{pts:7},{v:-1},{n:0},{pts:'10'}])assert.equal(cleanTarget(JSON.stringify({t:'tg',pts:10,v:0,n:1,...change})),null);
  const w1={serializeAttachment(){}},w2={serializeAttachment(){}};const out=[],room=new RoomTarget((ws,text)=>out.push(JSON.parse(text)),()=>[{ws:w1},{ws:w2}],()=>0),a={s:{p:[0,0,0]}};
  room.handle(w1,a,{pts:40,v:0,n:1},1000);room.handle(w1,a,{pts:40,v:0,n:1},1200);assert.equal(room.state.points,40);
  room.handle(w1,a,{pts:10,v:0,n:2},1050);assert.equal(room.state.points,40);
  room.handle(w1,a,{pts:10,v:0,n:2},1200);assert.equal(room.state.v,1);assert.equal(out.length,4);
  room.handle(w1,a,{pts:40,v:0,n:3},1400);assert.equal(room.state.points,0);
});
test('real Worker room broadcasts identical state, welcomes a late joiner and resets an empty room',async()=>{
  installRuntime();const env={ADMIN_TOKEN:'test'};env.PLAYERS=fakeNamespace(PlayerRoom,env);
  const settle=async()=>{for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,0));await env.PLAYERS.ctx('world').idle();}};
  const connect=async()=>{const r=await worker.fetch(new Request('https://w/players',{headers:{Upgrade:'websocket',Origin:'https://solwation.github.io'}}),env),got=[];r.webSocket.addEventListener('message',e=>{if(e.data!=='q')got.push(JSON.parse(e.data))});await settle();return{ws:r.webSocket,got,send:m=>r.webSocket.send(JSON.stringify(m))}};
  const a=await connect(),b=await connect();
  a.send({p:[1,0,20],r:0});await settle();
  a.send({t:'tg',pts:40,v:0,n:1});await settle();await new Promise(r=>setTimeout(r,130));
  a.send({t:'tg',pts:10,v:0,n:2});await settle();
  const last=c=>c.got.filter(m=>m.t==='tg').at(-1),state=last(a);
  assert.equal(state.v,1);assert.equal(state.points,0);assert.deepEqual(last(b),state);
  env.PLAYERS.hibernate('world'); await settle();
  const c=await connect();assert.deepEqual(c.got[0].target,state,'late join after hibernation');
  await new Promise(r=>setTimeout(r,130));a.send({t:'tg',pts:10,v:1,n:3});await settle();
  assert.equal(last(b).points,10,'existing client can still score after wake');
  a.ws.close(1000);b.ws.close(1000);await settle();env.PLAYERS.hibernate('world');await settle();
  const e=await connect();assert.equal(e.got[0].target.points,10,'new joiner attachment also preserves snapshot after old shooters leave');e.ws.close(1000);
  for(const x of [a,b,c])x.ws.close(1000);await settle();const d=await connect();assert.equal(d.got[0].target.v,0);d.ws.close(1000);await settle();
});
