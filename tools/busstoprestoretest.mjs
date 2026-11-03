import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {SITE} from '../src/config.js';
import {buildStreet} from '../src/street.js';
import {farSegments} from '../src/farwalk.js';
import {busStopSegments} from '../src/busstopgeo.js';
import {onRoad} from '../src/roads.js';
const baseline=JSON.parse(fs.readFileSync(new URL('../docs/verification/1843/baseline.json',import.meta.url)));
const labels=[];globalThis.document={createElement:()=>{const canvas={width:0,height:0};let ctx;ctx=new Proxy({canvas,measureText:s=>({width:s.length*(parseInt(ctx.font?.match(/\d+/)?.[0]??'32'))*.54}),fillText:s=>labels.push(s),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});canvas.getContext=()=>ctx;return canvas;}};
const hash=g=>createHash('sha256').update(new Uint8Array(g.attributes.position.array.buffer)).digest('hex');
const street=buildStreet(()=>0),children=street.object.children,triangles=children.reduce((n,o)=>n+(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1),0);
test('only completed local work is removed; both existing stop sites show exact ordinary stop name',()=>{
 const s=SITE.street;assert.equal(s.trafficLight,null);assert.deepEqual(s.warnings,[]);assert(!('moved'in s));assert.deepEqual(s.busStop,baseline.street.busStop);assert.deepEqual(s.restoredBusStop,baseline.street.moved);assert.equal(s.busStopName,'Lund S:t Lars Karpvägen');
 const unchanged={...s};delete unchanged.restoredBusStop;delete unchanged.busStopName;delete unchanged.busStopFaceOffset;Object.assign(unchanged,{trafficLight:baseline.street.trafficLight,warnings:baseline.street.warnings,moved:baseline.street.moved});assert.deepEqual(unchanged,baseline.street);
 const signs=children.filter(o=>o.name==='street-bus-stop-sign');assert.equal(signs.length,4);assert(signs.every(o=>o.userData.label===s.busStopName));assert(signs.every(o=>Math.min(...[s.busStop,s.restoredBusStop].map(at=>Math.hypot(o.position.x-at[0],o.position.z-at[1])))>.039),'bus-board faces clear the3 cm post radius');assert.equal(new Set(signs.map(o=>o.material.map)).size,1,'one shared ordinary-stop canvas replaces the red cover texture');assert(labels.includes('Lund S:t Lars')&&labels.includes('Karpvägen'));assert(!labels.includes('Flyttad'));
 for(const at of[s.busStop,s.restoredBusStop]){assert(!onRoad(at[0],at[1]));assert.equal(signs.filter(o=>Math.abs(o.position.x-at[0])<.05&&Math.abs(o.position.z-at[1])<.05).length,2);}
});
test('street/curb/crossing geometry, other signs, yellow island bollards and static collision data stay exact',()=>{
 assert.deepEqual(SITE.roads.map(({_samples,...source})=>source),baseline.roads);assert.deepEqual(SITE.busStop,baseline.busStop);assert.equal(farSegments().length,baseline.collision.farCount);assert.equal(createHash('sha256').update(JSON.stringify(farSegments())).digest('hex'),baseline.collision.farSHA256);assert.deepEqual(busStopSegments(),baseline.collision.busStop);
 for(let i=0;i<7;i++)assert.equal(hash(children[i].geometry),baseline.children[i].hash,'unchanged street surface/crossing/lamp/pool geometry '+i);
 for(const old of baseline.children.slice(17,27))assert(children.some(o=>o.geometry&&hash(o.geometry)===old.hash&&o.position.toArray().every((n,i)=>Math.abs(n-old.position[i])<1e-8)),'other sign retained at original position');
 const yellow=children.filter(o=>o.material?.color?.getHex()===0xf2c014);assert.equal(yellow.length,1);assert.equal((yellow[0].geometry.index?.count??yellow[0].geometry.attributes.position.count)/3,64,'the two existing island bollards remain');
 assert.equal(children.length,24);assert.equal(triangles,81828);let lights=0;street.object.traverse(o=>lights+=!!o.isLight);assert.equal(lights,0);street.update(0);street.update(1);
 console.log(JSON.stringify({before:{meshes:baseline.children.length,triangles:baseline.triangles},after:{meshes:children.length,triangles},delta:{meshes:children.length-baseline.children.length,triangles:triangles-baseline.triangles},collision:baseline.collision.farSHA256}));
});
