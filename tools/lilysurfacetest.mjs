// #2073: shallow finite surfaces and production instance/state contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { LILY_SURFACE as L, RIVER_FLORA as F } from '../src/config.js';
import { lilyPadGeometry, lilyPetalGeometry, lilyGeometry, flowerGeometry, RiverFlora } from '../src/riverfloraview.js';
import { waterYAt } from '../src/riverbridge.js';

const valid = g => {
  for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));
  const p=g.attributes.position,n=g.attributes.normal,ix=g.index;
  for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5,'unit finite normals');
  for(let i=0;i<(ix?.count??p.count);i+=3){const at=k=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k);assert.ok(at(1).sub(at(0)).cross(at(2).sub(at(0))).length()>1e-10,'nondegenerate triangles');}
};
test('pads stay at the waterline with a shallow rim, notch and narrow radial veins',()=>{
 const pad=lilyPadGeometry();valid(pad);const p=pad.attributes.position,n=pad.attributes.normal;let lo=Infinity,hi=-Infinity,centre=false;const shades=new Set();
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=Math.hypot(x,z);assert.ok(r<=1+1e-6);assert.ok(n.getY(i)>.98);lo=Math.min(lo,y);hi=Math.max(hi,y);centre ||= r<1e-6&&Math.abs(y)<1e-8;if(r>.99)shades.add(pad.attributes.color.getY(i).toFixed(4));if(r>.01)assert.ok(!(x>0&&Math.abs(z/x)<Math.tan(L.notch)-1e-6),'notch stays open');}
 assert.ok(centre&&lo===0&&hi>0&&hi<.006);assert.ok(shades.size>=2,'fine vein shade is present on the same surface');
 const combined=lilyGeometry();valid(combined);combined.computeBoundingBox();assert.equal(combined.boundingBox.min.y,-1,'old stem depth retained');
 assert.ok(combined.attributes.position.count/3<=150,'modest leaf triangle budget');pad.dispose();combined.dispose();
});
test('petals round and cup across their width, overlap in the original two rings, and retain the radius/height envelope',()=>{
 for(const [count,len,lift,turn,width] of L.rings){const g=lilyPetalGeometry(len,lift,width);valid(g);g.computeBoundingBox();assert.ok(g.boundingBox.max.x<=len+1e-6);assert.ok(g.boundingBox.max.y<=lift*len+1e-6);assert.ok(width>len*.5*Math.tan(Math.PI/count),'mid-petal width allows neighbouring petals to overlap');assert.ok(g.attributes.position.count>3);g.dispose();}
 const g=flowerGeometry();valid(g);const p=g.attributes.position;for(let i=0;i<p.count;i++)assert.ok(Math.hypot(p.getX(i),p.getZ(i))<=1+1e-6);assert.ok(p.count/3<=220,'modest flower triangle budget');g.dispose();
});
test('production flora retains positions, contact scaling, material batches and seasonal/fill behaviour',()=>{
 const scene=new T.Scene(),f=new RiverFlora({scene,bedY:(x,z)=>waterYAt(x,z)-1.2});
 const {path}=f.river,o={},station=f.items.lilies[Math.floor(f.items.lilies.length/2)].s;path.at(station,o);const eye=new T.Vector3(o.x,f.river.waterY(station)+1,o.z);
 const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();
 for(const e of f.items.lilies){e.m.decompose(p,q,s);assert.ok(Math.abs(p.y-f.river.waterY(e.s)-F.lilies.lift)<1e-6);assert.ok(s.x>=F.lilies.r[0]&&s.x<=F.lilies.r[1]);assert.ok(s.y*L.cup<.01,'depth-scaled rim remains below 1 cm in this 1.2 m water fixture');}
 assert.equal(scene.children.length,4);assert.equal(f.meshes.lilies.material,f.meshes.flowers.material);assert.equal(f.meshes.lilies.material.map,null);
 f.update(0,eye,false,false,7);assert.equal(f.state().calls,2);const version=f.meshes.lilies.instanceMatrix.version;f.update(.016,eye,false,false,7);assert.equal(f.meshes.lilies.instanceMatrix.version,version,'no stationary per-frame upload');
 f.update(0,eye,false,false,1);assert.equal(f.state().calls,0);f.update(0,eye,false,false,5);assert.equal(f.state().calls,1);f.update(0,eye,false,true,7);assert.equal(f.state().calls,4);f.update(0,eye,true,false,7);assert.equal(f.state().calls,0);
 for(const m of Object.values(f.meshes)){assert.equal(m.castShadow,false);assert.equal(m.receiveShadow,false);m.geometry.dispose();}for(const m of new Set(Object.values(f.meshes).map(m=>m.material)))m.dispose();
});
