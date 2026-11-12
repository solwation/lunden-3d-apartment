import assert from'node:assert/strict';import * as T from'three';import{ghostItem,ghostItemTriangles}from'../src/ghostprops.js';import{SHARK as S}from'../src/config.js';import{sharkBodyGeometry,sharkFinSurface}from'../src/sharksurface.js';import{caughtFishGeometry}from'../src/caughtfish.js';
const F=S.surface,g=sharkBodyGeometry(),fin=sharkFinSurface(S.fin,true),bytes=g=>[g.index,...Object.values(g.attributes)].filter(Boolean).reduce((n,a)=>n+a.array.byteLength,0);
for(const mesh of[g,fin])for(const a of Object.values(mesh.attributes))assert.ok(a.array.every(Number.isFinite));
assert.equal(caughtFishGeometry('haj',S.look),g);assert.equal(sharkBodyGeometry(),g);assert.ok(g.index.count/3<=1200&&bytes(g)<=28485);assert.ok(fin.index.count/3<=80&&bytes(fin)<=9180);
assert.equal(g.boundingBox.min.z,-.5);assert.equal(g.boundingBox.max.z,.5);assert.ok(Math.abs(fin.boundingBox.max.y-S.fin)<1e-6);assert.equal(fin.boundingBox.min.y,0);
let offset=F.rings*F.around*2*3;
function volume(geo,start,count){const p=geo.attributes.position,idx=geo.index,v=[new T.Vector3(),new T.Vector3(),new T.Vector3()];let sum=0;for(let i=start;i<start+count;i+=3){v.forEach((p,j)=>p.fromBufferAttribute(geo.attributes.position,idx.getX(i+j)));sum+=v[0].dot(new T.Vector3().crossVectors(v[1],v[2]))/6}return sum}
for(const points of[F.tail,F.pectoral,F.pelvic,F.pectoral,F.pelvic,F.dorsal2,F.anal]){const count=points.length*4*3;assert.ok(volume(g,offset,count)>0,'each closed fin has outward winding on both mirrored sides');offset+=count}
assert.ok(volume(fin,0,fin.index.count)>0,'dorsal fin volume outward');
console.log(`PASS shared bounded carcass ${g.index.count/3} tri/${bytes(g)} B, fin ${fin.index.count/3} tri/${bytes(fin)} B, finite surfaces, original length/fin anchors, outward closed mirrored fins`);

const proxy=ghostItem('sharkfin'),pg=proxy.geometry;assert.equal(ghostItemTriangles('sharkfin'),66);assert.ok(bytes(pg)<=8192);assert.deepEqual(pg.boundingBox.min.toArray(),F.ghost.min);assert.deepEqual(pg.boundingBox.max.toArray(),F.ghost.max);
for(const a of Object.values(pg.attributes))assert.ok(a.array.every(Number.isFinite));assert.equal(proxy.geometry,ghostItem('sharkfin').geometry);assert.equal(proxy.material,ghostItem('sharkfin').material);
const cut=new T.Color(S.cut),col=pg.attributes.color;assert.ok(Array.from({length:col.count},(_,i)=>[col.getX(i),col.getY(i),col.getZ(i)]).some(c=>c.every((v,i)=>Math.abs(v-cut.toArray()[i])<1e-6)),'red cut cap retained');console.log(`PASS remote fin shares one ${bytes(pg)} B cache, exact legacy envelope, finite attributes and red cut cap`);
