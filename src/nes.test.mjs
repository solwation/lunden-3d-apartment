// #2237: the NES adapter's contract without a browser: key mapping and touch profile, lazy loading (nothing before start,
// once per start, retry after failure, no instance when left while loading), the real ROM driven by the vendored jsnes
// (input moves the sprite, pause freezes and lets go, catch-up bound, dispose frees). node --test src/nes.test.mjs
import test from 'node:test';import assert from 'node:assert/strict';
import { createRequire } from 'node:module';import { readFileSync } from 'node:fs';
import { NesGame, NES_KEYS, NES_PAD, NES_BUTTONS, nesUrl, loadEngine } from './nes.js';
import { NES } from './config.js';

const jsnes=createRequire(import.meta.url)('./vendor/jsnes/jsnes.js');
const romBytes=readFileSync(new URL('./nesroms/lightcatch.nes',import.meta.url));
const rom=()=>Promise.resolve(String.fromCharCode(...romBytes));
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
 assert.equal(calls.engine,1);assert.deepEqual(calls.rom,[NES.titles.lightcatch.rom]);assert.equal(g.phase,'running');
 assert.equal(nesUrl(NES.engine,'https://x.example/app/src/nes.js?v=abc123'),'https://x.example/app/src/vendor/jsnes/jsnes.js?v=abc123');
 assert.equal(nesUrl(NES.titles.lightcatch.rom,'http://localhost:8521/src/nes.js'),'http://localhost:8521/src/nesroms/lightcatch.nes');
 assert.equal(romBytes.length,NES.titles.lightcatch.bytes);
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
