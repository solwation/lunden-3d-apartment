import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawingRoom } from './worker.js';
const request = (moves, code='olof is the goat') => new Request('https://test/furniture', { method:'PUT', body:JSON.stringify({code,moves}) });
const move = (id, base=0, x=3) => ({id,base,pos:[x,0,3],quat:[0,0,0,1]});
function room() {
 const data=new Map();let gate=Promise.resolve();
 const ctx={storage:{get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))},blockConcurrencyWhile(fn){const p=gate.then(fn);gate=p.catch(()=>{});return p;}};
 return {ctx,instance:new DrawingRoom(ctx,{})};
}
test('arrangement writes are atomic, serialized and durable; stale clients cannot overwrite',async()=>{
 const {ctx,instance:r}=room();
 const results=await Promise.all([r.fetch(request([move('f-sofa-0')])),r.fetch(request([move('f-sofa-0',0,5)])),r.fetch(request([move('f-rug-0')]))]);
 assert.deepEqual(results.map(r=>r.status),[200,409,200]);
 const bad=await r.fetch(request([move('f-rug-0',2,6),move('f-sofa-0',0,6)]));assert.equal(bad.status,409);
 const state=await(await new DrawingRoom(ctx,{}).fetch(new Request('https://test/furniture'))).json();
 assert.equal(state.pieces['f-rug-0'].pos[0],3);assert.equal(state.pieces['f-sofa-0'].pos[0],3);
 assert.equal(state.revision,2);
});
test('reject wrong code, bad geometry and duplicate ids without changing state',async()=>{
 const {instance:r}=room();assert.equal((await r.fetch(request([move('f-one')],'wrong'))).status,403);
 for(const moves of [[{...move('f-one'),pos:[null,0,1]}],[{...move('f-one'),quat:[0,0,0,0]}],[move('f-one'),move('f-one')],[]])assert.equal((await r.fetch(request(moves))).status,400);
 assert.equal((await(await r.fetch(new Request('https://test/furniture'))).json()).revision,0);
});

test('both public cheat codes can save furniture',async()=>{
 for (const code of ['olof is the goat','sarah is the goat']) {
  const {instance:r}=room();
  const response=await r.fetch(request([move('f-sofa-0')],code));
  assert.equal(response.status,200);
  assert.equal((await response.json()).pieces['f-sofa-0'].revision,1);
 }
});

const reset = (moves, expectedRevision) => new Request('https://test/furniture', {method:'PUT',body:JSON.stringify({code:'sarah is the goat',resetAll:true,expectedRevision,moves})});
test('whole-home reset is one durable revision and supports more than 100 pieces',async()=>{
 const {instance:r,ctx}=room();
 const moves=Array.from({length:150},(_,i)=>move(`f-piece-${i}`));
 assert.equal((await r.fetch(request(moves))).status,400);
 assert.equal((await r.fetch(reset(moves))).status,400);
 const response=await r.fetch(reset(moves,0));assert.equal(response.status,200);
 const state=await response.json();assert.equal(state.revision,1);
 assert.equal(Object.keys(state.pieces).length,150);
 assert.ok(Object.values(state.pieces).every(p=>p.revision===1));
 const loaded=await(await new DrawingRoom(ctx,{}).fetch(new Request('https://test/furniture'))).json();
 assert.deepEqual(loaded,state);
});
test('reset refuses any change since confirmation opened, without partially resetting',async()=>{
 const {instance:r}=room();
 await r.fetch(request([move('f-one')]));
 await r.fetch(request([move('f-other')]));
 assert.equal((await r.fetch(reset([move('f-one',1,0)],1))).status,409);
 assert.equal((await r.fetch(reset([move('f-one',1,0),move('f-other',0,0)],2))).status,409);
 const state=await(await r.fetch(new Request('https://test/furniture'))).json();
 assert.equal(state.revision,2);assert.equal(state.pieces['f-one'].pos[0],3);
 assert.equal((await r.fetch(reset([move('f-one',1,0),move('f-other',2,0)],2))).status,200);
});
