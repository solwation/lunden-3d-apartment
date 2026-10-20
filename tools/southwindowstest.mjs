import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {SITE} from '../src/config.js';
import {lowRiseWindowParts} from '../src/southwindows.js';
const S=SITE.south, source=JSON.parse(fs.readFileSync(new URL('../docs/references/surrounding-views/osm-south-2026-10-08.json',import.meta.url)));
const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes};
test('only all39 reviewed addressed main bodies opt in; seven uncertain and eight detailed bodies unchanged',()=>{
 assert.equal(new Set(S.lowRiseWindows.sources).size,39);let blank=0,detailed=0;
 for(const b of S.buildings){const f=source.features.find(f=>f.id===b.source),panes=lowRiseWindowParts(b,2);
  if(S.lowRiseWindows.sources.includes(b.source)){assert(f.tags['addr:street']&&f.tags['addr:housenumber']);assert(b.levels<4&&!b.template);assert(panes.length>0,b.name)}
  else {assert.equal(panes.length,0);if(b.levels>=4||b.template)detailed++;else blank++}
  panes.forEach(g=>g.dispose());
 }assert.equal(blank,7);assert.equal(detailed,8);
});
test('every emitted pane is finite, above its floor, outward of its own facade and clear of the footprint interior',()=>{
 let total=0;
 for(const b of S.buildings){for(const g of lowRiseWindowParts(b,2)){
  const p=g.attributes.position,n=g.attributes.normal,center=new THREE.Vector3();for(let i=0;i<p.count;i++){center.add(new THREE.Vector3().fromBufferAttribute(p,i));assert([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite));assert(p.getY(i)>2&&p.getY(i)<2+b.levels*S.storey)}center.divideScalar(p.count);
  const normal=new THREE.Vector3().fromBufferAttribute(n,0);assert(Math.abs(normal.y)<1e-7);assert(!inside(center.x,center.z,b.polygon),b.name);const back=center.clone().addScaledVector(normal,-.05);assert(inside(back.x,back.z,b.polygon),b.name);
  const ray=new THREE.Raycaster(center.clone().add(normal),normal.clone().negate(),0,2);assert(Math.abs(ray.intersectObject(new THREE.Mesh(g,new THREE.MeshBasicMaterial()))[0].distance-1)<1e-5);
  g.dispose();total++;
 }}assert(total>300&&total<600);console.log('actual low-rise panes',total,'triangles',total*2);
});
test('opposite polygon winding still emits glass towards open exterior, never into gables or short returns',()=>{
 const b=S.buildings.find(b=>b.source==='88457584');for(const polygon of [b.polygon,[...b.polygon].reverse()]){const panes=lowRiseWindowParts({...b,polygon},0);assert(panes.length>0);const long=new THREE.Vector2(b.polygon[2][0]-b.polygon[1][0],b.polygon[2][1]-b.polygon[1][1]).normalize();for(const g of panes){const n=g.attributes.normal;assert(Math.abs(n.getX(0)*long.x+n.getZ(0)*long.y)<.01);g.dispose()}}
});
