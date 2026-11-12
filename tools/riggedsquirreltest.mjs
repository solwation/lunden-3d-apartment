import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SQUIRRELS } from '../src/config.js';

test('models/squirrel-rigged.glb binary file exists and is valid glTF 2.0 binary', () => {
  const modelPath = path.resolve('models/squirrel-rigged.glb');
  assert.ok(fs.existsSync(modelPath), 'squirrel-rigged.glb must exist');
  const stat = fs.statSync(modelPath);
  assert.ok(stat.size > 20000 && stat.size < 500000, `Expected reasonable model size, got ${stat.size} bytes`);

  const buf = fs.readFileSync(modelPath);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File must start with glTF binary magic');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('squirrel-rigged.glb parses with SkinnedMesh, 25 bones and required animations', async () => {
  const modelPath = path.resolve('models/squirrel-rigged.glb');
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
  assert.equal(skinnedMesh.name, 'Squirrel_Mesh', 'SkinnedMesh should be named Squirrel_Mesh');

  const requiredBones = [
    'Joint_Root', 'Joint_Haunch', 'Joint_Spine', 'Joint_Chest', 'Joint_Head', 'Joint_Snout',
    'Joint_Ear_L', 'Joint_Ear_R', 'Joint_Arm_L', 'Joint_Forearm_L', 'Joint_Paw_L',
    'Joint_Arm_R', 'Joint_Forearm_R', 'Joint_Paw_R', 'Joint_Thigh_L', 'Joint_Foot_L',
    'Joint_Thigh_R', 'Joint_Foot_R', 'Joint_Tail_0', 'Joint_Tail_1', 'Joint_Tail_2',
    'Joint_Tail_3', 'Joint_Tail_4', 'Joint_Tail_5', 'Joint_Tail_Tip'
  ];

  for (const b of requiredBones) {
    assert.ok(bones.includes(b), `Skeleton must include bone: ${b}`);
  }
  assert.equal(bones.length, 25, `Expected 25 bones, found ${bones.length}`);

  const requiredClips = ['idle', 'run', 'flick', 'climb', 'eat'];
  const clipNames = gltf.animations.map((c) => c.name);
  for (const clip of requiredClips) {
    assert.ok(clipNames.includes(clip), `Must contain animation clip: ${clip}`);
  }
});

test('all ten looks share rig/fallback surfaces within the near/far budget and bind neutrally', async () => {
  const {squirrelGeometry,squirrelRigGeometry}=await import('../src/squirrels.js');
  const buf=fs.readFileSync('models/squirrel-rigged.glb');
  const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
  let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o});gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();
  assert.ok(!Array.isArray(mesh.material),'one material/draw per animal, also before the migration');
  for(const spec of SQUIRRELS.animals) for(const far of [false,true]) {
    const g=squirrelRigGeometry(spec,far), fallback=squirrelGeometry(spec,far);
    assert.deepEqual(Array.from(g.attributes.color.array),Array.from(fallback.attributes.color.array),spec.name+' anatomical colours');
    assert.deepEqual(Array.from(g.attributes.position.array),Array.from(fallback.attributes.position.array),spec.name+' shared shape');
    assert.equal(g.index.count,fallback.index.count,'rig/fallback topology parity');
    assert.ok(g.index.count/3 <= (far?1600:4000), spec.name+' LOD triangle budget');
    for(const a of [...Object.values(g.attributes),...Object.values(fallback.morphAttributes).flat()])
      assert.ok(a.array.every(Number.isFinite), spec.name+' finite geometry/morphs');
    mesh.geometry=g;
    for(let i=0;i<g.attributes.position.count;i++) {
      const p=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i),q=mesh.applyBoneTransform(i,p.clone());
      assert.ok(p.distanceTo(q)<1e-6,'every vertex stays in bind position');
    }
  }
});
test('all five animated silhouettes remain finite and inside the squirrel envelope',async()=>{
  const buf=fs.readFileSync('models/squirrel-rigged.glb');
  for(const clipName of ['idle','run','flick','climb','eat']) {
    const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
    const clip=gltf.animations.find(c=>c.name===clipName),mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(clip).play();
    let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o});
    const {squirrelRigGeometry}=await import('../src/squirrels.js');
    for(const spec of SQUIRRELS.animals)for(const far of [false,true]) {
      mesh.geometry=squirrelRigGeometry(spec,far);
      for(let j=0;j<=12;j++) {
        mixer.setTime(clip.duration*j/12);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();mesh.computeBoundingBox();
        const size=mesh.boundingBox.getSize(new THREE.Vector3());
        gltf.scene.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite),'finite full world transforms'));
        assert.ok(size.toArray().every(Number.isFinite));assert.ok(size.x<.35&&size.y<.55&&size.z<.6,clipName+' whole deformed bounds');
      }
    }
  }
});
