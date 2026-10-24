// #1577: the computer games' global top lists (cloudflare/games.js): validation, one best row per player and game,
// the *guess* plausibility limits, names as for /scores, and Ormstriden rows written by the players' room.
import test from 'node:test';import assert from 'node:assert/strict';
import worker,{PlayerRoom} from './worker.js';import { maxScore } from './games.js';
import { installRuntime,fakeNamespace } from './devws.mjs';import { COMPUTER_MEDIA,LEVELS,GAME_BOARDS as G } from '../src/config.js';
installRuntime();
function kv(){const store=new Map();return{store,async get(k,t){const e=store.get(k);if(!e)return null;return t==='json'?JSON.parse(e.v):e.v;},async put(k,v){store.set(k,{v});},async delete(k){store.delete(k);},async list(o={}){return{keys:[...store.keys()].filter(k=>k.startsWith(o.prefix??'')).map(name=>({name})),list_complete:true};}};}
let n=0;
const call=(env,path,method='GET',body)=>worker.fetch(new Request(`https://w.test${path}`,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{Origin:'https://solwation.github.io','Content-Type':'text/plain','CF-Connecting-IP':`8.8.${++n%250}.1`}}),env);
const post=(env,game,b)=>call(env,`/games/${game}`,'POST',b);

test('one best row per player and game; lists are separate; anonymous never strips a name; names cleaned',async()=>{
 const env={LUNDEN:kv()};
 assert.equal((await post(env,'klossar',{id:'player-aaaa',name:'',score:400,lines:2,ms:60000})).status,200);
 let top=await (await post(env,'klossar',{id:'player-aaaa',name:'Ol<o>f&',score:900,lines:4,ms:90000})).json();
 assert.deepEqual(top.map(r=>[r.name,r.score]),[['Olof',900]]);
 top=await (await post(env,'klossar',{id:'player-aaaa',name:'',score:300,lines:1,ms:30000})).json(); // worse round: best kept
 assert.deepEqual(top.map(r=>[r.name,r.score]),[['Olof',900]]);
 await post(env,'meteoriter',{id:'player-bbbb',name:'Bo',score:520,wave:2,ms:60000});
 assert.deepEqual((await (await call(env,'/games/meteoriter')).json()).map(r=>r.name),['Bo']);
 assert.deepEqual((await (await call(env,'/games/klossar')).json()).map(r=>r.name),['Olof']);
 assert.deepEqual(await (await call(env,'/games/ormstriden')).json(),[]);
});
test('top lists hold at most G.top rows, sorted by score',async()=>{
 const env={LUNDEN:kv()};for(let i=0;i<G.top+3;i++)await post(env,'meteoriter',{id:`player-${1000+i}`,name:`P${i}`,score:100*(i+1),ms:60000});
 const top=await (await call(env,'/games/meteoriter')).json();assert.equal(top.length,G.top);assert(top.every((r,i)=>!i||top[i-1].score>=r.score));
});
test('bad and implausible posts are refused; Ormstriden cannot be posted; unknown games 404',async()=>{
 const env={LUNDEN:kv()};
 for(const [game,b]of [['klossar',{id:'x',score:1,lines:0,ms:5000}],['klossar',{id:'player-cccc',score:1.5,lines:0,ms:5000}],['klossar',{id:'player-cccc',score:10,lines:0,ms:500}],
  ['klossar',{id:'player-cccc',score:10,lines:9999,ms:10000}],['klossar',{id:'player-cccc',score:900_000,lines:20,ms:30000}],['meteoriter',{id:'player-cccc',score:50_000,ms:10000}],['meteoriter',{id:'player-cccc',score:100,ms:10000,wave:-1}]])
  assert.equal((await post(env,game,b)).status,400,JSON.stringify(b));
 assert.equal((await post(env,'ormstriden',{id:'player-cccc',score:5,ms:10000})).status,405);
 assert.equal((await call(env,'/games/tetris-x')).status,404);
 assert.equal(env.LUNDEN.store.size,0);
 // the limits follow the rules: a 1-minute Meteoriter round fits a bullet per fireMs
 assert(maxScore('meteoriter',{ms:60000})>=60000/230*100);assert(maxScore('klossar',{ms:60000,lines:40})>40*200*4);
});
test('Ormstriden rows come from the server arena when a snake ends, keyed by the player UUID, never broadcast',async()=>{
 let now=Date.UTC(2026,9,24);const real=Date.now;Date.now=()=>now;
 try{
  const env={LUNDEN:kv()};env.PLAYERS=fakeNamespace(PlayerRoom,env);const settle=async()=>{for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,0));await env.PLAYERS.ctx('world').idle();}};
  const r=await worker.fetch(new Request('https://w/players?n=Anna',{headers:{Upgrade:'websocket',Origin:'https://solwation.github.io'}}),env),ws=r.webSocket,m=[];ws.addEventListener('message',e=>{if(e.data!=='q')m.push(JSON.parse(e.data));});
  const send=async x=>{now+=510;ws.send(JSON.stringify(x));await settle();};await settle();
  const st=COMPUTER_MEDIA.stations.find(s=>s.id==='pc-home');await send({p:[st.x,LEVELS[st.level].floor,st.z],r:0});
  const q=()=>m.filter(x=>x.t==='cinema'&&x.screen==='pc-home'&&x.k==='state').at(-1).s.q;
  await send({t:'cinema',screen:'pc-home',k:'power',on:true,q:q()});await send({t:'cinema',screen:'pc-home',k:'claim',q:q()});await send({t:'cinema',screen:'pc-home',k:'app',app:'snake',q:q()});
  await send({t:'snake',k:'join',screen:'pc-home',pid:'player-anna-1'});
  const room=env.PLAYERS.object('world'),snake=room.snake.arena.snakes.values().next().value;
  assert(!m.some(x=>x.t==='snake'&&JSON.stringify(x).includes('player-anna-1')),'the UUID never leaves the room');
  snake.score=17;room.snake.arena.kill(snake,'väggen');await room.gameWrites;
  const top=await (await call(env,'/games/ormstriden')).json();assert.deepEqual(top.map(r=>[r.name,r.score]),[['Anna',17]]);
  // a client cannot post an Ormstriden score, and an invalid pid simply records nothing
  await send({t:'cinema',screen:'pc-home',k:'app',app:'blocks',q:q()});assert.equal(m.filter(x=>x.t==='cinema'&&x.k==='state').at(-1).s.app,'blocks');
 }finally{Date.now=real;}
});
