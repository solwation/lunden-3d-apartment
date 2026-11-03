import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {DanceTime,creditDance,danceScoreOf} from '../src/dancescore.js';
import {DANCE,PLAYROOM} from '../src/config.js';
import {MEDALS,levelOf} from '../src/medalcatalog.js';
import {boardCounters} from '../src/boardcatalog.js';
import {clampCounters,medalsOf,record} from '../cloudflare/boards.js';
const timer=mock.method(globalThis,'setInterval',()=>0);globalThis.addEventListener=()=>{};
const {stats,bump,rawScore}=await import('../src/stats.js');timer.mock.restore();delete globalThis.addEventListener;
const valid={active:true,inside:true,dancing:true,music:'playing',pos:{x:PLAYROOM.x,z:PLAYROOM.z}};
test('whole elapsed seconds, no toggle rewards; interruptions discard fractions and long background gaps',()=>{
 let count=0;const clock=new DanceTime(n=>count+=n);
 for(let i=0;i<60;i++)clock.update(1/60,valid);assert.equal(count,1);
 for(const bad of [{active:false},{inside:false},{dancing:false},{music:'paused'},{music:'off'},{pos:{x:PLAYROOM.x+6,z:PLAYROOM.z}},{pos:{x:PLAYROOM.x,z:PLAYROOM.z+3.4}}]){
  clock.update(.9,valid);clock.update(.1,{...valid,...bad});clock.update(.2,valid);assert.equal(count,1);clock.update(0,{...valid,active:false});
 }
 for(const dt of [NaN,Infinity,-1,2,60])assert.equal(clock.update(dt,valid),0);
 for(let i=0;i<100;i++){clock.update(.01,valid);clock.update(.01,{...valid,dancing:false});}assert.equal(count,1);
 clock.update(.5,valid);clock.update(.5,valid);assert.equal(count,2);
});
test('actual stats route is daily capped, persists ledger, keeps seconds after cap and other ledgers independent',()=>{
 const edge={};assert.equal(creditDance(edge,29,'day'),29);assert.equal(creditDance(edge,2,'day'),1);assert.equal(creditDance(edge,1,'day'),0);assert.equal(creditDance(edge,1,'tomorrow'),1);
 const before=rawScore();bump('danceSeconds',180);assert.equal(stats.danceSeconds,180);assert.equal(rawScore()-before,DANCE.scorePerDay);
 bump('danceSeconds',NaN);bump('danceSeconds',-1);bump('danceSeconds',.5);assert.equal(stats.danceSeconds,180);
 const s=JSON.parse(JSON.stringify(stats));assert.equal(creditDance(s,1,s.danceRewardDay.day),0);assert.equal(creditDance(s,2,'next-day'),2);assert.equal(danceScoreOf(s),32);
 bump('duckFeeds');bump('gymReps');assert.equal(rawScore()-before,DANCE.scorePerDay+7);
});
test('three-minute medal and Worker counter catalogue accept and derive real seconds',async()=>{
 const m=MEDALS.find(m=>m.id==='dance');assert.equal(m.counter,'danceSeconds');assert.equal(levelOf(m,179),0);assert.equal(levelOf(m,180),1);
 assert.deepEqual(boardCounters({danceSeconds:180}),{danceSeconds:180});assert.equal(clampCounters({danceSeconds:180},null,1).danceSeconds,180);
 const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),delete:async k=>map.delete(k),list:async()=>map};
 assert.equal(await record(storage,{id:'dance-player-1',name:'Test',c:{danceSeconds:180}},1e12),true);assert.ok(medalsOf(map.get('b:dance-player-1')).dance);
});
