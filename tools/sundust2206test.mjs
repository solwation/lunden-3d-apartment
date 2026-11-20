import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { inSunPrism, lowSunDust, roomDust, dustCount, SunDust } from '../src/sundust.js';
import { SUN_DUST as C } from '../src/config.js';
const src = { level:0, facade:'south', x:0, y:1.5, z:0, nx:0, nz:-1, hw:1, hh:0.7, y0:-0.1, y1:2.8, ox:0, oz:-0.3, pass:1 };
const sun = new THREE.Vector3(0,0.2,1).normalize();
const point = d => ({x:0,y:src.y-sun.y*d,z:-sun.z*d});

test('low sun and dust amounts: no night/high-noon/moonlight; bounded monotone by actual room dust and quality', () => {
  assert.equal(lowSunDust(-0.1,2),0); assert.equal(lowSunDust(0.8,2),0); assert.equal(lowSunDust(0.2,0),0); assert.ok(lowSunDust(0.2,2)>0.9);
  const spots=[{kind:'dust',amt:0.5,room:'living',level:0},{kind:'crumb',amt:1,room:'living',level:0},{kind:'dust',amt:1,room:'living',level:1},{kind:'dust',amt:1,room:'hall',level:0}];
  assert.equal(roomDust(spots,0,'living'),0.5); assert.equal(roomDust(spots,0,null),0,'unmapped/visited-flat window borrows no home dust'); assert.equal(dustCount(0),0);
  assert.ok(dustCount(1)<dustCount(3)); assert.ok(dustCount(3,0.4)<dustCount(3,1)); assert.equal(dustCount(1000),C.max-C.beams);
});
test('rectangle prism follows -sun, excludes outside window, opposite sun, floor/storey and long range', () => {
  assert.ok(inSunPrism(point(2),src,sun));
  assert.equal(inSunPrism({...point(2),x:1.2},src,sun),false);
  assert.equal(inSunPrism({...point(2),y:2.6},src,sun),false);
  assert.equal(inSunPrism(point(2),src,new THREE.Vector3(0,0.2,-1).normalize()),false);
  assert.equal(inSunPrism({...point(2),y:-0.4},src,sun),false);
  assert.equal(inSunPrism(point(5),src,sun),false);
  assert.equal(inSunPrism(point(0.1),src,sun),false,'inside reveal');
});
test('walls/closed door stop rays; own facade at its inner face does not; drawn blinds and curtains mask direct sun', () => {
  const p=point(2),facade=[[-4,-0.25,4,-0.25]],wall=[[-4,-1,4,-1]];
  assert.ok(inSunPrism(p,src,sun,facade));
  assert.equal(inSunPrism(p,src,sun,[...facade,...wall]),false);
  assert.equal(inSunPrism(p,src,sun,facade,[{level:0,out:1,x0:-1,x1:1,cover:1}]),false);
  assert.ok(inSunPrism(p,src,sun,facade,[{level:0,out:1,x0:-1,x1:1,cover:0}]));
  assert.equal(inSunPrism(p,src,sun,facade,[],[{level:0,spec:{facade:'south',glass:[-1,1]},cover:1}]),false);
});
test('actual batch stays bounded, every mote in prism, hidden when clean/cloudy/lowest/phone/outdoors', () => {
  const scene=new THREE.Scene(), region={box:{x0:-4,x1:4,z0:-5,z1:-0.31},segs:()=>[[-4,-0.25,4,-0.25]]};
  const windows={region,shown:[src]},dust=new SunDust({scene,windows,roomAt:()=> 'living'});
  const spots=Array.from({length:10},()=>({kind:'dust',amt:1,level:0,room:'living'}));
  const env={sun,intensity:2,eye:{y:1.6},spots}; dust.update(0.2,env);
  assert.ok(dust.mesh.isInstancedMesh && dust.mesh.visible && dust.mesh.count>0 && dust.mesh.count<=200);
  const mat=new THREE.Matrix4();
  for(let i=0;i<dust.mesh.count;i++){dust.mesh.getMatrixAt(i,mat);const e=mat.elements;assert.ok(inSunPrism({x:e[12],y:e[13],z:e[14]},src,sun,region.segs()));}
  assert.equal(dust.mesh.geometry.index.count,6); assert.ok(dust.mesh.material.depthTest && !dust.mesh.material.depthWrite && !dust.mesh.castShadow);
  dust.update(1,{...env,spots:[]});assert.equal(dust.mesh.visible,false);
  dust.update(1,{...env,intensity:0});assert.equal(dust.mesh.visible,false);
  dust.setLevel(0,0);dust.update(1,env);assert.equal(dust.mesh.visible,false);
  dust.setLevel(3,1);dust.update(1,{...env,inside:false});assert.equal(dust.mesh.visible,false);
  assert.equal(new SunDust({scene,windows,lowMemory:true}).mesh,null);
});
