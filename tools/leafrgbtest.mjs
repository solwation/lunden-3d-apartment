import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';
import{leafTone,leafSideVeins}from'../src/leafrgb.js';
const baseline='a366067a79ab90a67abc5a66b3db205f67788506';
test('opaque tint has bounded stops, no alpha and a quieter core without randomness',()=>{
 for(const core of[false,true]){const stops=[],g={createLinearGradient(...coords){assert(coords.every(Number.isFinite));return{addColorStop(at,colour){stops.push([at,colour]);}}}};leafTone(g,180,20,8,core);assert.equal(stops.length,3);assert.deepEqual(stops.map(s=>s[0]),[0,.4,1]);for(const[,s]of stops){assert(s.startsWith('rgb('));const a=s.match(/\d+/g).map(Number);assert(a.every(n=>n>=100&&n<=205));}}
 assert(!/Math\.random|rng\(|new .*Texture/.test(readFileSync('src/leafrgb.js','utf8')));
});
test('side veins preserve context, use the current leaf clip and source-atop, with two or three pairs',()=>{
 for(const[l,pairs]of[[12,2],[30,3]]){const calls=[],g={save(){calls.push('save')},clip(){calls.push('clip')},beginPath(){calls.push('begin')},moveTo(...a){calls.push(['move',...a])},quadraticCurveTo(...a){assert(a.every(Number.isFinite));calls.push(['curve',...a])},stroke(){assert.equal(this.globalCompositeOperation,'source-atop');calls.push('stroke')},restore(){calls.push('restore')}};leafSideVeins(g,l,l*.4,512);assert.equal(calls[0],'save');assert.equal(calls[1],'clip');assert.equal(calls.at(-1),'restore');assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==='curve').length,pairs*2);assert(g.lineWidth<.5);}
});
// Function-level contract (#2113, #2085): only leafAtlasParts (RNG order, draw order, yields, alpha) is compared with the frozen base;
// whole files are not, so unrelated edits (config blocks, #2101 wind sway in foliage.js) cannot fail this test.
const baseOf=(f)=>execFileSync('git',['show',baseline+':'+f],{encoding:'utf8'});
const atlasFn=(text)=>{const m=text.match(/^export function\* leafAtlasParts\(\) \{[\s\S]*?^\}/m);assert(m,'leafAtlasParts found');return m[0];};
test('leafAtlasParts keeps its original RNG/draw/yield/alpha source outside the colour-context and tint hooks',()=>{
 const src=readFileSync('src/foliage.js','utf8'),hooks=[
  ["import {leafRgbContext,leafTone,leafSideVeins} from './leafrgb.js';\n"],
  ["    if(g.globalCompositeOperation!=='destination-out')leafTone(g,k,l,w,!rib);\n"],
  ['    if(rib&&l>6)leafSideVeins(g,l,w,S);\n']];
 for(const[h]of hooks)assert.equal(src.split(h).length,2,'exactly one hook: '+h.trim());
 let fn=atlasFn(src);
 for(const[h]of hooks.slice(1))fn=fn.replace(h,'');
 fn=fn.replace("const g = leafRgbContext(c.getContext('2d', { willReadFrequently: true })), r = rng(679);","const g = c.getContext('2d', { willReadFrequently: true }), r = rng(679);");
 assert.equal(fn,atlasFn(baseOf('src/foliage.js')));
});
test('the hooks are the only leafrgb use in the source; unrelated modules stay free of it',()=>{
 for(const f of['src/config.js','src/lod.js','src/seasons.js','src/barksurface.js'])assert(!/leafrgb|leafTone|leafSideVeins/.test(readFileSync(f,'utf8')),f);
});
