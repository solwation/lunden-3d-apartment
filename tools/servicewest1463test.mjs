import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { SITE, WALK } from '../src/config.js';
import { geoToPlan } from '../src/sitegeo.js';
import { pathStrip, isVehicleWay } from '../src/roads.js';
import { subtractConvex } from '../src/polygoncut.js';

const road=SITE.south.access.find(r=>r.source==='145221612');
const source=JSON.parse(fs.readFileSync(new URL('../docs/references/surrounding-views/osm-south-2026-10-08.json',import.meta.url)));
const plan=f=>f.points.map(p=>geoToPlan(...p).map(v=>+v.toFixed(2)));
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[2]-b[0]*a[2]},0))/2;
const triangles=g=>{const p=g.attributes.position;return Array.from({length:p.count/3},(_,i)=>[0,1,2].map(j=>[p.getX(i*3+j),p.getY(i*3+j),p.getZ(i*3+j)]))};
const outline=(polygon,holes=[])=>{const ring=r=>r.slice(0,-1).map(([x,z])=>new T.Vector2(x,z)),outer=ring(polygon),inner=holes.map(ring),all=[...outer,...inner.flat()];return T.ShapeUtils.triangulateShape(outer,inner).map(t=>t.map(i=>[all[i].x,all[i].y]))};
const overlap=(tri,cutters)=>{let result=[tri];for(const c of cutters)result=result.flatMap(p=>subtractConvex(p,c));return area(tri)-result.reduce((a,p)=>a+area(p),0)};
const has=(path,q)=>path.some(([x,z])=>x===q[0]&&z===q[1]);

test('western service way follows the whole saved OSM way with guessed dimensions',()=>{
 const raw=source.features.find(f=>f.id==='145221612');
 assert.equal(raw.tags.highway,'service');assert.equal(raw.tags.width,undefined);assert.equal(raw.tags.surface,undefined);
 assert.equal(road.highway,'service');assert.equal(road.w,4.5);assert.equal(road.widthSource,'guess');assert.equal(road.surfaceSource,'guess');assert.equal(road.terrain,'triangles');
 assert.deepEqual(road.path,plan(raw));assert(isVehicleWay(road));
 const length=road.path.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-road.path[i][0],p[1]-road.path[i][1]),0);assert(Math.abs(length-113.3156)<.01,length);
 assert(road.path.every(([,z])=>z>WALK.z1));assert.equal(WALK.z1,250);
});

test('it joins the three existing roads at mapped nodes and keeps the future outer end bare',()=>{
 const main=SITE.south.paths.find(r=>r.source==='30633546'),a=SITE.south.access.find(r=>r.source==='145221573'),b=SITE.south.access.find(r=>r.source==='145221576');
 assert.deepEqual(road.path.at(-1),[-134.7,334.97]);assert(has(main.path,road.path.at(-1)));
 assert.deepEqual(a.path[0],[-127.61,345.26]);assert(has(road.path,a.path[0]));
 assert.deepEqual(b.path[0],[-97.6,388.93]);assert(has(road.path,b.path[0]));
 assert.deepEqual(road.path[0],[-68.6,417.65]);assert(has(plan(source.features.find(f=>f.id==='95036048')),road.path[0]));
 const all=Object.values(SITE).flatMap(s=>[...(s?.paths??[]),...(s?.access??[])]).filter(r=>r.path&&r!==road);
 assert(!all.some(r=>has(r.path,road.path[0])),'no invented link at the outer end');
});

test('complete emitted strip clears southern buildings and woodland plus tree margin',()=>{
 const buildings=SITE.south.buildings.map(b=>({b,tris:outline(b.polygon,b.holes??[])})),forests=SITE.south.forests.map(f=>({f,tris:outline(f.polygon)}));
 const g=pathStrip(road,w=>-w/2,w=>w/2,.025,()=>0),wide=pathStrip({...road,w:road.w+1},w=>-w/2,w=>w/2,.025,()=>0);
 for(const tri of triangles(g))for(const{b,tris}of buildings)assert(overlap(tri,tris)<1e-7,'overlaps building '+b.name);
 for(const tri of triangles(wide))for(const{f,tris}of forests)assert(overlap(tri,tris)<1e-7,'plus tree margin overlaps forest '+f.source);
 g.dispose();wide.dispose();
});
