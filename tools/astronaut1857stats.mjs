import {test} from 'node:test';import assert from 'node:assert/strict';
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),get length(){return m.size},key:i=>[...m.keys()][i]};};
const interval=globalThis.setInterval;globalThis.setInterval=(...args)=>{const t=interval(...args);t.unref();return t;};globalThis.addEventListener=()=>{};globalThis.document={addEventListener:()=>{}};globalThis.localStorage=memory();globalThis.sessionStorage=memory();
localStorage.setItem('lunden.stats',JSON.stringify({medals:{jetpack:{l:2,t:[1,2]},astronaut:{l:1,t:[3]}},medalPoints:35,flights:30}));
const s=await import('../src/stats.js');const {evaluate}=await import('../src/medals.js');
test('actual legacy stats default to zero; fractional metres persist, existing receipts and points remain',async()=>{
 assert.equal(s.stats.jetpackMetres,0);const old=structuredClone(s.stats.medals),score=s.rawScore();
 for(let i=0;i<100;i++)s.bump('jetpackMetres',.007);for(const n of[-1,NaN,Infinity])s.bump('jetpackMetres',n);
 assert.ok(Math.abs(s.stats.jetpackMetres-.7)<1e-12);assert.equal(s.rawScore(),score);assert.equal(s.stats.flights,30);assert.deepEqual(s.stats.medals,old);
 s.keepStatsNow();const reload=await import('../src/stats.js?astronaut-reload');assert.equal(reload.stats.jetpackMetres,s.stats.jetpackMetres);let paid=0;evaluate(reload.stats,{seeded:true,pay:n=>paid+=n});assert.equal(paid,0);assert.deepEqual(reload.stats.medals,old);
 reload.bump('jetpackMetres',100);evaluate(reload.stats,{seeded:true,pay:n=>paid+=n});assert.equal(paid,0,'saved Astronaut receipt is never paid again');
});
