// #2237: the NES adapter's contract without a browser: key mapping and touch profile, lazy loading (nothing before start,
// once per start, retry after failure, no instance when left while loading), the real ROM driven by the vendored jsnes
// (input moves the sprite, pause freezes and lets go, catch-up bound, dispose frees). node --test src/nes.test.mjs
import test from 'node:test';import assert from 'node:assert/strict';
import { createRequire } from 'node:module';import { readFileSync } from 'node:fs';
import { NesGame, NES_KEYS, NES_PAD, NES_BUTTONS, nesUrl, loadEngine } from './nes.js';
import { NES } from './config.js';
import { NES_TITLES, nesTitle } from './nestitles.js';
import { createHash } from 'node:crypto';import { existsSync } from 'node:fs';

const jsnes=createRequire(import.meta.url)('./vendor/jsnes/jsnes.js');
const site=p=>new URL(`../${p}`,import.meta.url);
const romBytes=new Uint8Array(readFileSync(site(NES_TITLES[0].rom)));
const rom=()=>Promise.resolve(romBytes);
const game=(o={})=>{const calls={engine:0,rom:[]};const g=new NesGame({engine:()=>{calls.engine++;return Promise.resolve(jsnes);},rom:u=>{calls.rom.push(u);return rom();},...o});return {g,calls};};
const ms=1000/NES.hz;

test('documented keyboard mapping and the NES touch pad profile',()=>{
 for(const [k,b] of [['ArrowUp','up'],['KeyW','up'],['ArrowDown','down'],['KeyS','down'],['ArrowLeft','left'],['KeyA','left'],['ArrowRight','right'],['KeyD','right'],
  ['KeyZ','b'],['KeyK','b'],['KeyX','a'],['KeyJ','a'],['Enter','start'],['ShiftLeft','select'],['ShiftRight','select']])assert.equal(NES_KEYS[k],b,k);
 for(const k of ['Escape','KeyE','Space','KeyP'])assert.equal(NES_KEYS[k],undefined,`${k} stays with the computer (leave / start / pause)`);
 assert.deepEqual(NES_PAD.map(p=>p[0]).sort(),Object.keys(NES_BUTTONS).sort(),'every NES button once on the pad');
 assert(NES_PAD.every(p=>p.length===3&&p[2]),'aria labels');
 assert.deepEqual(NES_BUTTONS,{a:jsnes.Controller.BUTTON_A,b:jsnes.Controller.BUTTON_B,select:jsnes.Controller.BUTTON_SELECT,start:jsnes.Controller.BUTTON_START,up:jsnes.Controller.BUTTON_UP,down:jsnes.Controller.BUTTON_DOWN,left:jsnes.Controller.BUTTON_LEFT,right:jsnes.Controller.BUTTON_RIGHT});
});

test('lazy, same-origin load: nothing before start, the ROM path under src/, the cache buster carried over',async()=>{
 const {g,calls}=game();assert.equal(calls.engine,0);assert.deepEqual(calls.rom,[]);assert.equal(g.phase,'idle');
 const p=g.start();assert.equal(g.phase,'loading');await g.start();await p;
 assert.equal(calls.engine,1);assert.deepEqual(calls.rom,[NES_TITLES[0].rom]);assert.equal(g.phase,'running');
 assert.equal(nesUrl(NES.engine,'https://x.example/app/src/nes.js?v=abc123'),'https://x.example/app/src/vendor/jsnes/jsnes.js?v=abc123');
 assert.equal(nesUrl(`../${NES_TITLES[0].rom}`,'http://localhost:8521/src/nes.js?v=1'),'http://localhost:8521/data/nes/lightcatch/lightcatch.nes?v=1');
});

test('the browser loader adds one script, retries after a failed load',async()=>{
 const added=[];let fail=true;
 globalThis.document={createElement:()=>({dataset:{},remove(){}}),head:{append:s=>{added.push(s.src);queueMicrotask(()=>{if(fail)s.onerror();else{globalThis.jsnes=jsnes;s.onload();}});}}};
 try{
  await assert.rejects(loadEngine('https://x/src/vendor/jsnes/jsnes.js'),/kunde inte laddas/);
  fail=false;const [a,b]=await Promise.all([loadEngine('https://x/src/vendor/jsnes/jsnes.js'),loadEngine('https://x/src/vendor/jsnes/jsnes.js')]);
  assert.equal(a,jsnes);assert.equal(b,jsnes);assert.equal(added.length,2,'one retry, then shared');
  assert.equal(await loadEngine('ignored'),jsnes);assert.equal(added.length,2,'already loaded: no new request');
 }finally{delete globalThis.document;delete globalThis.jsnes;}
});

test('the real ROM: input moves the light, pause freezes and lets go, catch-up bound, dispose frees',async()=>{
 const {g}=game();await g.start();
 for(let i=0;i<10;i++)assert.equal(g.step(ms),1);assert.equal(g.frames,10);
 assert.equal(g.step(60_000),NES.catchUp,'a long stall emulates at most catchUp frames (no fast-forward)');
 const run=n=>{for(let i=0;i<n;i++)g.step(ms);};const x0=g.nes.cpu.mem[0];g.press('right',true);run(30);const x1=g.nes.cpu.mem[0];assert(x1>x0,`right moves x ${x0}→${x1}`);
 assert(g.pause());assert.equal(g.phase,'paused');assert.equal(g.held.size,0,'pause lets go of held buttons');
 const frozen=g.frames;assert.equal(g.step(500),0);assert.equal(g.frames,frozen);g.press('left',true);assert.equal(g.held.size,0,'no input while paused');
 assert(g.resume());run(20);assert.equal(g.nes.cpu.mem[0],x1,'resumed without the old held button');
 g.press('left',true);run(20);assert(g.nes.cpu.mem[0]<x1,'left moves back');g.press('left',false);
 const s=g.stats();assert(s.samples>0&&s.emuMedian>=0&&s.emuP95>=s.emuMedian,JSON.stringify(s));
 g.dispose();assert.equal(g.nes,null);assert.equal(g.pixels,null);assert.equal(g.phase,'over');assert.equal(g.step(1000),0);g.press('a',true);
 await g.start();assert.equal(g.nes,null,'a disposed game never restarts');
});

test('left while loading: no instance is built; a failed ROM shows an error and can be retried',async()=>{
 let release;const {g}=game({engine:()=>new Promise(r=>{release=()=>r(jsnes);})});
 const p=g.start();g.dispose();release();await p;assert.equal(g.nes,null);
 let fail=true;const h=new NesGame({engine:()=>Promise.resolve(jsnes),rom:()=>fail?Promise.reject(Error('Spelet kunde inte laddas. Försök igen.')):rom()});
 await h.start();assert.equal(h.phase,'error');assert.match(h.error,/Försök igen/);fail=false;await h.start();assert.equal(h.phase,'running');
});

test('the title manifest: every entry complete, its ROM and notice published under data/nes/, the hash and size right',()=>{
 assert(NES_TITLES.length>=1);assert.equal(NES_TITLES[0].id,'lightcatch');assert.equal(new Set(NES_TITLES.map(t=>t.id)).size,NES_TITLES.length);
 for(const t of NES_TITLES){
  for(const k of ['id','title','rom','sha256','license','notice','source','credit','about','controls'])assert.equal(typeof t[k],'string',`${t.id}.${k}`);
  assert.match(t.id,/^[a-z0-9-]+$/);assert.match(t.sha256,/^[0-9a-f]{64}$/);assert.match(t.rom,/^data\/nes\/.+\.nes$/);assert.match(t.notice,/^data\/nes\//);
  const b=readFileSync(site(t.rom));assert.equal(b.length,t.bytes,t.id);assert.equal(createHash('sha256').update(b).digest('hex'),t.sha256,t.id);
  assert.equal(b.subarray(0,4).toString('latin1'),'NES\x1a',`${t.id}: iNES header`);assert(existsSync(site(t.notice)),t.notice);
  const g=new NesGame({title:t.id});assert.equal(g.info,t);
 }
 assert.equal(nesTitle('nope'),NES_TITLES[0],'an unknown id falls back to the first');
});

test('a ROM whose hash or size differs from the manifest is refused',async()=>{
 const bad=new Uint8Array(romBytes);bad[100]^=1;
 const {g}=game({rom:()=>Promise.resolve(bad)});await g.start();assert.equal(g.phase,'error');assert.equal(g.nes,null);assert.match(g.error,/stämmer inte/);
 const {g:h}=game({rom:()=>Promise.resolve(romBytes.subarray(0,1000))});await h.start();assert.equal(h.phase,'error');
});
