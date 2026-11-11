import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { duckModel } from '../src/duckmodel.js';
import { duckBill } from '../src/duckkiss.js';

test('models/duck-rigged.glb binary file exists and is valid glTF 2.0 binary', () => {
  const modelPath = path.resolve('models/duck-rigged.glb');
  assert.ok(fs.existsSync(modelPath), 'duck-rigged.glb must exist');
  const stat = fs.statSync(modelPath);
  assert.ok(stat.size > 15000 && stat.size < 500000, `Expected reasonable model size, got ${stat.size} bytes`);

  const buf = fs.readFileSync(modelPath);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File must start with glTF binary magic');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('duck-rigged.glb parses with SkinnedMesh, 14 bones and required animations', async () => {
  const modelPath = path.resolve('models/duck-rigged.glb');
  const glbBuf = fs.readFileSync(modelPath);
  const arrayBuffer = glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });

  assert.ok(gltf.scene, 'gltf must contain a scene');

  let skinnedMesh = null;
  const bones = [];
  gltf.scene.traverse((obj) => {
    if (obj.isSkinnedMesh) skinnedMesh = obj;
    if (obj.isBone) bones.push(obj.name);
  });

  assert.ok(skinnedMesh, 'Must contain a SkinnedMesh');
  assert.equal(skinnedMesh.name, 'Duck_Mesh', 'SkinnedMesh should be named Duck_Mesh');

  const requiredBones = [
    'Joint_Root', 'Joint_Body', 'Joint_Neck', 'Joint_Head', 'Joint_Bill',
    'Joint_Wing_L', 'Joint_WingTip_L', 'Joint_Wing_R', 'Joint_WingTip_R',
    'Joint_Tail', 'Joint_Leg_L', 'Joint_Foot_L', 'Joint_Leg_R', 'Joint_Foot_R'
  ];

  for (const b of requiredBones) {
    assert.ok(bones.includes(b), `Skeleton must include bone: ${b}`);
  }
  assert.equal(bones.length, 14, `Expected 14 bones, found ${bones.length}`);

  const requiredClips = ['idle', 'swim', 'waddle', 'flap', 'eat'];
  const clipNames = gltf.animations.map((c) => c.name);
  for (const clip of requiredClips) {
    assert.ok(clipNames.includes(clip), `Must contain animation clip: ${clip}`);
  }
  assert.equal(gltf.animations.length, 5, `Expected 5 animations, found ${gltf.animations.length}`);
});

test('procedural duckModel remains compatible with duckBill kissing contact point', () => {
  const m = duckModel(false);
  const bill = duckBill(m.attributes.position);
  assert.equal(m.index.count / 3, 640);
  assert.ok(Math.abs(bill.z - 0.5541) < 0.01, `bill.z should be approx 0.554, got ${bill.z}`);
  assert.ok(bill.halfY > 0.01, `bill.halfY should be positive, got ${bill.halfY}`);
  m.dispose();
});

test('both duck looks bind every vertex and retain exact idle bill contact',async()=>{
 const{duckRigGeometry}=await import('../src/duckmodel.js');const buf=fs.readFileSync('models/duck-rigged.glb');
 for(const female of [false,true]){
  const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o});mesh.geometry=duckRigGeometry(female);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();
  assert.ok(mesh.geometry.index.count/3<1000);assert.ok(!Array.isArray(mesh.material));
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i);assert.ok(v.distanceTo(mesh.applyBoneTransform(i,v.clone()))<1e-6,'neutral binding');}
  const expected=duckBill(duckModel(female).attributes.position),actual=duckBill(p);assert.deepEqual(actual,expected,'unchanged kiss bill');
  const mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations.find(c=>c.name==='idle')).play();mixer.setTime(.35);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();
  const deformed=p.clone();for(let i=0;i<p.count;i++){const v=mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(p,i));deformed.setXYZ(i,v.x,v.y,v.z)}
  const bill=duckBill(deformed);for(const k of ['z','y','halfY'])assert.ok(Math.abs(bill[k]-expected[k])<1e-6,k+' during kissing idle');
 }
});
test('all clips preserve finite coherent whole-duck bounds',async()=>{
 const buf=fs.readFileSync('models/duck-rigged.glb');
 for(const name of ['idle','swim','waddle','flap','eat']){
  const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o});const clip=gltf.animations.find(c=>c.name===name),mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(clip).play();
  for(let i=0;i<=12;i++){mixer.setTime(clip.duration*i/12);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();mesh.computeBoundingBox();const size=mesh.boundingBox.getSize(new THREE.Vector3());assert.ok(size.toArray().every(Number.isFinite));assert.ok(size.x<1&&size.y<1&&size.z<1.3,name+' deformed envelope');}
 }
});
