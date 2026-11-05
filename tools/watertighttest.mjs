// Reproducible #1876 candidate, leaving production Ray and TriGrid untouched.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
if (process.env.THREE_DIR) register('data:text/javascript,'+encodeURIComponent(`const r=${JSON.stringify(pathToFileURL(process.env.THREE_DIR+'/').href)};export async function resolve(s,c,n){if(s==='three')return{url:r+'build/three.module.js',shortCircuit:true};return n(s,c);}`));
const T = await import('three');
assert.equal(T.REVISION, '170', 'experiment requires the pinned baseline');
const { intersectTriangle } = await import('./fixtures/watertight-raytriangle.mjs');
const { TriGrid } = await import('../src/trigrid.js');
const raw = await readFile(new URL('../src/trigrid.js', import.meta.url), 'utf8');
const candidate = `import {intersectTriangle} from '${new URL('./fixtures/watertight-raytriangle.mjs', import.meta.url)}';\n` + raw.replace('ray.intersectTriangle(a, b, c,', 'intersectTriangle(ray, a, b, c,');
assert.equal(raw.split('ray.intersectTriangle(a, b, c,').length, 2, 'one exact production call is adapted');
const { TriGrid: Candidate } = await import('data:text/javascript,' + encodeURIComponent(candidate));
const v = (x,y,z) => new T.Vector3(x,y,z), p = v(0,0,0);
const faces = [[v(-2,-2,2),v(-2,-2,-2),v(2,-2,2)], [v(-2,-2,-2),v(2,-2,-2),v(2,-2,2)]];
const seam = v(0,-2,0), origin = v(-4,-9,.4), ray = new T.Ray(origin,seam.clone().sub(origin).normalize());
const old = faces.filter(f=>ray.intersectTriangle(...f,false,p)), fixed = faces.filter(f=>intersectTriangle(ray,...f,false,p));
assert.equal(old.length,0);assert(fixed.length>0);assert(p.distanceTo(seam)<1e-12);
console.log(`PASS upstream shared seam: r170 ${old.length}, candidate ${fixed.length} hits`);
for(const target of [v(-2,-2,-2),v(2,-2,2),seam]) for(const sign of [-1,1]) {
 const r = new T.Ray(target.clone().add(v(0,sign*7,0)),v(0,-sign,0));
 assert(faces.some(f=>intersectTriangle(r,...f,false,p)),'shared corner/seam double side');
 const facing=faces.some(f=>intersectTriangle(r,...f,true,p));
 assert.equal(facing,sign<0,'front winding remains consistent');
}
console.log('PASS shared vertices, seam and both ray sides / front-face culling');
for(const f of [[v(0,0,0),v(0,0,0),v(0,0,0)],[v(0,0,0),v(1,0,0),v(2,0,0)]])assert.equal(intersectTriangle(ray,...f,false,p),null);
assert.equal(intersectTriangle(new T.Ray(origin,v(0,0,0)),...faces[0],false,p),null);
assert.equal(intersectTriangle(new T.Ray(v(0,-2,0),v(1,0,0)),...faces[0],false,p),null);
console.log('PASS degenerate triangles, zero direction and coplanar ray reject');
const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(faces.flatMap(f=>f.flatMap(v=>v.toArray())),3));
const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({side:T.DoubleSide}));
function hits(Grid,mesh,r,far){const out=[],box=new T.Box3().setFromPoints([r.origin,r.at(far,new T.Vector3())]).expandByScalar(.00001);new Grid(mesh).hits(r,far,box,T.DoubleSide,out);return out;}
const dist=origin.distanceTo(seam);
assert.equal(hits(TriGrid,mesh,ray,dist+1e-6).length,0);
assert.equal(hits(Candidate,mesh,new T.Ray(seam,v(0,1,0)),0).length,2);
assert.equal(hits(Candidate,mesh,ray,dist-1e-6).length,0);assert(hits(Candidate,mesh,ray,dist+1e-6).length>0);
assert.equal(hits(Candidate,mesh,new T.Ray(origin,ray.direction.clone().negate()),20).length,0);
console.log('PASS actual TriGrid finite segment includes seam and rejects too-short / backwards ray');
let compared=0,seed=1876;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
for(const side of [T.FrontSide,T.BackSide,T.DoubleSide]) {
 const mesh=new T.Mesh(new T.BoxGeometry(2,3,4,3,3,3),Array.from({length:6},()=>new T.MeshBasicMaterial({side})));
 mesh.position.set(23.73,-1.21,-37.2);mesh.rotation.set(.11,.37,.21);mesh.scale.set(.8,1.2,.9);
 const grids=[new TriGrid(mesh),new Candidate(mesh)];
 for(let k=0;k<1000;k++) {
  const from=mesh.position.clone().add(v(rnd()*10-5,rnd()*10-5,rnd()*10-5));
  const to=mesh.position.clone().add(v(rnd()-.5,rnd()-.5,rnd()-.5));
  const r=new T.Ray(from,to.clone().sub(from).normalize()),far=from.distanceTo(to),box=new T.Box3().setFromPoints([from,to]);
  const all=grids.map(g=>{const out=[];g.hits(r,far,box,side,out);return out;});assert.equal(all[0].length,all[1].length);
  for(let i=0;i<all[0].length;i++){const a=all[0][i],b=all[1][i];assert.equal(a.object,b.object);assert.equal(a.materialIndex,b.materialIndex);assert(a.point.distanceTo(b.point)<1e-10);assert(Math.abs(a.distance-b.distance)<1e-10);assert(a.normal.equals(b.normal));}compared++;
 }
}
console.log(`PASS ${compared} seeded actual TriGrid queries retain object/material/order/normals and points/distances within 1e-10 m`);
