import test from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { cleanCinema } from './cinema.js';
import { PLAYROOM as R } from '../src/config.js';
installRuntime();
let now=Date.UTC(2026,9,21,12);Date.now=()=>now;
const tick=()=>new Promise(r=>setTimeout(r,0));
const settle=async env=>{for(let i=0;i<4;i++){await tick();await env.PLAYERS.ctx('world').idle();}await tick();};
const setup=()=>{const env={};env.PLAYERS=fakeNamespace(PlayerRoom,env);return env;};
const ROOM=[R.x-5,0,R.z-1],OUT=[0,0,0];
async function connect(env,name='Bio') {
 const res=await worker.fetch(new Request('https://w/players?n='+name,{headers:{Upgrade:'websocket',Origin:'https://solwation.github.io'}}),env);
 const c={ws:res.webSocket,got:[]};c.ws.addEventListener('message',e=>{if(e.data!=='q')c.got.push(JSON.parse(e.data));});
 c.send=m=>c.ws.send(JSON.stringify(m));c.messages=()=>c.got.filter(m=>m.t==='cinema');c.state=()=>c.messages().filter(m=>m.k==='state').at(-1)?.s;
 await settle(env);c.id=c.got.find(m=>m.t==='w').i;return c;
}
const place=async(env,c,p=ROOM)=>{now+=500;c.send({p,r:0});await settle(env);};
const act=async(env,c,k,extra={})=>{now+=1100;c.send({t:'cinema',k,q:c.state()?.q??0,...extra});await settle(env);};

test('bounded cinema parser accepts only supported transport data',()=>{
 assert.deepEqual(cleanCinema('{"t":"cinema","k":"select","q":1,"v":"M7lc1UVf-VE","owner":"forged"}'),{k:'select',q:1,v:'M7lc1UVf-VE'});
 for(const m of [{k:'hack'},{k:'select',q:0,v:'<script>'},{k:'play',q:-1},{k:'pause',q:2,p:-1},{k:'pause',q:2,p:R.cinemaSync.maxPosition+1},{k:'pause',q:2,p:'1'}])assert.equal(cleanCinema(JSON.stringify({t:'cinema',...m})),null);
 assert.equal(cleanCinema('bad'),null);
});

test('simultaneous claims produce one connection-owned controller and reject other writers',async()=>{
 const env=setup(),a=await connect(env,'Anna'),b=await connect(env,'Bo');await place(env,a);await place(env,b);
 now+=1100;a.send({t:'cinema',k:'claim',owner:b.id});b.send({t:'cinema',k:'claim'});await settle(env);
 assert.equal(a.state().owner,a.id);assert.equal(b.state().owner,a.id);assert.equal(a.state().name,'Anna');
 assert(b.messages().some(m=>m.k==='no'&&m.why==='owned'));
 await act(env,a,'select',{v:'M7lc1UVf-VE'});assert.equal(b.state().video,'M7lc1UVf-VE');assert.equal(b.state().playing,true);
 const q=a.state().q;
 for(const k of ['select','play','pause','stop','release']){await act(env,b,k,{v:'aqz-KE-bpKQ'});assert.equal(a.state().q,q);assert.equal(b.messages().at(-2).why,'owner');}
});

test('pause/resume timeline, stale writes and late joins use the same authoritative state',async()=>{
 const env=setup(),a=await connect(env);await place(env,a);await act(env,a,'claim');await act(env,a,'select',{v:'M7lc1UVf-VE'});
 now+=10000;const b=await connect(env);await place(env,b);
 assert.deepEqual(b.state(),a.state());assert(b.messages().at(-1).now-b.state().at>=10000);
 await act(env,a,'pause',{p:12.5});assert.equal(b.state().position,12.5);assert.equal(b.state().playing,false);
 await act(env,a,'play',{q:0});assert.equal(a.messages().at(-2).why,'stale');assert.equal(a.state().playing,false);
 await act(env,a,'play');assert.equal(b.state().position,12.5);assert.equal(b.state().playing,true);
 await act(env,a,'stop');assert.equal(b.state().video,'');assert.equal(b.state().playing,false);
});

test('leaving the room releases control while viewers remain; the last departure clears film and storage',async()=>{
 const env=setup(),a=await connect(env),b=await connect(env);await place(env,a);await place(env,b);await act(env,a,'claim');await act(env,a,'select',{v:'M7lc1UVf-VE'});
 await place(env,a,OUT);assert.equal(b.state().owner,null);assert.equal(b.state().video,'M7lc1UVf-VE');
 await act(env,b,'claim');assert.equal(b.state().owner,b.id);
 await place(env,b,OUT);assert.equal(env.PLAYERS.object('world').cinema.state,null);assert.equal(await env.PLAYERS.ctx('world').storage.get('cinema'),undefined);
 await place(env,a);assert.equal(a.state().video,'');assert.equal(a.state().owner,null);
});

test('disconnect and hibernation preserve a live film, release dead ownership and reconnect without ownership',async()=>{
 const env=setup(),a=await connect(env),b=await connect(env);await place(env,a);await place(env,b);await act(env,a,'claim');await act(env,a,'select',{v:'M7lc1UVf-VE'});
 env.PLAYERS.hibernate('world');await settle(env);await act(env,b,'get');assert.equal(b.state().owner,a.id);assert.equal(b.state().video,'M7lc1UVf-VE');
 a.ws.close();await settle(env);assert.equal(b.state().owner,null);assert.equal(b.state().video,'M7lc1UVf-VE');
 const again=await connect(env);await place(env,again);assert.equal(again.state().video,'M7lc1UVf-VE');assert.equal(again.state().owner,null);
 await act(env,b,'claim');const stored=await env.PLAYERS.ctx('world').storage.get('cinema');stored.owner='missing-socket';await env.PLAYERS.ctx('world').storage.put('cinema',stored);
 env.PLAYERS.hibernate('world');await settle(env);await act(env,b,'get');assert.equal(b.state().owner,null);assert.equal(b.state().video,'M7lc1UVf-VE');
 b.ws.close();again.ws.close();await settle(env);assert.equal(env.PLAYERS.object('world').cinema.state,null);
});

test('outside clients cannot read or mutate the cinema and malformed payloads do not broadcast',async()=>{
 const env=setup(),a=await connect(env),b=await connect(env);await place(env,a);await place(env,b,OUT);await act(env,a,'claim');await act(env,a,'select',{v:'M7lc1UVf-VE'});
 assert.equal(b.messages().length,0);await act(env,b,'get');assert.deepEqual(b.messages(),[{t:'cinema',k:'no',why:'away'}]);
 const n=a.messages().length;now+=1100;a.send({t:'cinema',k:'select',q:a.state().q,v:'javascript:bad'});await settle(env);assert.equal(a.messages().length,n);
});


test('all home TVs have independent controllers and films, scoped by room and floor',async()=>{
 const env=setup(),a=await connect(env,'Anna'),b=await connect(env,'Bo'),c=await connect(env,'Cia');
 const tvState=(c,id)=>c.messages().filter(m=>m.screen===id&&m.k==='state').at(-1)?.s;
 const tvAct=async(c,id,k,extra={})=>{now+=1100;c.send({t:'cinema',screen:id,k,q:tvState(c,id)?.q??0,...extra});await settle(env);};
 await place(env,a,[4,0,9]);await place(env,b,[3,0,10]);await place(env,c,[4,3.25,2]);
 await tvAct(a,'lounge','claim');await tvAct(b,'lounge','claim');
 assert.equal(tvState(a,'lounge').owner,a.id);assert.equal(tvState(b,'lounge').owner,a.id);
 await tvAct(a,'lounge','select',{v:'aqz-KE-bpKQ'});
 await tvAct(c,'bedroom1','claim');await tvAct(c,'bedroom1','select',{v:'M7lc1UVf-VE'});
 assert.equal(tvState(a,'lounge').video,'aqz-KE-bpKQ');assert.equal(tvState(c,'bedroom1').video,'M7lc1UVf-VE');
 assert.equal(tvState(a,'bedroom1'),undefined);assert.equal(tvState(c,'lounge'),undefined);
 await tvAct(b,'lounge','stop');assert.equal(tvState(a,'lounge').video,'aqz-KE-bpKQ');
 await place(env,a,[1,0,1]);assert.equal(tvState(b,'lounge').owner,null);
 await place(env,b,[1,0,1]);assert.equal(env.PLAYERS.ctx('world').data.has('cinema:lounge'),false);
 assert.equal(tvState(c,'bedroom1').video,'M7lc1UVf-VE');
 await place(env,c,[1,3.25,2]);await tvAct(c,'bedroom3','claim');await tvAct(c,'bedroom3','select',{v:'aqz-KE-bpKQ'});
 assert.equal(tvState(c,'bedroom3').video,'aqz-KE-bpKQ');assert.equal(env.PLAYERS.ctx('world').data.has('cinema:bedroom1'),false);
 assert.equal(env.PLAYERS.object('world').cinema.state,null);
});

test('TV identities and outsider commands are bounded; hibernation keeps live TV viewers',async()=>{
 assert.equal(cleanCinema(JSON.stringify({t:'cinema',screen:'arbitrary',k:'claim'})),null);
 assert.deepEqual(cleanCinema(JSON.stringify({t:'cinema',screen:'lounge',k:'get'})),{k:'get',screen:'lounge'});
 const env=setup(),a=await connect(env);await place(env,a,[4,3.25,9]);
 a.send({t:'cinema',screen:'lounge',k:'claim'});await settle(env);assert.equal(a.messages().at(-1).why,'away');
 await place(env,a,[4,0,9]);a.send({t:'cinema',screen:'lounge',k:'claim'});await settle(env);
 env.PLAYERS.hibernate('world');await settle(env);
 const tv=env.PLAYERS.object('world').tvs.find(t=>t.id==='lounge');assert.equal(tv.state.owner,a.id);
 a.ws.close();await settle(env);assert.equal(tv.state,null);assert.equal(env.PLAYERS.ctx('world').data.has('cinema:lounge'),false);
});

test('shared seek preserves play/pause, rejects stale/foreign writes and bounds positions',async()=>{
 for(const p of [undefined,-1,Infinity,'10',R.cinemaSync.maxPosition+1])assert.equal(cleanCinema(JSON.stringify({t:'cinema',k:'seek',q:1,...(p===undefined?{}:{p})})),null);
 assert.deepEqual(cleanCinema('{"t":"cinema","k":"seek","q":1,"p":0,"owner":"fake"}'),{k:'seek',q:1,p:0});
 const env=setup(),a=await connect(env),b=await connect(env);await place(env,a);await place(env,b);await act(env,a,'claim');await act(env,a,'select',{v:'aqz-KE-bpKQ'});
 await act(env,a,'seek',{p:45});assert.equal(b.state().position,45);assert.equal(b.state().playing,true);
 const q=a.state().q;await act(env,b,'seek',{p:100});assert.equal(a.state().q,q);assert.equal(b.messages().at(-2).why,'owner');
 await act(env,a,'seek',{p:60,q:q-1});assert.equal(a.state().position,45);assert.equal(a.messages().at(-2).why,'stale');
 await act(env,a,'pause',{p:46});await act(env,a,'seek',{p:0});assert.equal(b.state().position,0);assert.equal(b.state().playing,false);
 await act(env,a,'seek',{p:R.cinemaSync.maxPosition});assert.equal(b.state().position,R.cinemaSync.maxPosition);assert.equal(b.state().playing,false);
});
