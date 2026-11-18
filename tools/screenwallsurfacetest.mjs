import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { SCREEN_WALL as W, SCREEN_WALL_SURFACE as S } from '../src/config.js';
import { screenSurfaceData, screenWallSurface, screenGrainOffset } from '../src/screenwallsurface.js';
import { screenWallParts } from '../src/screenwall.js';
const sample=(d,x,y)=>Array.from(d.data.slice(((d.height-1-y)*d.width+x)*4,((d.height-1-y)*d.width+x)*4+2));
test('deterministic shallow joints follow the existing 32-pixel board repeat and soften their edges',()=>{
 const d=screenSurfaceData();assert.deepEqual(d,screenSurfaceData());assert.equal(d.width,32*W.boards);assert.equal(d.height,512);
 for(let b=0;b<W.boards;b++){assert.equal(sample(d,b*32,100)[0],Math.round(S.jointHeight*255));assert.equal(sample(d,b*32+16,100)[0],255);const edge=sample(d,b*32+2,100)[0];assert.ok(edge>sample(d,b*32,100)[0]&&edge<255);}
 for(let y=0;y<512;y++)assert.deepEqual(sample(d,0,y),sample(d,d.width-1,y),'repeat boundary has the same joint');
 assert.ok(S.depth*(1-S.jointHeight)<.001,'painted groove relief is under one mm');
});
test('all post and horizontal-face UVs sample a constant cream-rail surface, with scalar maps shared',()=>{
 const d=screenSurfaceData();for(let y=0;y<d.rail;y++)for(let x=0;x<d.width;x++)assert.deepEqual(sample(d,x,y),[255,Math.round(S.frameRoughness*255)]);
 for(const args of [[1,1.05,0,1.8,2,5],[1,4,8,9.8,2,2.06]]){
  const parts=screenWallParts(...args);for(let j=0;j<parts.length;j++){const g=parts[j],uv=g.attributes.uv,n=g.attributes.normal;for(let i=0;i<uv.count;i++)if(j>0||Math.abs(n.getY(i))>.5){assert.equal(uv.getY(i),Math.fround(.995));const x=Math.floor(((uv.getX(i)%1+1)%1)*d.width),y=Math.floor((1-uv.getY(i))*d.height);assert.deepEqual(sample(d,x,y),[255,Math.round(S.frameRoughness*255)]);}g.dispose();}
 }
 const s=screenWallSurface();assert.equal(s,screenWallSurface());assert.equal(s.bumpMap,s.roughnessMap);assert.equal(s.bumpMap.colorSpace,T.NoColorSpace);assert.equal(s.bumpMap.wrapT,T.ClampToEdgeWrapping);assert.equal(s.bumpMap.minFilter,T.LinearMipmapLinearFilter);
});
test('fibre paths bend gently and stay bounded rather than making broad stripes',()=>{
 for(const phase of[0,.73,2.1,8.3]){const a=Array.from({length:101},(_,i)=>screenGrainOffset(i/100,phase));assert.ok(a.every(Number.isFinite));assert.ok(Math.max(...a)-Math.min(...a)>.5);assert.ok(Math.max(...a.map(Math.abs))<S.grainBend*1.29);for(let i=1;i<a.length;i++)assert.ok(Math.abs(a[i]-a[i-1])<.12);}
});
