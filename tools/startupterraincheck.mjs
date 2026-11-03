// #1838: actual authored height/river inputs, cache hits and post-release uncached equality.
import {register} from 'node:module';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=pathToFileURL((process.env.THREE_DIR||'/home/devcontainers/.cache/three-0.170.0')+'/').href;
register('data:text/javascript,'+encodeURIComponent(`const root=${JSON.stringify(root)};export async function resolve(s,c,n){if(s==='three')return{url:root+'build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return{url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
globalThis.location={search:process.argv.includes('--off')?'?buildcache=off':''};
const {groundY,renderedTerrainY}=await import('../src/surroundings.js');
const {riverAt}=await import('../src/riverbridge.js');
const {finishStartupCaches}=await import('../src/startupcache.js');
const points=[];for(let z=-240;z<=480;z+=8)for(let x=-240;x<=300;x+=8)points.push([x+.125,z+.375]);
const read=()=>points.map(([x,z])=>[groundY(x,z),renderedTerrainY(x,z),riverAt(x,z)]);
const first=read(),hits=read();assert.deepEqual(hits,first);
const released=finishStartupCaches();assert(released.every(c=>!c.active&&c.entries===0));
const raw=read();assert.deepEqual(raw,first,'same exact original samplers after releasing every build entry');
console.log(JSON.stringify({points:points.length,sha256:createHash('sha256').update(JSON.stringify(first)).digest('hex'),released},null,2));
