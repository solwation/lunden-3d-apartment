import test from 'node:test';
import assert from 'node:assert/strict';
import {cutSegmentOpenings} from '../src/segmentopenings.js';
import {groundWaysIn} from '../src/surroundings.js';
import {SITE} from '../src/config.js';
const opening=(x0,z0,x1,z1)=>({x0,z0,x1,z1});
const length=s=>Math.hypot(s[2]-s[0],s[3]-s[1]);
test('exact bounds and source direction on horizontal and vertical walls',()=>{
 assert.deepEqual(cutSegmentOpenings([0,3,10,3],[opening(2,3,2.85,3)]),[[0,3,2,3],[2.85,3,10,3]]);
 assert.deepEqual(cutSegmentOpenings([4,10,4,0],[opening(4,2,4,2.85)]),[[4,10,4,2.85],[4,2,4,0]]);
});
test('overlapping/reversed cuts form one union, with boundary clipping and no extra widening',()=>{
 const out=cutSegmentOpenings([0,0,10,0],[opening(4,0,2,0),opening(3,0,6,0),opening(-1,0,.5,0),opening(9,0,11,0)]);
 assert.deepEqual(out,[[.5,0,2,0],[6,0,9,0]]);assert.equal(out.reduce((n,s)=>n+length(s),0),4.5);
});
test('noncollinear and nonoverlapping segments, including perpendicular walls, retain exact identity',()=>{
 for(const sg of [[0,0,10,0],[0,0,0,10],[0,0,0,0]])assert.equal(cutSegmentOpenings(sg,[opening(2,1,2.85,1),opening(12,0,13,0)])[0],sg);
});
test('all12 existing ABC loggia ways cut only their own exact0.85m interval in both orientations',()=>{
 const ways=groundWaysIn().filter(w=>w.kind==='loggia');assert.equal(ways.length,12);assert.equal(ways.filter(w=>w.x0===w.x1).length,1);
 for(const b of SITE.blocks.filter(b=>!b.style&&b.corners)){
  const own=ways.filter(w=>w.name===b.name);assert.equal(own.length,4);
  const walls=[[b.x0,b.z0,b.x1,b.z0],[b.x1,b.z0,b.x1,b.z1],[b.x1,b.z1,b.x0,b.z1],[b.x0,b.z1,b.x0,b.z0]];
  const old=walls.reduce((s,w)=>s+length(w),0),out=walls.flatMap(w=>cutSegmentOpenings(w,own));assert(Math.abs(old-out.reduce((s,w)=>s+length(w),0)-3.4)<1e-12,b.name);
  for(const w of own){assert(Math.abs(Math.hypot(w.x1-w.x0,w.z1-w.z0)-.85)<1e-12);const mid=[(w.x0+w.x1)/2,(w.z0+w.z1)/2];assert(!out.some(s=>{const cross=(mid[0]-s[0])*(s[3]-s[1])-(mid[1]-s[1])*(s[2]-s[0]);return Math.abs(cross)<1e-8&&mid[0]>=Math.min(s[0],s[2])&&mid[0]<=Math.max(s[0],s[2])&&mid[1]>=Math.min(s[1],s[3])&&mid[1]<=Math.max(s[1],s[3])}));}
 }
});
