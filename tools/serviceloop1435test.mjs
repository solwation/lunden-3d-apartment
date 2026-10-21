import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { SITE, WALK } from '../src/config.js';
import { geoToPlan } from '../src/sitegeo.js';
import { pathStrip } from '../src/roads.js';
import { subtractConvex } from '../src/polygoncut.js';

const ids=['145221614','145221585','145221592','145221599'];
const roads=SITE.south.access.filter(r=>ids.includes(r.source));
const source=JSON.parse(fs.readFileSync(new URL('../docs/references/surrounding-views/osm-south-2026-10-08.json',import.meta.url)));
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[2]-b[0]*a[2]},0))/2;
const triangles=g=>{const p=g.attributes.position;return Array.from({length:p.count/3},(_,i)=>[0,1,2].map(j=>[p.getX(i*3+j),p.getY(i*3+j),p.getZ(i*3+j)]))};
const outline=(polygon,holes=[])=>{const ring=r=>r.slice(0,-1).map(([x,z])=>new T.Vector2(x,z)),outer=ring(polygon),inner=holes.map(ring),all=[...outer,...inner.flat()];return T.ShapeUtils.triangulateShape(outer,inner).map(t=>t.map(i=>[all[i].x,all[i].y]))};
const overlap=(tri,cutters)=>{let result=[tri];for(const c of cutters)result=result.flatMap(p=>subtractConvex(p,c));return area(tri)-result.reduce((a,p)=>a+area(p),0)};

test('inner service loop follows the saved OSM ways and declares guessed dimensions',()=>{
 assert.deepEqual(roads.map(r=>r.source),ids);
 for(const road of roads){
  const raw=source.features.find(f=>f.id===road.source);
  assert.equal(raw.tags.highway,'service');assert.equal(raw.tags.width,undefined);assert.equal(raw.tags.surface,undefined);
  assert.equal(road.w,4.5);assert.equal(road.widthSource,'guess');assert.equal(road.surfaceSource,'guess');assert.equal(road.terrain,'triangles');
  assert.deepEqual(road.path,raw.points.map(p=>geoToPlan(...p).map(v=>+v.toFixed(2))));
  assert(road.path.every(([x,z])=>z>WALK.z1),`${road.source} does not extend WALK`);
 }
 const main=roads[0],branchIds=roads.slice(1);
 for(const branch of branchIds)assert(main.path.some(([x,z])=>x===branch.path.at(-1)[0]&&z===branch.path.at(-1)[1])||main.path.some(([x,z])=>x===branch.path[0][0]&&z===branch.path[0][1]),branch.source+' shares a mapped node with the loop');
 const existing=SITE.south.access.find(r=>r.source==='145221588');
 assert.deepEqual(main.path[3],existing.path[0]);
 const outer=source.features.find(f=>f.id==='95036048').points.map(p=>geoToPlan(...p).map(v=>+v.toFixed(2)));
 assert(outer.some(([x,z])=>x===main.path[0][0]&&z===main.path[0][1]));assert(outer.some(([x,z])=>x===main.path.at(-1)[0]&&z===main.path.at(-1)[1]));
 assert.equal(WALK.z1,250);
});

test('complete emitted road strips clear southern buildings and woodland',()=>{
 const buildings=SITE.south.buildings.map(b=>({b,tris:outline(b.polygon,b.holes??[])})),forests=SITE.south.forests.map(f=>({f,tris:outline(f.polygon)}));
 for(const road of roads){const g=pathStrip(road,w=>-w/2,w=>w/2,.025,()=>0),expanded=pathStrip({...road,w:road.w+1},w=>-w/2,w=>w/2,.025,()=>0);
  for(const tri of triangles(g)){for(const{b,tris}of buildings)assert(overlap(tri,tris)<1e-7,road.source+' overlaps building '+b.name);}
  for(const tri of triangles(expanded))for(const{f,tris}of forests)assert(overlap(tri,tris)<1e-7,road.source+' plus tree margin overlaps forest '+f.source);
  g.dispose();expanded.dispose();
 }
});
