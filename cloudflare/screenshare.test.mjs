// #2241: the Worker side of a computer game's picture for the onlookers (RoomCinema.relay, src/screenwire.js cleanScreenFrame):
// only the current owner, only the current app, only to that computer's other room viewers, bounded size and rate.
// node --test cloudflare/screenshare.test.mjs
import test from 'node:test';import assert from 'node:assert/strict';
import { installRuntime,fakeNamespace } from './devws.mjs';import worker,{PlayerRoom} from './worker.js';import { PLAYERS } from './players.js';
import { COMPUTER_MEDIA,LEVELS,SCREEN_SHARE as S } from '../src/config.js';
import { cleanScreenFrame } from '../src/screenwire.js';import { encodeBlocks } from '../src/screenshare.js';import { BlocksGame } from '../src/blocks.js';
installRuntime();let now=Date.UTC(2026,10,20,12);Date.now=()=>now;
const settle=async env=>{for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,0));await env.PLAYERS.ctx('world').idle();}};
const setup=()=>{const env={};env.PLAYERS=fakeNamespace(PlayerRoom,env);return env;};
const station=id=>COMPUTER_MEDIA.stations.find(s=>s.id===id),feet=s=>[s.x,s.clubhouse?0:LEVELS[s.level].floor,s.z];
async function client(env,name,screen,p=feet(station(screen))){
 const r=await worker.fetch(new Request('https://w/players?n='+name,{headers:{Upgrade:'websocket',Origin:'https://solwation.github.io'}}),env),c={ws:r.webSocket,m:[],closed:false,screen};
 c.ws.addEventListener('message',e=>{if(e.data!=='q')c.m.push(JSON.parse(e.data));});c.ws.addEventListener('close',()=>{c.closed=true;});
 c.send=async m=>{now+=510;c.ws.send(typeof m==='string'?m:JSON.stringify(m));await settle(env);};await settle(env);c.id=c.m.find(m=>m.t==='w').i;
 c.state=()=>c.m.filter(m=>m.t==='cinema'&&m.screen===screen&&m.k==='state').at(-1)?.s;c.frames=()=>c.m.filter(m=>m.t==='scr');
 await c.send({p,r:0});c.cinema=async(k,extra={})=>c.send({t:'cinema',screen,k,q:c.state()?.q??0,...extra});return c;
}
const frame=(screen,n,f=encodeBlocks(new BlocksGame(()=>.4)),app='blocks')=>({t:'scr',screen,app,n,f});
async function playing(env,screen='pc-home'){
 const a=await client(env,'Anna',screen),b=await client(env,'Bo',screen),out=await client(env,'Ute',screen,[0,0,0]);
 await a.cinema('power',{on:true});await a.cinema('claim');await a.cinema('app',{app:'blocks'});return {a,b,out};
}

test('parser: a known computer, a shared app, a bounded printable payload; forged fields are stripped',()=>{
 const f=encodeBlocks(new BlocksGame(()=>.4));
 assert.deepEqual(cleanScreenFrame(JSON.stringify({...frame('pc-home',7,f),i:'forged',owner:'x'})),{screen:'pc-home',app:'blocks',n:7,f});
 for(const m of [frame('lounge',1),frame('pc-nope',1),frame('pc-home',1,f,'meteors'),frame('pc-home',1,f,'snake'),frame('pc-home',-1),frame('pc-home',1.5),
  frame('pc-home',1,'x'.repeat(S.maxFrame+1)),frame('pc-home',1,'<\u0000>'),frame('pc-home',1,'å'),{...frame('pc-home',1),t:'cinema'},{...frame('pc-home',1),f:12}])
  assert.equal(cleanScreenFrame(JSON.stringify(m)),null,JSON.stringify(m).slice(0,80));
 assert.equal(cleanScreenFrame('{"t":"scr"'),null);
 const long=JSON.stringify(frame('laptop-home',Number.MAX_SAFE_INTEGER,'7'.repeat(S.maxFrame)));
 assert(long.length<=S.maxBytes&&S.maxBytes<=PLAYERS.maxBytes,`${long.length} ≤ ${S.maxBytes} ≤ ${PLAYERS.maxBytes}`);
 assert.notEqual(cleanScreenFrame(long),null);assert.equal(cleanScreenFrame(long+' '.repeat(S.maxBytes-long.length+1)),null);
});

test('the owner\'s frame reaches the other viewers of that computer only, with the sender id; nothing is stored',async()=>{
 const env=setup(),{a,b,out}=await playing(env),c=await client(env,'Cia','pc-lime');
 await a.send(frame('pc-home',41));
 assert.deepEqual(b.frames(),[{t:'scr',screen:'pc-home',app:'blocks',n:41,f:frame('pc-home',41).f,i:a.id}]);
 assert.equal(a.frames().length,0);assert.equal(out.frames().length,0);assert.equal(c.frames().length,0);
 assert.equal(a.closed||b.closed,false);
 const keys=[...env.PLAYERS.ctx('world').data.keys()].filter(k=>/scr|frame/.test(k));assert.deepEqual(keys,[]);
 await b.send({p:[0,0,0],r:0});await a.send(frame('pc-home',42));assert.equal(b.frames().length,1,'an onlooker who left gets nothing more');
});

test('frames from a non-owner, for another app, on a computer that is off, or too big are dropped without closing',async()=>{
 const env=setup(),{a,b}=await playing(env);
 await b.send(frame('pc-home',1));assert.equal(a.frames().length,0);
 await a.send(frame('pc-lime',2));assert.equal(b.frames().length,0,'another computer: not the sender\'s');
 await a.send(frame('pc-home',3,'x'.repeat(S.maxFrame+1)));assert.equal(b.frames().length,0);
 await a.cinema('app',{app:'menu'});await a.send(frame('pc-home',4));assert.equal(b.frames().length,0,'app changed');
 await a.cinema('app',{app:'blocks'});await a.send(frame('pc-home',5));assert.equal(b.frames().length,1);
 await a.cinema('release');await a.send(frame('pc-home',6));assert.equal(b.frames().length,1,'released');
 await a.cinema('claim');await a.cinema('power',{on:false});await a.send(frame('pc-home',7));assert.equal(b.frames().length,1,'off');
 assert.equal(a.closed||b.closed,false);
});

test('rate: SCREEN_SHARE.hz frames a second pass, faster ones are dropped silently (no strike)',async()=>{
 const env=setup(),{a,b}=await playing(env);now+=2000;
 const raw=(n,dt)=>{now+=dt;a.ws.send(JSON.stringify(frame('pc-home',n)));};
 for(let i=0;i<16;i++){raw(100+i,1000/S.hz);await settle(env);}
 assert.equal(b.frames().length,16,'4 Hz for 4 s: all 16');
 now+=2000;const before=b.frames().length;
 for(let i=0;i<6;i++){raw(200+i,150);await settle(env);}
 assert.equal(b.frames().length-before,3,'every 150 ms: only every second one (≥ 200 ms apart)');
 assert.equal(a.closed,false);
});
