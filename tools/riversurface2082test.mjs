import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RIVER_SURFACE as C,COLORS,EDGE_BACKDROP as E} from '../src/config.js';
import {riverRippleSlope,riverRippleWeight,riverSurface} from '../src/riversurface.js';
import {waterYAt} from '../src/riverbridge.js';

test('deterministic finite slopes stay below 0.055; distance and pixel footprint fully suppress far ripples',()=>{
 let max=0;for(let x=-1400;x<1300;x+=23.13)for(let z=-450;z<500;z+=19.71){
  const n=riverRippleSlope(x,z);assert.deepEqual(n,riverRippleSlope(x,z));assert(n.every(Number.isFinite));max=Math.max(max,Math.hypot(...n));assert(Math.hypot(...n)<=.055+1e-12);
  for(const d of [45,100,1000])assert.deepEqual(riverRippleSlope(x,z,d),[0,0]);
 }
 assert(max>.039);assert.equal(riverRippleWeight(0),1);assert.equal(riverRippleWeight(12),1);assert.equal(riverRippleWeight(45),0);assert.equal(riverRippleWeight(0,.12),0);
 let last=1;for(let d=12;d<=45;d+=.5){const f=riverRippleWeight(d);assert(f<=last);last=f;}
});

test('the two continuation water planes share the same world phase; mask excludes other colours/heights and winter colourless land',()=>{
 assert.equal(E.rivers.length,2);const levels=E.rivers.map(r=>waterYAt(...r.path[0])),color=new T.Color(COLORS.water),rgb=color.toArray();
 const mask=(c,y,colored=true)=>colored&&Math.hypot(...c.map((v,i)=>v-rgb[i]))<.00001&&Math.min(...levels.map(h=>Math.abs(y-h)))<C.levelTolerance;
 for(const r of E.rivers){const y=waterYAt(...r.path[0]);for(const[x,z]of r.path){
  assert.deepEqual(riverRippleSlope(x,z),riverRippleSlope(x,z));assert(mask(rgb,Math.fround(y)));assert(!mask(rgb,y+.1));assert(!mask([1,1,1],y));assert(!mask(rgb,y,false));
 }}
 assert(!mask(rgb,E.level+E.lift.water),'other far water/ditches are outside both river planes');
});

test('material hook is cached/idempotent, preserves native contracts and adds only stationary shader math',()=>{
 for(const levels of [null,E.rivers.map(r=>waterYAt(...r.path[0]))]){
  const m=new T.MeshStandardMaterial({color:COLORS.water,roughness:.15,metalness:.2,side:T.DoubleSide,vertexColors:!!levels});
  const prior={color:m.color.getHex(),side:m.side,opacity:m.opacity,transparent:m.transparent,roughness:m.roughness,metalness:m.metalness,depthWrite:m.depthWrite,map:m.map,normalMap:m.normalMap};
  riverSurface(m,levels);const fn=m.onBeforeCompile,key=m.customProgramCacheKey();assert.equal(riverSurface(m,levels),m);assert.equal(m.onBeforeCompile,fn);assert.equal(m.customProgramCacheKey(),key);
  assert.deepEqual({color:m.color.getHex(),side:m.side,opacity:m.opacity,transparent:m.transparent,roughness:m.roughness,metalness:m.metalness,depthWrite:m.depthWrite,map:m.map,normalMap:m.normalMap},prior);
  const s={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};m.onBeforeCompile(s,{});
  assert.deepEqual(Object.keys(s.uniforms).sort(),['uRiverHorizon','uRiverZenith']);/* #2186: only the shared sky colours; no clock without the flow option */assert(s.vertexShader.includes('riverRippleWorld'));assert(s.fragmentShader.includes('normal-faceDirection*mat3(viewMatrix)'));assert(s.fragmentShader.includes('fwidth(p.x)'));assert.equal((s.fragmentShader.match(/\*cos\(dot/g)||[]).length,2);assert.equal((s.fragmentShader.match(/\*sin\(dot/g)||[]).length,2);
  const patch=s.fragmentShader.slice(s.fragmentShader.indexOf('if(riverRippleWorld.w'),s.fragmentShader.indexOf('#include <clearcoat_normal_fragment_begin>'));assert(!/\btime\b|texture2D|sampler2D/.test(patch));
  if(levels){assert(s.vertexShader.includes('#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)'));m.vertexColors=false;const winter={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};m.onBeforeCompile(winter,{});assert.equal(winter.vertexShader,T.ShaderLib.standard.vertexShader);assert.equal(winter.fragmentShader,T.ShaderLib.standard.fragmentShader);assert.notEqual(m.customProgramCacheKey(),key);}
 }
});
