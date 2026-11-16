// #2001: a real topological connection, including the deformation attributes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar, avatarModelGeometry, armTarget } from '../src/avatar.js';
import { avatarLook, OLOF } from '../src/config.js';
import { NAMES, poseOlof, seatedPose, drivingPose } from '../src/olof.js';
const key = (a,i) => ['position','skinIndex','skinWeight','armPump'].map(n => Array.from(a[n].array.slice(i*a[n].itemSize,(i+1)*a[n].itemSize)).map(v=>Math.round(v*1e6)).join(',')).join('|');
function shoulderFacing(av, externalOnly = false) {
 av.object.updateMatrixWorld(true);av.mesh.skeleton.update();
 const mesh=av.mesh,a=mesh.geometry.attributes,p=new THREE.Vector3(),q=new THREE.Vector3(),r=new THREE.Vector3(),face=new THREE.Vector3(),average=new THREE.Vector3(),bone=new THREE.Matrix4(),blend=new THREE.Matrix4(),normal=new THREE.Vector3(),mat=new THREE.Matrix3();
 let min=1,count=0,where;
 for(let i=0;i<a.position.count;i+=3){
  const x=Math.abs(a.position.getX(i)),y=a.position.getY(i);
  if(a.facePart.getX(i)!==0||x<.13||x>.29||y<1.27||y>1.51)continue;
  if(externalOnly&&Math.abs(a.position.getZ(i))<.04&&x<.205)continue;
  mesh.getVertexPosition(i,p);mesh.getVertexPosition(i+1,q);mesh.getVertexPosition(i+2,r);
  face.copy(q).sub(p).cross(r.clone().sub(p)).normalize();average.set(0,0,0);
  for(let v=i;v<i+3;v++){
   blend.elements.fill(0);
   for(let k=0;k<4;k++){
    bone.fromArray(mesh.skeleton.boneMatrices,a.skinIndex.getComponent(v,k)*16);
    const w=a.skinWeight.getComponent(v,k);for(let e=0;e<16;e++)blend.elements[e]+=w*bone.elements[e];
   }
   blend.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
   normal.fromBufferAttribute(a.normal,v).applyMatrix3(mat.setFromMatrix4(blend)).normalize();average.add(normal);
  }
  const dot=face.dot(average.normalize());if(dot<min){min=dot;where=[i,a.position.getX(i),a.position.getY(i),a.position.getZ(i)];}count++;
 }
 return{min,count,where};
}
for (const gender of [0,1]) for (const cut of [0,1,2]) test(`connected shoulder/torso, deformation identity and pump, gender${gender} cut${cut}`, () => {
 const g=avatarModelGeometry({...avatarLook('shoulder2001'),gender,cut,sleeves:0}), a=g.attributes;
 for(let i=0;i<a.position.count;i+=3){
  const role=a.suitRole.getX(i);assert.ok(role>=0&&role<=4);
  assert.equal(a.suitRole.getX(i+1),role);assert.equal(a.suitRole.getX(i+2),role,'surface role is triangle-constant');
  if(role===4)assert.match(NAMES[a.skinIndex.getX(i)],/^hand/,'hand tone belongs to an actual hand part');
  if(role===2)assert.ok(a.facePart.getX(i)>0,'only an actual head part can classify as head');
 }
 const adjacency=new Map(), samples=new Map();
 for(let i=0;i<a.position.count;i+=3){
  if([0,1,2].some(j=>a.facePart.getX(i+j)!==0||![0,1].includes(a.region.getX(i+j))))continue;
  const keys=[0,1,2].map(j=>key(a,i+j));
  keys.forEach((k,j)=>{if(!adjacency.has(k))adjacency.set(k,new Set());samples.set(k,i+j);keys.forEach(v=>adjacency.get(k).add(v));});
 }
 const start=[...samples].find(([k,i])=>Math.abs(a.position.getX(i))<.02&&a.position.getY(i)>1.28&&a.position.getY(i)<1.4)?.[0];
 assert.ok(start,'chest sample');
 const visited=new Set([start]), pending=[start];
 while(pending.length){const k=pending.pop();for(const q of adjacency.get(k))if(!visited.has(q)){visited.add(q);pending.push(q);}}
 for(const side of [-1,1])assert.ok([...visited].some(k=>{const i=samples.get(k);return side*a.position.getX(i)>.23&&a.position.getY(i)>1.28&&a.position.getY(i)<1.43;}),'both deltoids share the chest component through identical skin/pump attributes');
 // All coincident shoulder seam copies must deform identically, including the pump.
 const seam=new Map(); let duplicates=0;
 for(let i=0;i<a.position.count;i++){
  const y=a.position.getY(i),x=Math.abs(a.position.getX(i));
  if(a.facePart.getX(i)!==0||y<1.299||y>1.451||x<.13||x>.20)continue;
  const p=[a.position.getX(i),y,a.position.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
  const identity=key(a,i); if(seam.has(p)){assert.equal(identity,seam.get(p),'same seam vertex has same deformation');duplicates++;}else seam.set(p,identity);
 }
 assert.ok(duplicates>30,'actual shared seam sampled');g.dispose();
 const av=new Avatar({...avatarLook('shoulder2001'),gender,cut,sleeves:0});
 for(const state of [{},{hands:{L:armTarget.up(1,.6),R:armTarget.up(-1,.6)}},{crouch:1},{speed:3}]){
  av.gait=state.speed?1:0;av.phase=.8;av.time=1;av.update(0,state);
  const facing=shoulderFacing(av,Object.keys(state).length>0);assert.ok(facing.count>150);assert.ok(facing.min>0,`geometric and actually skinned normals agree: ${JSON.stringify({state,...facing})}`);
 }
 av.dispose();
});

test('raised arms, crouch, seat and driving keep actual surface finite and hand anchors unchanged',()=>{
 const a=new Avatar({...avatarLook('contact2001'),cut:2});
 const poses=[{hands:{L:armTarget.up(1,.6),R:armTarget.up(-1,.6)}},{crouch:1},{speed:3}];
 for(const state of poses){a.update(0,state);check();}
 for(const pose of [seatedPose(.45),drivingPose(OLOF.car)]){poseOlof(a,pose);check();for(let i=0;i<2;i++){const v=a.object.worldToLocal(a.bones['hand'+(i?'R':'L')].getWorldPosition(new THREE.Vector3()));assert.ok(v.distanceTo(new THREE.Vector3(...pose.hands[i].at))<1e-5,'hand target preserved');}}
 function check(){a.object.updateMatrixWorld(true);a.mesh.skeleton.update();const v=new THREE.Vector3();for(let i=0;i<a.mesh.geometry.attributes.position.count;i++){a.mesh.getVertexPosition(i,v);assert.ok(v.toArray().every(Number.isFinite));assert.ok(v.length()<2.5);}}
 assert.deepEqual(a.mesh.skeleton.bones.map(b=>b.name),NAMES);a.dispose();
});
