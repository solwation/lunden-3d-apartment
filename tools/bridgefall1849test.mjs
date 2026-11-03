// node --experimental-default-type=module --test tools/bridgefall1849test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Player} from '../src/player.js';
import {groundY} from '../src/surroundings.js';
import {parkRampEnds,parkFillAt} from '../src/riverpark.js';
import {bridgeRecords} from '../src/riverbridge.js';
import {PLAYER} from '../src/config.js';
const world={size:{x:10,z:10},levels:[{segments:[],footprints:[]},{segments:[],footprints:[]}],doors:[]};
const make=()=>new Player(world,new THREE.PerspectiveCamera());
const safe=p=>{assert(Number.isFinite(p.groundAt(p.pos.x,p.pos.z,p.pos.y)));assert(p.pos.y>=groundY(p.pos.x,p.pos.z)-.05);};
const move=(p,points,dt,run)=>{p.keys.add('KeyW');if(run)p.keys.add('ShiftLeft');for(const[x,z]of points){let n=0;while(Math.hypot(p.pos.x-x,p.pos.z-z)>.13){p.camera.rotation.y=Math.atan2(-(x-p.pos.x),-(z-p.pos.z));p.update(dt);safe(p);assert(++n<3000,JSON.stringify({goal:[x,z],pos:p.pos.toArray()}));}}p.keys.clear();};
test('north abutment flank cannot lose support at 20/30fps; reverse remains free',()=>{const before=make();before.blockedByBridgeFill=()=>false;before.spawn(-137,195.4,1.5*Math.PI);before.keys.add('KeyW');before.keys.add('ShiftLeft');for(let i=0;i<30;i++)before.update(.05);assert.equal(before.groundAt(before.pos.x,before.pos.z,before.pos.y),-Infinity);assert(before.pos.y<-15);for(const dt of [.05,1/30]){const p=make();p.spawn(-137,195.4,1.5*Math.PI);p.keys.add('KeyW');p.keys.add('ShiftLeft');for(let i=0;i<60;i++){p.update(dt);safe(p);}if(dt===.05)assert(p.pos.x<-136.8);const at=p.pos.x;p.camera.rotation.y=Math.PI/2;for(let i=0;i<10;i++){p.update(dt);safe(p);}assert(p.pos.x<at-1);}});
test('both earth ramps and full timber deck remain walkable in both directions at walk/sprint and 20/60fps',()=>{const E=parkRampEnds(),at=(e,s)=>[e.x+e.dx*s,e.z+e.dz*s],points=[at(E[0],10),at(E[0],0),at(E[1],0),at(E[1],10)];for(const run of[false,true])for(const dt of[.05,1/60]){const p=make();p.spawn(...points[0],0);move(p,points.slice(1),dt,run);move(p,points.slice(0,-1).reverse(),dt,run);}});
test('solid fill checks match analytic fill; road/GC sibling decks and outdoor sprint contract unchanged',()=>{const p=make();for(const e of parkRampEnds())for(const s of[-1,0,5,13])for(const o of[-3,0,3]){const x=e.x+e.dx*s-e.dz*o,z=e.z+e.dz*s+e.dx*o,h=parkFillAt(x,z);assert.equal(p.blockedByBridgeFill(x,z,h-PLAYER.stepUp-.01),true);assert.equal(p.blockedByBridgeFill(x,z,h),false);}for(const r of bridgeRecords){assert.equal(p.blockedByBridgeFill(r.x,r.z,-20),false);assert.equal(p.groundAt(r.x,r.z,r.y??-3),groundY(r.x,r.z));const ends=[-1,1].map(k=>[r.x+k*r.dx*r.len*.4,r.z+k*r.dz*r.len*.4]);p.spawn(...ends[0],0);move(p,[ends[1],ends[0]],.05,true);}assert.equal(PLAYER.walk,1.6);assert.equal(PLAYER.run,3.2);assert.equal(PLAYER.runOutdoor,4.8);});
