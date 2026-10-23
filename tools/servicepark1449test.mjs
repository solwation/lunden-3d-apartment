import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { SITE, WALK } from '../src/config.js';
import { geoToPlan } from '../src/sitegeo.js';
import { pathStrip, isVehicleWay } from '../src/roads.js';
import { subtractConvex } from '../src/polygoncut.js';

const A=SITE.south.access,r5=A.find(r=>r.source==='335403605'),r6=A.find(r=>r.source==='335403606');
const source=JSON.parse(fs.readFileSync(new URL('../docs/references/surrounding-views/osm-south-2026-10-08.json',import.meta.url)));
const plan=f=>f.points.map(p=>geoToPlan(...p).map(v=>+v.toFixed(2)));
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[2]-b[0]*a[2]},0))/2;
const triangles=g=>{const p=g.attributes.position;return Array.from({length:p.count/3},(_,i)=>[0,1,2].map(j=>[p.getX(i*3+j),p.getY(i*3+j),p.getZ(i*3+j)]))};
const outline=(polygon,holes=[])=>{const ring=r=>r.slice(0,-1).map(([x,z])=>new T.Vector2(x,z)),outer=ring(polygon),inner=holes.map(ring),all=[...outer,...inner.flat()];return T.ShapeUtils.triangulateShape(outer,inner).map(t=>t.map(i=>[all[i].x,all[i].y]))};
const overlap=(tri,cutters)=>{let result=[tri];for(const c of cutters)result=result.flatMap(p=>subtractConvex(p,c));return area(tri)-result.reduce((a,p)=>a+area(p),0)};
const has=(path,q)=>path.some(([x,z])=>x===q[0]&&z===q[1]);
const len=p=>p.slice(1).reduce((s,q,i)=>s+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0);
const inside=(poly,[x,z])=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[a,b]=[poly[i],poly[j]];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])c=!c}return c};

test('both ways follow the saved OSM ways with only guessed width/asphalt marked',()=>{
 const s5=source.features.find(f=>f.id==='335403605'),s6=source.features.find(f=>f.id==='335403606');
 assert.deepEqual(s5.tags,{highway:'service'});assert.deepEqual(s6.tags,{highway:'service',surface:'paved'});
 for(const[r,s]of[[r5,s5],[r6,s6]]){assert.equal(r.highway,'service');assert.equal(r.w,4.5);assert.equal(r.widthSource,'guess');assert.equal(r.terrain,'triangles');assert.deepEqual(r.path,plan(s));assert(isVehicleWay(r));assert(r.path.every(([,z])=>z>WALK.z1))}
 assert.equal(r5.surfaceSource,'guess');assert.equal(r6.surfaceSource,'osm:paved');
 assert(Math.abs(len(r5.path)-56.399)<.05,len(r5.path));assert(Math.abs(len(r6.path)-31)<1,len(r6.path));assert.equal(WALK.z1,250);
});

test('joints sit at mapped nodes; footways stay footways',()=>{
 assert.deepEqual(r5.path[0],[170.45,303.9]);assert.deepEqual(r6.path[0],[170.45,303.9]);
 const p36=SITE.south.paths.find(r=>r.source==='36918924'),p11=SITE.south.paths.find(r=>r.source==='1147690112');
 assert.deepEqual(r6.path.at(-1),[167.1,334.61]);assert(has(p36.path,r6.path.at(-1)));assert(has(p11.path,r6.path.at(-1)));
 const park=SITE.south.parking.find(p=>p.source==='1379042188');assert(inside(park.polygon,r5.path.at(-1)),'605 ends inside parking 1379042188');
 const all=Object.values(SITE).flatMap(s=>[...(s?.paths??[]),...(s?.access??[])]);
 assert(!all.some(r=>['335403596','1379042689'].includes(r.source)&&isVehicleWay(r)),'footways are not vehicle ways');
});

test('complete emitted strips clear southern buildings and woodland plus tree margin',()=>{
 const buildings=SITE.south.buildings.map(b=>({b,tris:outline(b.polygon,b.holes??[])})),forests=SITE.south.forests.map(f=>({f,tris:outline(f.polygon)}));
 for(const road of[r5,r6]){const g=pathStrip(road,w=>-w/2,w=>w/2,.025,()=>0),wide=pathStrip({...road,w:road.w+1},w=>-w/2,w=>w/2,.025,()=>0);
 for(const tri of triangles(g))for(const{b,tris}of buildings)assert(overlap(tri,tris)<1e-7,road.source+' overlaps building '+b.name);
 for(const tri of triangles(wide))for(const{f,tris}of forests)assert(overlap(tri,tris)<1e-7,road.source+' tree margin overlaps forest '+f.source);
 g.dispose();wide.dispose()}
});
