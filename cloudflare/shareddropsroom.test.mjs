// #1855: real outer Worker routing, welcome, attachment pose and hibernation boundaries.
import test from 'node:test';import assert from 'node:assert/strict';
import {installRuntime,fakeNamespace} from './devws.mjs';import worker,{PlayerRoom}from './worker.js';
import {FISHING}from '../src/config.js';
installRuntime();
const pause=()=>new Promise(r=>setTimeout(r,0));
test('real PlayerRoom routes two food protocols, durable takeover, late welcome and wake without resurrection',async()=>{
 const env={};env.PLAYERS=fakeNamespace(PlayerRoom,env);
 const settle=async()=>{for(let i=0;i<6;i++){await pause();await env.PLAYERS.ctx('world').idle();}};
 const connect=async()=>{const r=await worker.fetch(new Request('https://w/players',{headers:{Upgrade:'websocket',Origin:'https://solwation.github.io'}}),env);const c={ws:r.webSocket,got:[]};c.ws.addEventListener('message',e=>{if(e.data!=='q')c.got.push(JSON.parse(e.data));});c.send=m=>c.ws.send(JSON.stringify(m));await settle();c.id=c.got[0].i;return c;};
 const a=await connect(),b=await connect();assert.equal(a.got[0].sharedFish.v,1);assert.equal(a.got[0].nutDrops.v,2);
 a.send({p:[1,0,1],r:0});b.send({p:[1,0,1],r:0});await settle();
 const id='a'.repeat(32),key='b'.repeat(32),sp=Object.keys(FISHING.species)[0];
 a.send({t:'df',k:'put',id,key,r:0,n:1,d:{sp,cm:FISHING.species[sp].cm[0],ck:0,by:'grill',b:0},p:[1,.8,1],q:[0,0,0,1]});await settle();assert.ok(a.got.some(m=>m.t==='df'&&m.ok));
 a.send({t:'sq',k:'on'});await settle();a.send({t:'sq',k:'t',s:0,b:1,n:1,h:[0,1,0,1]});await settle();a.send({t:'sq',k:'p',s:0,b:1,n:2,x:1,z:1,p:[1,.81,1],q:[0,0,0,1]});await settle();
 const late=await connect();assert.equal(late.got[0].sharedFish.rows[0].id,id);assert.deepEqual(late.got[0].nutDrops.d[0].p,[1,.81,1]);
 env.PLAYERS.hibernate('world');b.send({t:'df',k:'take',id,key:'c'.repeat(32),next:'d'.repeat(32),r:1,n:1});await settle();assert.ok(b.got.some(m=>m.t==='df'&&m.ok&&m.row.mode==='held'));
 b.send({t:'sq',k:'t',s:0,b:1,n:3});await settle();assert.ok(b.got.some(m=>m.t==='sq'&&m.k==='ok'&&m.n===3));
 const newest=await connect();assert.equal(newest.got[0].sharedFish.rows[0].who,b.id);assert.equal(newest.got[0].nutDrops.d[0].held,b.id);
 assert.ok(!JSON.stringify(newest.got[0].sharedFish).includes(key),'private keys stay out of welcome');
 a.ws.close();b.ws.close();late.ws.close();newest.ws.close();await settle();
});
