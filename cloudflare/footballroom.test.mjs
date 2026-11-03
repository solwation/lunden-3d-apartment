// Source production Worker/PlayerRoom routing, not a direct RoomFootball-only fixture.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {installRuntime,fakeNamespace} from './devws.mjs';import worker,{PlayerRoom} from './worker.js';
import {FOOTBALL as C} from '../src/config.js';
installRuntime();let now=Date.UTC(2026,10,3,12);const original=Date.now;Date.now=()=>now;
const tick=()=>new Promise(r=>setTimeout(r,0));
const env={ADMIN_TOKEN:'fixture'};env.PLAYERS=fakeNamespace(PlayerRoom,env);
const settle=async()=>{for(let i=0;i<4;i++){await tick();await env.PLAYERS.ctx('world').idle();}};
async function connect(){const r=await worker.fetch(new Request('https://w/players',{headers:{Upgrade:'websocket',Origin:'https://solwation.github.io'}}),env),ws=r.webSocket,got=[];ws.addEventListener('message',e=>{if(e.data!=='q')got.push(JSON.parse(e.data));});await settle();assert.equal(r.status,101);return{ws,got,send:m=>ws.send(JSON.stringify(m))};}
const latest=c=>c.got.filter(m=>m.t==='ft').at(-1)?.s??c.got[0].football.s;
test('production Worker: two independent owners, shared goal, late join, replay and hibernated rejoin retain one authoritative match',async()=>{
 try{const a=await connect(),b=await connect(),i=a.got[0].i,j=b.got[0].i;
  a.send({p:[C.at[0]-C.reserveSpacing,2.8,C.at[1]+.65],r:0});b.send({p:[C.at[0]+C.reserveSpacing,2.8,C.at[1]+.65],r:0});await settle();now+=250;
  a.send({t:'ft',k:'take',b:0,n:1});b.send({t:'ft',k:'take',b:1,n:1});await settle();assert.deepEqual(latest(a).balls.map(b=>b.owner),[i,j]);assert.deepEqual(latest(a),latest(b));
  // Ordinary 5Hz movement, using real body state and no submitted ball position.
  for(let k=0;k<13;k++){now+=200;a.send({p:[C.at[0]-1.5,2.8,C.at[1]+.65-(k+1)*.7],r:0});await settle();}
  // Set up an actual kick while still inside, clear of both posts.
  now+=200;a.send({p:[C.at[0],2.8,C.at[1]-C.length/2+1.6],r:0});await settle();now+=200;a.send({t:'ft',k:'kick',b:0,n:2,d:[0,-1],w:1});await settle();
  now+=700;a.send({t:'ft',k:'q',b:0,n:3});await settle();assert.equal(latest(a).score[0],1);assert.deepEqual(latest(a).credits,[[i,1]]);assert.equal(latest(b).score[0],1);
  a.send({t:'ft',k:'kick',b:0,n:2,d:[0,-1],w:1});await settle();assert.equal(latest(a).score[0],1);
  const c=await connect();assert.equal(c.got[0].football.s.score[0],1);assert.equal(c.got[0].football.s.balls[1].owner,j);
  env.PLAYERS.hibernate('world');now+=200;b.send({t:'ft',k:'q',b:1,n:2});await settle();assert.equal(latest(b).score[0],1);assert.equal(latest(b).balls[1].owner,j);
  for(const x of[a,b,c])x.ws.close(1000);await settle();const d=await connect();assert.equal(d.got[0].football.s.score[0],1);assert.deepEqual(d.got[0].football.s.credits,[[i,1]]);assert.ok(d.got[0].football.s.balls.every(b=>!b.owner));d.ws.close(1000);await settle();
 }finally{Date.now=original;}
});
