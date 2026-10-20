import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { SITE, WALK } from '../src/config.js';
import { geoToPlan } from '../src/sitegeo.js';
import { pathStrip, isVehicleWay } from '../src/roads.js';
import { subtractConvex } from '../src/polygoncut.js';

const ids=['145221576','199056948'];
const roads=SITE.south.access.filter(r=>ids.includes(r.source));
const source=JSON.parse(fs.readFileSync(new URL('../docs/references/surrounding-views/osm-south-2026-10-08.json',import.meta.url)));
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[2]-b[0]*a[2]},0))/2;
const triangles=g=>{const p=g.attributes.position;return Array.from({length:p.count/3},(_,i)=>[0,1,2].map(j=>[p.getX(i*3+j),p.getY(i*3+j),p.getZ(i*3+j)]))};
const outlineTriangles=(polygon,holes=[])=>{const ring=r=>r.slice(0,-1).map(([x,z])=>new T.Vector2(x,z));const outer=ring(polygon),inner=holes.map(ring),all=[...outer,...inner.flat()];return T.ShapeUtils.triangulateShape(outer,inner).map(t=>t.map(i=>[all[i].x,all[i].y]));};
const overlap=(tri,cutters)=>{let result=[tri];for(const c of cutters)result=result.flatMap(p=>subtractConvex(p,c));return area(tri)-result.reduce((a,p)=>a+area(p),0)};

test('two sourced service ways preserve exact shared nodes, explicit width guesses and vehicle semantics',()=>{
 assert.deepEqual(roads.map(r=>r.source),ids);
 for(const road of roads){const raw=source.features.find(f=>f.id===road.source);assert.equal(raw.tags.highway,'service');assert.equal(raw.tags.width,undefined);assert.equal(raw.tags.surface,undefined);assert.equal(road.highway,'service');assert.equal(road.w,road.source==='199056948'?3:4.5);assert.equal(road.widthSource,'guess');assert.equal(road.surfaceSource,'guess');assert.equal(road.terrain,'triangles');assert.deepEqual(road.path,raw.points.map(p=>geoToPlan(...p).map(v=>+v.toFixed(2))));assert(isVehicleWay(road));assert(road.path.every(p=>p[1]>WALK.z1))}
 const main=roads[0],link=roads[1];assert.deepEqual(main.path.at(-1),SITE.south.paths.find(r=>r.source==='36918924').path.find(p=>p[0]===76.61));
 assert.deepEqual(link.path[0],SITE.south.access.find(r=>r.source==='145221573').path.find(p=>p[0]===-10.07));assert.deepEqual(link.path.at(-1),main.path[2]);
 for(const key of ['west','north','east','south'])for(const road of [...SITE[key].paths,...SITE[key].access].filter(r=>r.path&&!ids.includes(r.source)))assert.equal(!!isVehicleWay(road),road.surface==='asphalt'&&road.w>=3.9,road.source);
 const foot=source.features.find(f=>f.id==='199056947');assert.equal(foot.tags.highway,'footway');assert(!isVehicleWay({path:foot.points,surface:'asphalt',w:3,highway:foot.tags.highway}));assert.equal(WALK.z1,250);
});

test('complete emitted service footprints clear building bodies and preserve courtyard holes',()=>{
 const buildings=SITE.south.buildings.map(b=>({b,tris:outlineTriangles(b.polygon,b.holes??[])}));
 for(const road of roads){const g=pathStrip(road,w=>-w/2,w=>w/2,.025,()=>0);for(const tri of triangles(g))for(const{b,tris}of buildings)assert(overlap(tri,tris)<1e-7,road.source+' overlaps '+b.name);g.dispose()}
});

test('new access exclusion including its half metre tree margin cannot reseed either southern forest',()=>{
 const forests=SITE.south.forests.map(f=>({f,tris:outlineTriangles(f.polygon)}));
 for(const road of roads){const wide={...road,w:road.w+1,_samples:undefined},g=pathStrip(wide,w=>-w/2,w=>w/2,.025,()=>0);for(const tri of triangles(g))for(const{f,tris}of forests)assert(overlap(tri,tris)<1e-7,road.source+' overlaps forest '+f.source);g.dispose()}
});
