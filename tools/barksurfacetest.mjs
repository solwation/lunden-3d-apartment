import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { barkSurfaceData, barkMarks, barkSurfaceTexture, applyBarkSurface } from '../src/barksurface.js';
import { BARK_SURFACE as S } from '../src/config.js';
import { lodFarTrunkMaterial, trunkGeometry } from '../src/foliage.js';
import { lodRange, patchDitherLod } from '../src/lod.js';
import { hasNativeVertexCompile } from '../src/vertexcompile.js';
const values=(d,channel)=>Array.from({length:d.width*d.height},(_,i)=>d.data[i*4+channel]/255);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
test('deterministic registered bark height and roughness, bounded smooth wrap and opaque packed channels',()=>{
 const d=barkSurfaceData(),again=barkSurfaceData();assert.deepEqual(d,again);
 assert.deepEqual([d.width,d.height],[64,128]);
 const h=values(d,0),r=values(d,1),mh=mean(h),mr=mean(r);
 const covariance=mean(h.map((v,i)=>(v-mh)*(r[i]-mr)));assert.ok(covariance<-.0001,'lower furrows are rougher');
 assert.ok(Math.max(...h)-Math.min(...h)>.10);assert.ok((Math.max(...h)-Math.min(...h))*S.bark.bump<.0015);
 assert.ok(r.every(v=>v>=S.bark.roughness[0]-1/255&&v<=S.bark.roughness[1]+1/255));
 assert.ok(values(d,2).every(v=>v===0));assert.ok(values(d,3).every(v=>v===1));
 for(let y=0;y<d.height;y++)assert.ok(Math.abs(d.data[y*d.width*4]-d.data[(y*d.width+d.width-1)*4])<45,'wrapped furrows have no hard border');
 // Existing colour's first authored furrow from seed3, no calls to global RNG.
 let seed=3;const rand=()=>((seed=seed*16807%2147483647)/2147483647);assert.deepEqual(barkMarks('bark')[0],{x:rand()*64,w:1+rand()*3});
});
test('birch lenticels change finish while relief stays a gentle independent surface',()=>{
 const d=barkSurfaceData('birch'),h=values(d,0),r=values(d,1),marks=barkMarks('birch'),dark=[],light=[];
 assert.deepEqual(d,barkSurfaceData('birch'));
 for(let y=0;y<d.height;y++)for(let x=0;x<d.width;x++){
  const marked=marks.some(m=>{const dx=((x+.5-m.x)%64+64)%64;return dx<m.w&&y+.5>=m.y&&y+.5<m.y+m.h});(marked?dark:light).push((d.height-1-y)*d.width+x);
 }
 const avg=(a,v)=>mean(a.map(i=>v[i]));assert.ok(avg(dark,r)>avg(light,r)+.025,'dark lenticels are mildly more matte');
 assert.ok(Math.abs(avg(dark,h)-avg(light,h))<.015,'no colour-driven dark holes');
 assert.ok((Math.max(...h)-Math.min(...h))*S.birch.bump<.00016);
 assert.ok(r.every(v=>v>=S.birch.roughness[0]-1/255&&v<=S.birch.roughness[1]+1/255));
});
test('shared maps retain UV/mip/cache/native vertex semantics; dither/depth/far geometry stays cheap',()=>{
 const t=barkSurfaceTexture();assert.equal(t,barkSurfaceTexture());assert.notEqual(t,barkSurfaceTexture('birch'));
 assert.deepEqual(t.repeat.toArray(),[1,2]);assert.equal(t.flipY,false);assert.equal(t.colorSpace,T.NoColorSpace);
 assert.equal(t.generateMipmaps,true);assert.equal(t.minFilter,T.LinearMipmapLinearFilter);
 assert.equal(t.image.data.byteLength,32768);
 const m=applyBarkSurface(new T.MeshStandardMaterial());assert.equal(m.bumpMap,m.roughnessMap);assert.equal(m.bumpMap,t);assert.ok(hasNativeVertexCompile(m));
 const range=lodRange(46,54),near=patchDitherLod(m,{far:false,range}),far=lodFarTrunkMaterial(range);
 assert.ok(hasNativeVertexCompile(near));assert.equal(near.bumpMap,t);assert.equal(far.material.map,null);assert.equal(far.material.bumpMap,null);assert.equal(far.material.roughnessMap,null);assert.equal(far.depth.map,null);
 assert.equal(trunkGeometry().attributes.position.count/3,46);assert.equal(trunkGeometry(true).attributes.position.count/3,14);
});
