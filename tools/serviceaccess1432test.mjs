import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { SITE, WALK } from '../src/config.js';
import { geoToPlan } from '../src/sitegeo.js';
import { pathStrip } from '../src/roads.js';
import { subtractConvex } from '../src/polygoncut.js';

const ids=['145221573','145221582','145221583','145221596'];
const roads=SITE.south.access.filter(r=>ids.includes(r.source));
const source=JSON.parse(fs.readFileSync(new URL('../docs/references/surrounding-views/osm-south-2026-10-08.json',import.meta.url)));
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[2]-b[0]*a[2]},0))/2;
const triangles=g=>{const p=g.attributes.position;return Array.from({length:p.count/3},(_,i)=>[0,1,2].map(j=>[p.getX(i*3+j),p.getY(i*3+j),p.getZ(i*3+j)]))};
const outlineTriangles=(polygon,holes=[])=>{const ring=r=>r.slice(0,-1).map(([x,z])=>new T.Vector2(x,z));const outer=ring(polygon),inner=holes.map(ring),all=[...outer,...inner.flat()];return T.ShapeUtils.triangulateShape(outer,inner).map(t=>t.map(i=>[all[i].x,all[i].y]));};
const overlap=(tri,cutters)=>{let result=[tri];for(const c of cutters)result=result.flatMap(p=>subtractConvex(p,c));return area(tri)-result.reduce((a,p)=>a+area(p),0)};

test('only the four sourced service links use guessed width/material and exact projected shared nodes',()=>{
 assert.deepEqual(roads.map(r=>r.source),ids);
 for(const road of roads){const raw=source.features.find(f=>f.id===road.source);assert.equal(raw.tags.highway,'service');assert.equal(raw.tags.width,undefined);assert.equal(raw.tags.surface,undefined);assert.equal(road.w,4.5);assert.equal(road.widthSource,'guess');assert.equal(road.surfaceSource,'guess');assert.equal(road.terrain,'triangles');assert.deepEqual(road.path,raw.points.map(p=>geoToPlan(...p).map(v=>+v.toFixed(2))))}
 const main=roads[0];assert.deepEqual(main.path.at(-1),SITE.south.paths.find(r=>r.source==='30633546').path.find(p=>p[0]===3.68));
 assert.deepEqual(main.path[2],SITE.south.access.find(r=>r.source==='145221590').path[0]);
 for(const r of roads.slice(1))assert(main.path.some(p=>p[0]===r.path[0][0]&&p[1]===r.path[0][1]));
 assert.equal(WALK.z1,250);assert(roads[0].path.some(p=>p[1]<250)&&roads[0].path.some(p=>p[1]>250));
});

test('opted-in strips preserve their area and follow actual refined triangle folds through their interiors',()=>{
 const grid={X:[0,4,8,12],Z:[0,4,8,12],refined:()=>2};
 const height=(x,z)=>{const i=Math.min(5,Math.max(0,Math.floor(x/2))),j=Math.min(5,Math.max(0,Math.floor(z/2))),u=x/2-i,v=z/2-j,h=(a,b)=>Math.sin(i+a)*.4+Math.cos(j+b)*.7;return u+v<=1?h(0,0)+(h(1,0)-h(0,0))*u+(h(0,1)-h(0,0))*v:h(1,1)+(h(0,1)-h(1,1))*(1-u)+(h(1,0)-h(1,1))*(1-v)};
 const road={path:[[2,2],[10,10]],w:2,terrain:'triangles'},g=pathStrip(road,w=>-w/2,w=>w/2,.025,height,false,grid),tris=triangles(g);
 assert(Math.abs(tris.reduce((s,t)=>s+area(t),0)-Math.hypot(8,8)*2)<1e-5);
 for(const tri of tris){const c=tri[0].map((_,i)=>tri.reduce((s,p)=>s+p[i],0)/3);assert(Math.abs(c[1]-height(c[0],c[2])-.025)<2e-6)}
 assert(g.attributes.normal.array.every(Number.isFinite));g.dispose();
});

test('complete emitted service footprints clear building bodies and preserve courtyard holes',()=>{
 const buildings=SITE.south.buildings.map(b=>({b,tris:outlineTriangles(b.polygon,b.holes??[])}));
 for(const road of roads){const g=pathStrip(road,w=>-w/2,w=>w/2,.025,()=>0);for(const tri of triangles(g))for(const{b,tris}of buildings)assert(overlap(tri,tris)<1e-7,road.source+' overlaps '+b.name);g.dispose()}
});

test('new access exclusion including its half metre tree margin cannot reseed either southern forest',()=>{
 const forests=SITE.south.forests.map(f=>({f,tris:outlineTriangles(f.polygon)}));
 for(const road of roads){const wide={...road,w:road.w+1,_samples:undefined},g=pathStrip(wide,w=>-w/2,w=>w/2,.025,()=>0);for(const tri of triangles(g))for(const{f,tris}of forests)assert(overlap(tri,tris)<1e-7,road.source+' overlaps forest '+f.source);g.dispose()}
});
