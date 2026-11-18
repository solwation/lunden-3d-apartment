// #2072: deterministic metric aggregate and actual opt-in winter restoration.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { asphaltData, asphaltMaterial, asphaltTextures, asphaltUV } from '../src/asphaltsurface.js';
import { registerSnow, applySeason } from '../src/seasons.js';
import { ASPHALT_SURFACE as A } from '../src/config.js';
import { hasNativeVertexCompile } from '../src/vertexcompile.js';
test('aggregate is deterministic, shared and filtered at a fixed metre scale',()=>{
 const a=asphaltData(),b=asphaltData();assert.deepEqual(a,b);assert.equal(a.width,A.size);assert.equal(a.height,A.size);
 assert.ok(new Set(a.color).size>20,'visible restrained grain is present');
 const t=asphaltTextures();assert.equal(t,asphaltTextures());assert.equal(asphaltMaterial(),asphaltMaterial());
 assert.equal(t.color.repeat.x,1/A.tile);assert.deepEqual(t.color.repeat,t.surface.repeat);
 assert.equal(t.color.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(t.surface.minFilter,THREE.LinearMipmapLinearFilter);assert.ok(t.surface.generateMipmaps);
 assert.equal(t.color.colorSpace,THREE.SRGBColorSpace);assert.equal(t.surface.colorSpace,THREE.NoColorSpace);
});
test('metre UVs share phase across geometry without touching positions/normals/indices',()=>{
 const g=new THREE.PlaneGeometry(4,8).rotateX(-Math.PI/2).translate(-31,1.7,14),p=g.attributes.position,n=g.attributes.normal,idx=g.index,before=p.array.slice();
 assert.equal(asphaltUV(g),g);assert.equal(g.attributes.position,p);assert.equal(g.attributes.normal,n);assert.equal(g.index,idx);assert.deepEqual(p.array,before);
 for(let i=0;i<p.count;i++){assert.equal(g.attributes.uv.getX(i),p.getX(i));assert.equal(g.attributes.uv.getY(i),p.getZ(i));}
});
test('existing snow colour/map boundary also hides new relief/roughness and restores the same maps in summer',()=>{
 const m=asphaltMaterial(),t=asphaltTextures();registerSnow(m,0xd9dfe4);
 const unrelated=new THREE.MeshStandardMaterial({color:0x765432,roughness:.4});registerSnow(unrelated,0xffffff);
 for(const month of[6,1,7,12,6]){applySeason(month);const winter=[1,12].includes(month);assert.equal(m.map,winter?null:t.color);assert.equal(m.bumpMap,winter?null:t.surface);assert.equal(m.roughnessMap,winter?null:t.surface);assert.equal(m.roughness,winter?.7:1);assert.equal(m.color.getHex(),winter?0xd9dfe4:0xffffff);assert.equal(unrelated.roughness,.4);assert.equal(unrelated.bumpMap,null);}
 assert.ok(hasNativeVertexCompile(m),'fragment tone patch leaves native vertices and culling intact');
 const sh={fragmentShader:'#include <map_fragment>'};m.onBeforeCompile(sh);assert.match(sh.fragmentShader,/#ifdef USE_MAP[\s\S]*asphaltTone[\s\S]*#endif/,'broad tone is absent with winter colour map');
});
