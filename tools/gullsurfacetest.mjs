import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Birds} from '../src/birds.js';
import {gullGeometry} from '../src/gullmodel.js';
import {BIRDS,GULL_SURFACE as S} from '../src/config.js';
import {BestiaryObserver} from '../src/bestiaryworld.js';
import {createBestiaryModel} from '../src/bestiarymodels.js';
function flock(lowMemory=false){const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),day={daylight:1,above:0,overcast:0,uniforms:{uWhite:{value:0}}};camera.position.set(BIRDS.center.x,1.62,BIRDS.center.z);return new Birds({scene,camera,day,center:BIRDS.center,lowMemory})}
function xyz(b,i=0){const a=b.seeds.a,j=i*4,t=b.time,p=a[j]+t*a[j+3];return new THREE.Vector3(BIRDS.center.x+Math.cos(p)*a[j+1],a[j+2]+Math.sin(t*S.bobHz+a[j]*S.seedPhase)*S.bobAmplitude,BIRDS.center.z+Math.sin(p)*a[j+1])}
test('both real LOD recipes are finite, volumetric near, within locked budgets and shared with collection',async()=>{
 for(const near of [false,true]){const g=gullGeometry(near);assert.ok(g.attributes.position.count/3<=(near?400:12));for(const a of Object.values(g.attributes))assert.ok(Array.from(a.array).every(Number.isFinite));assert.equal(g,gullGeometry(near));}
 const g=gullGeometry(true);g.computeBoundingBox();assert.ok(g.boundingBox.max.y-g.boundingBox.min.y>.1);
 const m=await createBestiaryModel({kind:'gull'});assert.equal(m.object.geometry,g);assert.ok(m.object.material.vertexColors);m.dispose();assert.ok(g.attributes.position.array.length>0);
});
test('LOD partition is exclusive through repeated boundary crossings for desktop and low-memory seeds',()=>{
 for(const low of [false,true]){const b=flock(low);assert.equal(b.count,low?5:10);b.update(1);const first=new Float32Array(b.seeds.a),target=xyz(b);
 for(const distance of [S.lodNear-.001,S.lodNear,S.lodNear+.001,5,200,5]){b.camera.position.copy(target).add(new THREE.Vector3(0,distance,0));b.update(0);assert.equal(b.lodCounts.far+b.lodCounts.near,b.count);const ids=[];for(const key of ['near','far'])for(let i=0;i<b.lodCounts[key];i++)ids.push(b.lodIDs[key][i]);assert.deepEqual(ids.sort((a,b)=>a-b),Array.from({length:b.count},(_,i)=>i));assert.deepEqual(b.seeds.a,first);const expected=distance<S.lodNear?'near':'far';assert.ok(Array.from(b.lodIDs[expected].subarray(0,b.lodCounts[expected])).includes(0));}
 const original=S.lodNear;try{S.lodNear=1e6;b.update(0);assert.deepEqual(b.lodCounts,{near:b.count,far:0});assert.ok(!b.mesh.visible&&b.nearMesh.visible)}finally{S.lodNear=original}
 }
});
test('night/rain-snow/whiteout/underground/far gates hide both batches and skip animation/classification',()=>{
 for(const gate of ['night','rain-snow','whiteout','underground','far']){const b=flock();b.update(1);b.camera.position.copy(xyz(b));b.update(0);assert.ok(b.nearMesh.visible);if(gate==='night')b.day.daylight=0;if(gate==='whiteout')b.day.uniforms.uWhite.value=1;if(gate==='far')b.camera.position.x+=BIRDS.far*3;b.update(1,gate==='rain-snow'?1:0,gate==='underground');const time=b.time,version=b.nearMesh.geometry.attributes.aSeed.version;b.update(1,gate==='rain-snow'?1:0,gate==='underground');assert.ok(b.meshes.every(m=>!m.visible));assert.equal(b.time,time);assert.equal(b.nearMesh.geometry.attributes.aSeed.version,version);}
 const b=flock();b.day.overcast=1;b.update(1);assert.equal(b.uniforms.uHigh.value,0);b.day.above=1;b.update(0);assert.equal(b.uniforms.uHigh.value,1);
});
test('actual collection observation uses immutable seeds across near-only, mixed and stale packed slots',()=>{
 const b=flock();b.update(1);const observer=new BestiaryObserver({collection:{},camera:b.camera,actors:()=>({birds:b})});
 b.camera.position.copy(xyz(b));b.update(0);assert.equal(observer.candidates().filter(c=>c.id==='bird:gull').length,b.count);
 const original=S.lodNear;try{S.lodNear=1e6;b.update(0);assert.equal(b.mesh.visible,false);assert.equal(observer.candidates().filter(c=>c.id==='bird:gull').length,b.count);}finally{S.lodNear=original}
 b.day.overcast=1;b.update(0);assert.equal(observer.candidates().filter(c=>c.id==='bird:gull').length,b.count-Math.round(b.count*BIRDS.high/BIRDS.count));
 b.update(1,1);assert.equal(observer.candidates().filter(c=>c.id==='bird:gull').length,0);
});

test('debug count is finite and bounded while all supported default counts retain exact seed/attribute bytes',()=>{
 for(const [requested,want]of [[0,0],[5,5],[10,10],[-4,0],[100000,10],[NaN,10],[Infinity,10]]){
  const source=flock(),b=new Birds({scene:new THREE.Scene(),camera:source.camera,day:source.day,center:BIRDS.center,count:requested});assert.equal(b.count,want);b.update(1);assert.equal(b.lodCounts.near+b.lodCounts.far,want);
  if(want===10){assert.deepEqual(b.seeds.a,source.seeds.a);assert.deepEqual(b.seeds.b,source.seeds.b);}
 }
});
