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
test('all original RNG/draw/yield/cache/geometry/material/bark source is retained outside the colour-context and tint hooks',()=>{
 const original=execFileSync('git',['show',baseline+':src/foliage.js'],{encoding:'utf8'}),current=readFileSync('src/foliage.js','utf8').replace("import {leafRgbContext,leafTone,leafSideVeins} from './leafrgb.js';\n",'').replace("    if(g.globalCompositeOperation!=='destination-out')leafTone(g,k,l,w,!rib);\n",'').replace('    if(rib&&l>6)leafSideVeins(g,l,w,S);\n','').replace("const g = leafRgbContext(c.getContext('2d', { willReadFrequently: true })), r = rng(679);","const g = c.getContext('2d', { willReadFrequently: true }), r = rng(679);");assert.equal(current,original);
 for(const f of['src/config.js','src/lod.js','src/seasons.js','src/barksurface.js'])assert.equal(readFileSync(f,'utf8'),execFileSync('git',['show',baseline+':'+f],{encoding:'utf8'}));
});
