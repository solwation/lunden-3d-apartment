import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { trainerDetails } from '../src/avatartrainers.js';
import { avatarModelGeometry, Avatar } from '../src/avatar.js';
import { decodeAvatarLook, AVATAR_TRAINERS as S } from '../src/config.js';
import { NAMES } from '../src/olof.js';
import { applyRestPose } from '../src/remote-pose.js';
const baseline='a366067a79ab90a67abc5a66b3db205f67788506',out='docs/verification/2084';
const before=f=>execFileSync('git',['show',`${baseline}:${f}`],{maxBuffer:16e6}),sha=b=>createHash('sha256').update(b).digest('hex');
const path=new URL('../src/.avatar2084-before.js',import.meta.url);
writeFileSync(path,before('src/avatar.js'));
let old;
try{old=await import(path.href)}finally{unlinkSync(path)}
function upper(){const g=new T.SphereGeometry(.5,10,4,0,Math.PI*2,0,Math.PI/2).scale(.105,.18,.27),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const z=p.getZ(i),t=Math.min(1,Math.max(0,(z+.02)/.14));p.setY(i,p.getY(i)*(1-.58*t*t*(3-2*t))-.442);p.setZ(i,z+.055)}g.computeVertexNormals();return g;}
const rows=[];
test('details are deterministic finite facet-registered surfaces inside the existing shoe bounds',()=>{
 const g=upper(),parts=trainerDetails(g),again=trainerDetails(g);g.computeBoundingBox();let tris=0;
 for(const[j,{geometry,colour,shade}]of parts.entries()){
  assert.deepEqual(geometry.attributes.position.array,again[j].geometry.attributes.position.array);
  const p=geometry.attributes.position,n=geometry.attributes.normal;tris+=p.count/3;
  assert.ok(colour===undefined||colour===0xe9e6df);assert.ok(shade>=.8&&shade<=1);
  for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i);assert.ok(v.toArray().every(Number.isFinite));assert.ok(g.boundingBox.containsPoint(v),'no new outer bounds');assert.ok(Math.abs(new T.Vector3().fromBufferAttribute(n,i).length()-1)<1e-6);
   // All projected vertices sit the exact configured amount above the real triangulated upper.
   const ray=new T.Raycaster(new T.Vector3(v.x,1,v.z),new T.Vector3(0,-1,0));const mesh=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));const hit=ray.intersectObject(mesh)[0];assert.ok(hit);const lift=v.y-hit.point.y;assert.ok(Math.abs(lift-Math.min(g.boundingBox.max.y-hit.point.y,[S.tongue.lift,S.panels.lift,S.laces.lift,S.laces.lift+S.laces.over][j]))<1e-7);
  }
 }
 assert.ok(tris*2<=400,`bounded added triangles ${tris*2}`);
});
test('all original attributes including sole/palette remain byte-identical; added details bind only to the existing feet',()=>{
 for(const[cm,code,cut,legs]of[[180,'241302112',0,0],[120,'413211212',2,2]]){
  const look={...decodeAvatarLook(code,'body2080'),height:cm,cut,legs},a=old.avatarModelGeometry(look),b=avatarModelGeometry(look),ap=a.attributes.position.array,bp=b.attributes.position.array,extra=b.attributes.position.count-a.attributes.position.count;
  let first=0;while(first<ap.length&&ap[first]===bp[first])first++;assert.equal(first%3,0);const at=first/3;
  assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));
  for(const[k,aa]of Object.entries(a.attributes)){const ba=b.attributes[k],start=at*aa.itemSize,end=(at+extra)*aa.itemSize;const restored=new aa.array.constructor([...ba.array.subarray(0,start),...ba.array.subarray(end)]);assert.deepEqual(restored,aa.array,k+' old bytes');}
  const footIds=['footL','footR'].map(k=>NAMES.indexOf(k));
  for(let i=at;i<at+extra;i++){
   assert.ok(footIds.includes(b.attributes.skinIndex.getX(i)));assert.equal(b.attributes.skinWeight.getX(i),1);assert.deepEqual([b.attributes.skinWeight.getY(i),b.attributes.skinWeight.getZ(i),b.attributes.skinWeight.getW(i)],[0,0,0]);assert.equal(b.attributes.facePart.getX(i),0);
   const r=b.attributes.region.getX(i);assert.ok(r===4||r===5);const c=new T.Color(r===4?0xe9e6df:look.shoes),colour=[b.attributes.color.getX(i),b.attributes.color.getY(i),b.attributes.color.getZ(i)];
   if(r===4)assert.ok(colour.every((v,k)=>Math.abs(v-[c.r,c.g,c.b][k])<1e-7));else assert.ok([S.tongue.shade,S.panels.shade].some(s=>colour.every((v,k)=>Math.abs(v-[c.r,c.g,c.b][k]*s)<1e-7)));
  }
  rows.push({height:cm,beforeTriangles:a.attributes.position.count/3,afterTriangles:b.attributes.position.count/3,addedTriangles:extra/3,originalVerticesRestoredExactly:true,addedAtVertex:at,attributes:Object.fromEntries(Object.entries(b.attributes).map(([k,v])=>[k,{beforeBytes:a.attributes[k].array.byteLength,afterBytes:v.array.byteLength,itemSize:v.itemSize}]))});
 }
});
test('rig, sole contact, gait/rest pose and self-view source contracts stay intact',()=>{
 const unchanged=['src/olof.js','src/avatarselfview.js','src/avatarfootik.js','src/ghosts.js','src/main.js','src/rest.js','src/remote-pose.js','src/furniture.js','src/reflections.js','src/hand.js'];
 for(const f of unchanged)assert.deepEqual(readFileSync(f),before(f),f);
 const cfg=readFileSync('src/config.js','utf8'),a=cfg.indexOf('// #2084: AVATAR_TRAINERS'),b=cfg.indexOf('export const AVATAR_CLOTHES',a);assert.equal(cfg.slice(0,a)+cfg.slice(b),before('src/config.js').toString());
 const look={...decodeAvatarLook('241302112','body2080'),height:180},av=new Avatar(look),prior=new old.Avatar(look);
 assert.ok(av.mesh.isSkinnedMesh);assert.equal(av.mesh.geometry.groups.length,0);assert.equal(Array.isArray(av.mesh.material),false);
 for(const state of[{speed:0},{speed:1.6},{speed:3.2},{speed:0,pose:1},{speed:0,pose:2},{speed:0,pose:3}])for(let i=0;i<4;i++){
  av.update(1/60,state);prior.update(1/60,state);applyRestPose(av,state.pose);applyRestPose(prior,state.pose);av.object.updateMatrixWorld(true);prior.object.updateMatrixWorld(true);
  for(const k of NAMES)assert.deepEqual(av.bones[k].matrixWorld.elements,prior.bones[k].matrixWorld.elements,k);
 }
 const original=before('src/avatar.js').toString(),current=readFileSync('src/avatar.js','utf8');assert.equal(current.slice(current.indexOf('function walkGait(')),original.slice(original.indexOf('function walkGait(')));
 mkdirSync(out,{recursive:true});writeFileSync(out+'/native.json',JSON.stringify({baseline,rows,unchanged:Object.fromEntries(unchanged.map(f=>[f,sha(readFileSync(f))])),sourceSha256:Object.fromEntries(['src/avatartrainers.js','src/avatar.js','src/config.js','tools/avatartrainerstest.mjs'].map(f=>[f,sha(readFileSync(f))]))},null,2)+'\n');
 av.dispose();prior.dispose();
});
