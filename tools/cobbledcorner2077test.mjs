import test from 'node:test';
import assert from 'node:assert/strict';
import {SITE} from '../src/config.js';
import {samples,nearestS,onRoad,pathStrip,vehicleTrim} from '../src/roads.js';
import {cobbledCornerGeometry} from '../src/street.js';
const cb=SITE.street.cobbles,road=SITE.roads.find(r=>r.name===cb.road),height=(x,z)=>0;
const edges=samples(road).filter(p=>p.s>=nearestS(road,...cb.from)&&p.s<=nearestS(road,...cb.to));
const near=(a,b,t=3e-6)=>assert.ok(Math.abs(a-b)<t,`${a} ≈ ${b}`);
test('inset exactly reuses both sampled pavement edges, with positive winding and no road spill',()=>{
 const g=cobbledCornerGeometry(height),p=g.attributes.position,n=g.attributes.normal;
 assert.ok(p.count>6&&p.count<200,'bounded short sector, not the whole road');
 for(const e of edges)for(const off of[e.w/2,e.w/2+2.5])assert.ok(Array.from({length:p.count},(_,i)=>Math.hypot(p.getX(i)-e.x-e.nx*off,p.getZ(i)-e.z-e.nz*off)).some(d=>d<3e-6),'same curb/verge endpoints');
 for(let i=0;i<p.count;i++){near(p.getY(i),cb.lift);assert.ok(n.getY(i)>.999);near(g.attributes.uv.getX(i),p.getX(i));near(g.attributes.uv.getY(i),p.getZ(i));}
 for(let i=0;i<p.count;i+=3)assert.equal(onRoad((p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,-.02),false);
 g.dispose();
});
test('every inset triangle lies exactly above an actual existing pavement triangle',()=>{
 const pavement=pathStrip(road,w=>w/2,w=>w/2+2.5,.008,height,false,undefined,vehicleTrim()),g=cobbledCornerGeometry(height),p=g.attributes.position,q=pavement.attributes.position;
 for(let i=0;i<p.count;i+=3){const points=Array.from({length:3},(_,k)=>[p.getX(i+k),p.getZ(i+k)]);let found=false;for(let j=0;j<q.count;j+=3)if(points.every(([x,z])=>Array.from({length:3},(_,k)=>Math.hypot(x-q.getX(j+k),z-q.getZ(j+k))).some(d=>d<3e-6)))found=true;assert.ok(found,'triangle plan is from the unchanged paved strip');}
 near(cb.lift-.008,.004);g.dispose();pavement.dispose();
});
test('ground-following placement and metric UVs remain deterministic on a slope',()=>{
 const slope=(x,z)=>.03*x+.02*z,g=cobbledCornerGeometry(slope),h=cobbledCornerGeometry(slope),p=g.attributes.position;
 assert.deepEqual(p.array,h.attributes.position.array);for(let i=0;i<p.count;i++){near(p.getY(i),slope(p.getX(i),p.getZ(i))+cb.lift);assert.ok(g.attributes.normal.getY(i)>.99);near(g.attributes.uv.getX(i),p.getX(i));near(g.attributes.uv.getY(i),p.getZ(i));}
 assert.equal(cb.tile,.8);g.dispose();h.dispose();
});
