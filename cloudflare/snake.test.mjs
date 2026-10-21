import test from 'node:test';import assert from 'node:assert/strict';
import { installRuntime,fakeNamespace } from './devws.mjs';import worker,{PlayerRoom} from './worker.js';
import { cleanSnake } from './snake.js';import { COMPUTER_MEDIA,LEVELS } from '../src/config.js';
installRuntime();let now=Date.UTC(2026,9,21);const realNow=Date.now;Date.now=()=>now;
const settle=async env=>{for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,0));await env.PLAYERS.ctx('world').idle();}};
async function setup(){const env={};env.PLAYERS=fakeNamespace(PlayerRoom,env);return env;}
async function client(env,name,screen){const r=await worker.fetch(new Request('https://w/players?n='+name,{headers:{Upgrade:'websocket',Origin:'https://solwation.github.io'}}),env),c={ws:r.webSocket,m:[],screen};c.ws.addEventListener('message',e=>{if(e.data!=='q')c.m.push(JSON.parse(e.data));});c.send=async m=>{now+=510;c.ws.send(JSON.stringify(m));await settle(env);};await settle(env);c.id=c.m.find(m=>m.t==='w').i;c.state=()=>c.m.filter(m=>m.t==='cinema'&&m.screen===screen&&m.k==='state').at(-1)?.s;const s=COMPUTER_MEDIA.stations.find(s=>s.id===screen);await c.send({p:[s.x,s.clubhouse?0:LEVELS[s.level].floor,s.z],r:0});c.cinema=async(k,extra={})=>c.send({t:'cinema',screen,k,q:c.state()?.q??0,...extra});return c;}
test('parser bounds computer identities, angle and sequence; strips forged fields',()=>{
 assert.deepEqual(cleanSnake(JSON.stringify({t:'snake',k:'input',screen:'pc-home',seq:2,angle:1,points:[99],owner:'x'})),{k:'input',screen:'pc-home',seq:2,angle:1});
 for(const m of [{k:'join',screen:'lounge'},{k:'input',screen:'pc-home',seq:1,angle:4},{k:'input',screen:'pc-home',seq:-1,angle:0},{k:'hack'}])assert.equal(cleanSnake(JSON.stringify({t:'snake',...m})),null);
});
test('two computer users share one arena; ownership races and forged moves are refused',async()=>{
 const e=await setup(),a=await client(e,'Anna','pc-home'),b=await client(e,'Bo','pc-home');await a.cinema('claim');await b.cinema('claim');assert.equal(a.state().owner,a.id);await b.send({t:'snake',k:'join',screen:'pc-home'});assert.equal(b.m.at(-1).why,'owner');await a.cinema('app',{app:'snake'});await a.send({t:'snake',k:'join',screen:'pc-home'});
 const c=await client(e,'Cia','pc-lime');await c.cinema('claim');await c.cinema('app',{app:'snake'});await c.send({t:'snake',k:'join',screen:'pc-lime'});let game=e.PLAYERS.object('world').snake.arena;assert.equal(game.snakes.size,2);const length=game.snakes.get(a.id).length;game.food=[];game.random=()=>.99;await a.send({t:'snake',k:'input',screen:'pc-home',seq:1,angle:0,points:[[999,999]],length:999});assert.equal(game.snakes.get(a.id).length,length);assert(game.snakes.get(a.id).points[0][0]<32);assert(c.m.some(m=>m.t==='snake'&&m.s?.snakes.length===2));
 await a.cinema('release');assert.equal(game.snakes.has(a.id),false);await b.cinema('claim');assert.equal(b.state().owner,b.id);await c.send({p:[0,0,0],r:0});assert.equal(e.PLAYERS.object('world').snake.arena,null);
});
test('app changes stop old video; disconnect and reset release the station and game',async()=>{
 const e=await setup(),a=await client(e,'A','pc-home');await a.cinema('claim');await a.cinema('select',{v:'aqz-KE-bpKQ'});assert.equal(a.state().app,'youtube');await a.cinema('app',{app:'snake'});assert.equal(a.state().video,'');await a.send({t:'snake',k:'join',screen:'pc-home'});assert(e.PLAYERS.object('world').snake.arena);await a.cinema('app',{app:'youtube'});assert.equal(e.PLAYERS.object('world').snake.arena,null);await a.cinema('app',{app:'snake'});await a.send({t:'snake',k:'join',screen:'pc-home'});a.ws.close();await settle(e);assert.equal(e.PLAYERS.object('world').snake.arena,null);assert.equal(e.PLAYERS.object('world').tvs.find(s=>s.id==='pc-home').state,null);
});

test.after(()=>{Date.now=realNow;});
