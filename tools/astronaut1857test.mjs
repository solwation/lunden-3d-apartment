import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Player} from '../src/player.js';
import {JETPACK} from '../src/config.js';
import {MEDALS,levelsFrom,thresholdOf} from '../src/medalcatalog.js';
import {evaluate,mergeServer} from '../src/medals.js';
import {boardCounters,COUNTERS} from '../src/boardcatalog.js';
import {clampCounters,record} from '../cloudflare/boards.js';
// Analytic empty outdoor volume: actual Player.update vertical physics, no rendered world.
function flight({y=0,ceiling=Infinity,indoor=false}={}) {
 const p=new Player({size:{x:0,z:0},roofs:{above:()=>ceiling}},new THREE.PerspectiveCamera());
 for(const [k,v] of Object.entries({outdoors:!indoor,aloft:false,inCore:false,inPlayroom:false,unit:null,below:false,canClimb:false}))Object.defineProperty(p,k,{get:()=>v});
 Object.assign(p,{unstick:()=>false,groundAt:()=>0,segments:()=>[[],[]],slideStep(){this.slideD={x:0,z:0}},blockedByStair:()=>false,blockedByBridgeFill:()=>false,inFootprint:()=>true,deckCeil:()=>Infinity,ceilingAt:()=>ceiling,splashCheck:()=>false});
 p.pos.set(-120,y,0);p.jet={worn:true,on:true,lift(){return this.on?JETPACK.thrust:0}};p.height=0;p.onJetRise=n=>p.height+=n;return p;
}
test('actual ascent sums metres, independent of per-frame rounding at 20/60/120 Hz',()=>{
 for(const hz of[20,60,120]){const p=flight();for(let i=0;i<hz*5;i++)p.update(1/hz);assert.ok(p.height>24&&p.height<30);assert.ok(Math.abs(p.height-p.pos.y)<1e-10);}
});
test('descent, unworn/indoor pack, ground steps, ceiling and spawn never credit height',()=>{
 const p=flight({y:20});p.jet.on=false;p.vy=-2;p.update(.05);assert.equal(p.height,0);
 p.jet.worn=false;p.vy=5;p.update(.05);assert.equal(p.height,0);
 const indoor=flight({indoor:true});indoor.update(.05);assert.equal(indoor.height,0);
 const top=flight({y:10,ceiling:10.5});top.vy=5;top.update(.05);assert.equal(top.height,0);
 const step=flight();step.groundAt=()=>10;step.jet.on=false;step.update(.05);assert.equal(step.pos.y,10);assert.equal(step.height,0);
 p.groundAt=()=>200;p.spawn(-150,0,0);assert.equal(p.height,0);p.jet.worn=true;p.jet.on=false;p.update(.05);assert.equal(p.height,0);
});
test('paused time and restored position do not replay already counted altitude',()=>{
 const p=flight();p.update(.05);const old=p.height;
 const reload=flight({y:p.pos.y});reload.jet.on=false;reload.update(.05);assert.equal(reload.height,0);
 p.pos.y+=100;p.jet.on=false;p.vy=0;p.update(.05);assert.equal(p.height,old);
});
test('Astronaut has stable independent id, curve and exactly-once existing medal bonus',()=>{
 const m=MEDALS.find(m=>m.id==='astronaut');assert.equal(m.name,'Astronaut');assert.deepEqual([1,2,3].map(l=>thresholdOf(m,l)),[100,250,475]);
 const s={jetpackMetres:99.999,flights:0};let paid=0;const pay=n=>paid+=n;
 assert.equal(evaluate(s,{seeded:true,pay}).gained.length,0);s.jetpackMetres=100.001;assert.equal(evaluate(s,{seeded:true,pay}).gained[0].id,'astronaut');assert.equal(paid,10);
 const reload=JSON.parse(JSON.stringify(s));evaluate(reload,{seeded:true,pay});mergeServer(reload,{astronaut:[1000]});evaluate(reload,{seeded:true,pay});assert.equal(paid,10);assert.equal(reload.medals.jetpack,undefined);
 const old={};evaluate(old,{seeded:false,pay});assert.equal(old.medals.astronaut,undefined);assert.equal(paid,10);
 const restored={jetpackMetres:250};evaluate(restored,{seeded:false,pay});assert.equal(restored.medals.astronaut.l,2);assert.equal(paid,10);
});
test('real Worker catalogue floors only at sync, bounds growth and derives Astronaut',async()=>{
 assert.deepEqual(boardCounters({jetpackMetres:100.9}),{jetpackMetres:100});assert.ok(COUNTERS.jetpackMetres.perMin>=JETPACK.climb*JETPACK.thin.climb*60);
 const t=1e12;assert.equal(clampCounters({jetpackMetres:1e9},null,t).jetpackMetres,100000);
 assert.equal(clampCounters({jetpackMetres:1e9},{c:{jetpackMetres:100},t},t+60000).jetpackMetres,2500);
 const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),list:async()=>map,delete:async k=>map.delete(k)};
 await record(storage,{id:'astronaut-fixture',name:'Test',c:{jetpackMetres:100}},t);assert.equal(map.get('b:astronaut-fixture').c.jetpackMetres,100);assert.equal(levelsFrom(map.get('b:astronaut-fixture').c).astronaut,1);
});
