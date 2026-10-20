// #1420: detailed terrain projection conserves the quad and follows each actual subtriangle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cutAtTerrain} from '../src/roads.js';
const area=p=>Math.abs(p.reduce((s,q,i)=>{const r=p[(i+1)%p.length];return s+q[0]*r[1]-r[0]*q[1]},0))/2;
test('detailed projection conserves the original track quad footprint',()=>{
 const q=[[.2,.1],[.3,.1],[1.7,1.9],[1.6,1.9]],grid={X:[0,2],Z:[0,2],refined:()=>4},parts=cutAtTerrain(q,grid);
 assert(Math.abs(parts.reduce((s,p)=>s+area(p),0)-area(q))<1e-10);
 assert(parts.length>2);
});
test('each projected triangle stays linear on an emitted detailed terrain triangle',()=>{
 const grid={X:[0,2],Z:[0,2],refined:()=>2},parts=cutAtTerrain([[0,0],[2,0],[2,2],[0,2]],grid);
 const h=(x,z)=>{const i=Math.min(1,Math.floor(x)),j=Math.min(1,Math.floor(z)),u=x-i,v=z-j,y=(a,b)=>(i+a)**2+(j+b)**2;return u+v<=1?y(0,0)+(y(1,0)-y(0,0))*u+(y(0,1)-y(0,0))*v:y(1,1)+(y(0,1)-y(1,1))*(1-u)+(y(1,0)-y(1,1))*(1-v)};
 for(const p of parts){const x=p.reduce((s,q)=>s+q[0],0)/3,z=p.reduce((s,q)=>s+q[1],0)/3;assert(Math.abs(h(x,z)-p.reduce((s,q)=>s+h(...q),0)/3)<1e-9)}
 assert.equal(parts.length,8);
});
test('legacy consumers keep their original grid partition when refinement is absent',()=>{
 const q=[[.2,.1],[.3,.1],[1.7,1.9],[1.6,1.9]],grid={X:[0,1,2],Z:[0,1,2]};
 assert.deepEqual(cutAtTerrain(q,grid),cutAtTerrain(q,{...grid,refined:()=>1}));
});
