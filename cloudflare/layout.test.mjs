import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { privateCodeCredential, isPrivateCode } from '../src/privatecodes.js';
const { loadSecretTestInputs } = createRequire(import.meta.url)('../tools/secret-test-inputs.cjs');
const { codes } = loadSecretTestInputs();
if (!codes.every(isPrivateCode)) throw new Error('Secret test input does not match the current verifier');
import { DrawingRoom } from './worker.js';
const request = (moves, code=codes[0], ip='local') => new Request('https://test/furniture', { method:'PUT', headers:{'CF-Connecting-IP':ip}, body:JSON.stringify({code,moves}) });
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
 for (const code of codes) {
  const {instance:r}=room();
  const response=await r.fetch(request([move('f-sofa-0')],code));
  assert.equal(response.status,200);
  assert.equal((await response.json()).pieces['f-sofa-0'].revision,1);
 }
});

const reset = (moves, expectedRevision) => new Request('https://test/furniture', {method:'PUT',body:JSON.stringify({code:codes[1],resetAll:true,expectedRevision,moves})});
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

test('legacy Tilly group migrates once, preserves other layouts and newer individual posters', async()=>{
 const {ctx,instance:r}=room();
 const old='f-kposters-1-0-0-0-0', child='f-kposters-1-0-0-0-poster-nova';
 const previous={revision:7,pieces:{
  [old]:{revision:4,pos:[30,30,30],quat:[0,0,0,1]},
  [child]:{revision:6,pos:[.22,4.9,10],quat:[0,0,0,1]},
  'f-sofa-0':{revision:7,pos:[3,0,9],quat:[0,0,0,1]}}};
 await ctx.storage.put('furniture-layout',previous);
 const first=await(await r.fetch(new Request('https://test/furniture'))).json();
 assert.equal(first.revision,8);assert.equal(first.migrations.individualPosters,1);
 assert.equal(first.pieces[old],undefined);
 assert.deepEqual(first.pieces[child],previous.pieces[child]);
 assert.deepEqual(first.pieces['f-sofa-0'],previous.pieces['f-sofa-0']);
 assert.deepEqual(await(await r.fetch(new Request('https://test/furniture'))).json(),first);
 assert.equal((await r.fetch(request([move(old)]))).status,410);
 assert.equal((await r.fetch(request([move(child,6,1)]))).status,200);
 const second=await(await new DrawingRoom(ctx,{}).fetch(new Request('https://test/furniture'))).json();
 assert.equal(second.revision,9);assert.equal(second.pieces[child].pos[0],1);
 assert.equal(second.pieces[old],undefined);
});

test('legacy Verona pose migrates rigidly to three independent part ids once', async()=>{
 const {ctx,instance:r}=room();
 const old='f-veronasofa-0-4.29-13.09-0-0';
 const previous={revision:12,pieces:{[old]:{revision:8,pos:[3.5,0,15],quat:[0,Math.SQRT1_2,0,Math.SQRT1_2]}}};
 await ctx.storage.put('furniture-layout',previous);
 const first=await(await r.fetch(new Request('https://test/furniture'))).json();
 const ids=['f-veronasofa-0-4.6325-13.09-0-0','f-veronasofa-0-5.3175-14.07-0-0','f-veronasofa-0-5.3175-15.370000000000001-0-0'];
 assert.equal(first.revision,13);assert.equal(first.migrations.veronaModules,1);assert.equal(first.pieces[old],undefined);
 assert.deepEqual(ids.map(id=>first.pieces[id]?.revision),[13,13,13]);
 assert.ok(Math.abs(first.pieces[ids[0]].pos[0]-3.5)<1e-6);
 assert.ok(Math.abs(first.pieces[ids[0]].pos[2]-15.3425)<1e-6);
 assert.ok(Math.abs(first.pieces[ids[1]].pos[0]-2.52)<1e-6);
 assert.ok(Math.abs(first.pieces[ids[1]].pos[2]-16.0275)<1e-6);
 assert.ok(Math.abs(first.pieces[ids[2]].pos[0]-1.22)<1e-6);
 assert.ok(Math.abs(first.pieces[ids[2]].pos[2]-16.0275)<1e-6);
 assert.deepEqual(await(await r.fetch(new Request('https://test/furniture'))).json(),first);
 assert.equal((await r.fetch(request([move(old,8)]))).status,410);
});

test('legacy default Verona pose is retired without moving the new default parts', async()=>{
 const {ctx,instance:r}=room();const old='f-veronasofa-0-4.29-13.09-0-0';
 await ctx.storage.put('furniture-layout',{revision:2,pieces:{[old]:{revision:1,pos:[4.29,0,13.09],quat:[0,1,0,0]}}});
 const first=await(await r.fetch(new Request('https://test/furniture'))).json();
 assert.equal(first.migrations.veronaModules,1);assert.equal(first.pieces[old],undefined);
 assert.deepEqual(Object.keys(first.pieces),[]);
});


const credentialRequest = (moves, credential, extra={}) => new Request('https://test/furniture', {
 method:'PUT', headers:{'CF-Connecting-IP':'layout-credential-probe'}, body:JSON.stringify({credential,moves,...extra})
});
test('both versioned credentials write/read/reload through the real serialized DrawingRoom',async()=>{
 for (const code of codes) {
  const {ctx,instance:r}=room();
  const credential=privateCodeCredential(code);
  assert.equal((await r.fetch(credentialRequest([move('f-protocol')],credential))).status,200);
  const loaded=await(await new DrawingRoom(ctx,{}).fetch(new Request('https://test/furniture'))).json();
  assert.equal(loaded.revision,1);assert.equal(loaded.pieces['f-protocol'].pos[0],3);
  assert.equal((await r.fetch(credentialRequest([move('f-protocol',0,8)],credential))).status,409);
  assert.equal((await r.fetch(credentialRequest([move('f-protocol',1,8)],credential,{resetAll:true,expectedRevision:1}))).status,200);
  assert.equal((await r.fetch(credentialRequest([{...move('f-bad'),quat:[0,0,0,0]}],credential))).status,400);
  assert.equal((await r.fetch(credentialRequest([move('f-kposters-1-0-0-0-0')],credential))).status,410);
  assert.equal((await(await new DrawingRoom(ctx,{}).fetch(new Request('https://test/furniture'))).json()).revision,2);
 }
});
test('legacy inputs retain exact case/spacing and malformed credentials are refused without writes',async()=>{
 const {instance:r}=room();
 for (const code of codes) for (const input of [code.toUpperCase(),` ${code}`,`${code} `,code.replace(' ','  '),`/${code}`]) {
  assert.equal((await r.fetch(request([move('f-rejected')],input,'layout-input-probe'))).status,403);
 }
 const valid=privateCodeCredential(codes[0]);
 for (const credential of [null,{},valid.digest,{...valid,version:2},{...valid,version:'1'},{...valid,digest:valid.digest.toUpperCase()},
  {...valid,digest:'0'.repeat(64)},{...valid,extra:true},[valid],{version:1,digest:42}]) {
  assert.equal((await r.fetch(credentialRequest([move('f-rejected')],credential))).status,403);
 }
 assert.equal((await(await r.fetch(new Request('https://test/furniture'))).json()).revision,0);
});

// #995: the same real serialized layout room accepts independent surface patches.
test('shared rug material edits preserve old moves, concurrent fields and rejected atomic batches', async () => {
 const {RUG_MATERIAL_IDS}=await import('../src/materialcatalog.js');const id=RUG_MATERIAL_IDS[0],other=RUG_MATERIAL_IDS[1];
 const {instance:r,ctx}=room();
 let requests=0;const put=b=>r.fetch(new Request('https://test/furniture',{method:'PUT',headers:{'CF-Connecting-IP':`995-${++requests}`},body:JSON.stringify({code:codes[0],...b})}));
 const get=async()=>await(await r.fetch(new Request('https://test/furniture'))).json();
 const material=(choice,base=0,target=id)=>({id:target,surface:'textile',choice,base});
 assert.equal((await get()).materialVersion,1);assert.equal((await get()).materials,undefined);
 const parallel=await Promise.all([put({moves:[move(id)]}),put({materials:[material('rug-bluegrey')]})]);
 assert.deepEqual(parallel.map(x=>x.status),[200,200]);
 let state=await get();assert.equal(state.pieces[id].pos[0],3);assert.equal(state.materials[id].textile.choice,'rug-bluegrey');
 assert.equal((await put({moves:[move(id,state.pieces[id].revision,5)]})).status,200);
 state=await get();assert.equal(state.materials[id].textile.choice,'rug-bluegrey');assert.equal(state.pieces[id].pos[0],5);
 const before=structuredClone(state);assert.equal((await put({moves:[move(other)],materials:[material('rug-sand',0)]})).status,409);
 assert.deepEqual(await get(),before);
 for(const materials of [[material('unknown')],[{...material('rug-sand'),surface:'wood'}],[material('rug-sand',0,'f-sofa-0')],[material('rug-sand'),material('rug-olive')],[{...material('original'),base:-1}],{}])assert.equal((await put({materials})).status,400);
 assert.deepEqual(await get(),before);
 const results=await Promise.all([put({materials:[material('rug-check',state.materials[id].textile.revision)]}),put({materials:[material('rug-stripe',state.materials[id].textile.revision)]})]);
 assert.deepEqual(results.map(x=>x.status),[200,409]);assert.equal((await results[1].json()).state.materialVersion,1);
 state=await get();assert.equal((await put({materials:[material('original',state.materials[id].textile.revision)]})).status,200);
 const reloaded=await(await new DrawingRoom(ctx,{}).fetch(new Request('https://test/furniture'))).json();
 assert.equal(reloaded.materials[id].textile.choice,'original');assert.equal(reloaded.pieces[id].pos[0],5);
 // Future/unrecognized stored choices are retained by a cached old client's pose-only PUT.
 const raw=await ctx.storage.get('furniture-layout');raw.materials['f-future']={cloth:{choice:'future-v2',revision:raw.revision}};await ctx.storage.put('furniture-layout',raw);
 assert.equal((await put({moves:[move(other)]})).status,200);assert.deepEqual((await get()).materials['f-future'],raw.materials['f-future']);
});

test('fixed curtain surfaces share material patches without fictitious poses or changing rug compatibility', async () => {
 const M=await import('../src/materialcatalog.js');const {instance:r}=room();let count=0;
 const put=materials=>r.fetch(new Request('https://test/furniture',{method:'PUT',headers:{'CF-Connecting-IP':`997-${++count}`},body:JSON.stringify({credential:privateCodeCredential(codes[0]),materials})}));
 const get=async()=>await(await r.fetch(new Request('https://test/furniture'))).json();
 assert.equal(M.CURTAIN_MATERIAL_IDS.length,6);assert.equal(new Set(M.CURTAIN_MATERIAL_IDS).size,6);
 assert.deepEqual(M.MATERIAL_CHOICES.map(c=>c.id),['original','rug-sand','rug-bluegrey','rug-olive','rug-stripe','rug-check']);
 for(const id of M.CURTAIN_MATERIAL_IDS){
  const response=await put([{id,surface:'textile',choice:'curtain-stripe',base:0}]);assert.equal(response.status,200);
  const state=await response.json();assert.equal(state.materials[id].textile.choice,'curtain-stripe');assert.equal(state.pieces[id],undefined);
 }
 const before=await get();assert.deepEqual(before.pieces,{});
 for(const [id,choice] of [[M.CURTAIN_MATERIAL_IDS[0],'rug-bluegrey'],[M.RUG_MATERIAL_IDS[0],'curtain-bluegrey'],['f-curtain-guessed','curtain-sand']])assert.equal((await put([{id,surface:'textile',choice,base:0}])).status,400);
 assert.deepEqual(await get(),before);
 const id=M.CURTAIN_MATERIAL_IDS[0],base=before.materials[id].textile.revision;
 const conflict=await put([{id,surface:'textile',choice:'original',base:0}]);assert.equal(conflict.status,409);assert.equal((await conflict.json()).state.materialVersion,1);
 assert.equal((await put([{id,surface:'textile',choice:'original',base}])).status,200);
 // A cached pre-family client can still move a rug without losing any fixed curtain selection.
 const legacy=await r.fetch(request([move(M.RUG_MATERIAL_IDS[0])],codes[0],'997-legacy'));assert.equal(legacy.status,200);
 assert.equal((await get()).materials[M.CURTAIN_MATERIAL_IDS[1]].textile.choice,'curtain-stripe');
});


test('six real upholstered seats accept only their family and preserve legacy poses/materials', async () => {
 const M=await import('../src/materialcatalog.js');const {instance:r}=room();let count=0;
 const put=b=>r.fetch(new Request('https://test/furniture',{method:'PUT',headers:{'CF-Connecting-IP':`1010-${++count}`},body:JSON.stringify({credential:privateCodeCredential(codes[0]),...b})}));
 const get=async()=>await(await r.fetch(new Request('https://test/furniture'))).json();
 assert.equal(M.UPHOLSTERY_MATERIAL_IDS.length,6);assert.equal(new Set(M.UPHOLSTERY_MATERIAL_IDS).size,6);
 for(const id of M.UPHOLSTERY_MATERIAL_IDS){assert.equal((await put({materials:[{id,surface:'textile',choice:'upholstery-stripe',base:0}]})).status,200);}
 const before=await get();assert.equal(before.materialVersion,1);assert.deepEqual(before.pieces,{});
 for(const [id,choice] of [[M.UPHOLSTERY_MATERIAL_IDS[0],'rug-bluegrey'],[M.RUG_MATERIAL_IDS[0],'upholstery-bluegrey'],[M.CURTAIN_MATERIAL_IDS[0],'upholstery-check'],['f-sofa-guessed','upholstery-sand']])assert.equal((await put({materials:[{id,surface:'textile',choice,base:0}]})).status,400);
 assert.deepEqual(await get(),before);
 const id=M.UPHOLSTERY_MATERIAL_IDS[0],base=before.materials[id].textile.revision;
 assert.equal((await put({moves:[move(id)]})).status,200);assert.equal((await get()).materials[id].textile.choice,'upholstery-stripe');
 assert.equal((await put({materials:[{id,surface:'textile',choice:'original',base:0}]})).status,409);
 assert.equal((await put({materials:[{id,surface:'textile',choice:'original',base}]})).status,200);
 const after=await get();assert.deepEqual(after.pieces[id].pos,move(id).pos);assert.equal(after.materials[id].textile.choice,'original');
 assert.equal(after.materials[M.UPHOLSTERY_MATERIAL_IDS[1]].textile.choice,'upholstery-stripe');
});


test('eight interior cushion/throw surfaces use independent revisions and retain all existing fields', async () => {
 const M=await import('../src/materialcatalog.js'), {instance:r,ctx}=room();let serial=0;
 const put=b=>r.fetch(new Request('https://test/furniture',{method:'PUT',headers:{'CF-Connecting-IP':`1014-${++serial}`},body:JSON.stringify({credential:privateCodeCredential(codes[0]),...b})}));
 const get=async()=>await(await r.fetch(new Request('https://test/furniture'))).json();
 const entries=Object.entries(M.CUSHION_MATERIAL_SURFACES);assert.deepEqual(entries.map(([,s])=>s.length),[5,3]);
 const [id,surfaces]=entries[0],first=surfaces[0],second=surfaces[1];
 for(const [piece,parts] of entries)for(const surface of parts)assert.equal((await put({materials:[{id:piece,surface,choice:'upholstery-stripe',base:0}]})).status,200);
 const before=await get();assert.deepEqual(before.pieces,{});
 // Different surfaces may confirm concurrently from their own revision, despite global changes.
 const writes=await Promise.all([put({materials:[{id,surface:first,choice:'upholstery-sand',base:before.materials[id][first].revision}]}),put({materials:[{id,surface:second,choice:'upholstery-olive',base:before.materials[id][second].revision}]})]);assert.deepEqual(writes.map(r=>r.status),[200,200]);
 assert.equal((await put({materials:[{id,surface:first,choice:'original',base:before.materials[id][first].revision}]})).status,409);
 for(const [piece,surface,choice] of [[id,'cushion-guessed','upholstery-sand'],[entries[1][0],first,'upholstery-sand'],[M.RUG_MATERIAL_IDS[0],first,'upholstery-sand'],[id,first,'rug-check'],['f-sofa-guessed',first,'upholstery-check']])assert.equal((await put({materials:[{id:piece,surface,choice,base:0}]})).status,400);
 assert.equal((await put({moves:[move(id)],materials:[{id,surface:'textile',choice:'upholstery-bluegrey',base:0}]})).status,200);
 let after=await get();assert.equal(after.materials[id][first].choice,'upholstery-sand');assert.equal(after.materials[id][second].choice,'upholstery-olive');assert.equal(after.materials[id].textile.choice,'upholstery-bluegrey');assert.equal(after.pieces[id].pos[0],3);
 assert.equal((await put({moves:[move(id,after.pieces[id].revision,5)]})).status,200);
 after=await get();assert.equal(after.materials[id][first].choice,'upholstery-sand');assert.equal(after.materials[entries[1][0]][entries[1][1][0]].choice,'upholstery-stripe');
 const reload=await(await new DrawingRoom(ctx,{}).fetch(new Request('https://test/furniture'))).json();assert.deepEqual(reload,after);
});
