import {test} from 'node:test';import assert from 'node:assert/strict';
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),get length(){return m.size},key:i=>[...m.keys()][i]};};
const realInterval=globalThis.setInterval;globalThis.setInterval=(...args)=>{const t=realInterval(...args);t.unref();return t;};globalThis.addEventListener=()=>{};globalThis.document={addEventListener:()=>{}};globalThis.localStorage=memory();globalThis.sessionStorage=memory();
const s=await import('../src/stats.js');
test('actual per-profile stats save/reload grants exactly one point per cumulative own goal, preserving all older capped ledgers',async()=>{
 const old={duckScore:120,duckFeedDay:{day:'2026-11-03',points:120},gymScore:30,gymRewardDay:{day:'2026-11-03',points:30},danceScore:30,danceRewardDay:{day:'2026-11-03',points:30}};Object.assign(s.stats,structuredClone(old));const before=s.rawScore();
 const snap={epoch:'match_fixture',credits:[]};assert.equal(s.recordFootball(snap,'alice',true),0);snap.credits=[['alice',1],['other',7]];assert.equal(s.recordFootball(snap,'alice'),1);assert.equal(s.stats.footballGoals,1);assert.equal(s.rawScore()-before,1);assert.equal(s.recordFootball(snap,'alice'),0);
 const reload=await import('../src/stats.js?football-reload');assert.equal(reload.stats.footballGoals,1);assert.equal(reload.recordFootball(snap,'newid',true),0);snap.credits[0][1]=2;assert.equal(reload.recordFootball(snap,'newid'),1);assert.equal(reload.stats.footballGoals,2);assert.equal(reload.recordFootball(snap,'newid'),0);for(const[k,v]of Object.entries(old))assert.deepEqual(reload.stats[k],v);
 const again=await import('../src/stats.js?football-reload-again');assert.equal(again.stats.footballGoals,2);assert.equal(again.recordFootball(snap,'third',true),0);
});
