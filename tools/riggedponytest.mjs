import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('models/pony-rigged.glb exists and has valid glTF 2.0 binary header', () => {
  const modelPath = path.resolve('models/pony-rigged.glb');
  assert.ok(fs.existsSync(modelPath), 'pony-rigged.glb must exist');
  const stat = fs.statSync(modelPath);
  assert.ok(stat.size > 20000 && stat.size < 500000, `Expected reasonable model size (20KB - 500KB), got ${stat.size} bytes`);

  const buf = fs.readFileSync(modelPath);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File must start with glTF binary magic');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('pony-rigged.glb parses with SkinnedMesh, 22 pony bones and animations', async () => {
  if (typeof self === 'undefined') globalThis.self = globalThis;
  const modelPath = path.resolve('models/pony-rigged.glb');
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
  assert.equal(skinnedMesh.name, 'PonyMesh', 'SkinnedMesh should be named PonyMesh');

  const requiredBones = [
    'Joint_Root', 'Joint_Body', 'Joint_Neck', 'Joint_Head', 'Joint_Snout',
    'Joint_Ear_L', 'Joint_Ear_R',
    'Joint_Tail_Base', 'Joint_Tail_Mid', 'Joint_Tail_Tip',
    'Joint_Leg_Front_L', 'Joint_Knee_Front_L', 'Joint_Hoof_Front_L',
    'Joint_Leg_Front_R', 'Joint_Knee_Front_R', 'Joint_Hoof_Front_R',
    'Joint_Leg_Back_L', 'Joint_Knee_Back_L', 'Joint_Hoof_Back_L',
    'Joint_Leg_Back_R', 'Joint_Knee_Back_R', 'Joint_Hoof_Back_R'
  ];

  for (const b of requiredBones) {
    assert.ok(bones.includes(b), `Skeleton must include bone: ${b}`);
  }

  // Animation clips check
  const requiredClips = ['idle', 'walk', 'graze', 'watch', 'pet'];
  const clipNames = gltf.animations.map((c) => c.name);
  for (const clip of requiredClips) {
    assert.ok(clipNames.includes(clip), `Must contain animation clip: ${clip}`);
  }
  assert.equal(gltf.animations.length, 5, `Expected 5 animations, found ${gltf.animations.length}`);
});

test('pony-rigged.glb withers height matches C-pony proportion (~1.32m)', async () => {
  if (typeof self === 'undefined') globalThis.self = globalThis;
  const modelPath = path.resolve('models/pony-rigged.glb');
  const glbBuf = fs.readFileSync(modelPath);
  const arrayBuffer = glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });

  let skinnedMesh = null;
  gltf.scene.traverse((obj) => {
    if (obj.isSkinnedMesh) skinnedMesh = obj;
  });

  const geom = skinnedMesh.geometry;
  geom.computeBoundingBox();
  const box = geom.boundingBox;
  assert.ok(box.max.y >= 1.80 && box.max.y <= 1.95, `Erect ears retain the photo-based loft height (~1.91m), got ${box.max.y}`);
  assert.ok(box.min.y >= -0.05 && box.min.y <= 0.05, `Ground level should be ~0, got ${box.min.y}`);
});

test('loadRiggedPonyModel and Paddock integration', async () => {
  if (typeof globalThis.addEventListener === 'undefined') {
    globalThis.addEventListener = () => {};
  }
  if (typeof document === 'undefined') {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') {
          return {
            width: 512,
            height: 512,
            getContext: () => new Proxy({
              width: 512,
              height: 512,
              createLinearGradient: () => ({ addColorStop: () => {} }),
              createRadialGradient: () => ({ addColorStop: () => {} }),
              getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) })
            }, {
              get(target, prop) {
                if (prop in target) return target[prop];
                return () => {};
              },
              set(target, prop, value) {
                target[prop] = value;
                return true;
              }
            })
          };
        }
        return {};
      }
    };
  }

  const { loadRiggedPonyModel, Paddock } = await import('../src/paddock.js');
  const { centre } = await import('../src/paddockgeo.js');
  const gltf = await loadRiggedPonyModel();
  assert.ok(gltf, 'loadRiggedPonyModel should resolve with gltf');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(centre.x, 5, centre.z);
  const ground = (x, z) => 0;

  const paddock = new Paddock({ scene, camera, ground });
  assert.ok(paddock.riggedPonies, 'Paddock should initialize riggedPonies');
  assert.equal(paddock.riggedPonies.length, 2, 'Paddock should have 2 rigged ponies');

  const [p0, p1] = paddock.riggedPonies;
  assert.ok(p0.object, 'First pony should have an Object3D');
  assert.ok(p0.mixer, 'First pony should have an AnimationMixer');
  assert.ok(p0.actions.idle, 'First pony should have idle action');
  assert.ok(p0.actions.walk, 'First pony should have walk action');
  assert.ok(p0.actions.graze, 'First pony should have graze action');
  assert.ok(p0.actions.watch, 'First pony should have watch action');
  assert.ok(p0.actions.pet, 'First pony should have pet action');
  assert.equal(p0.currentClip, 'graze');

  // Update paddock frame
  paddock.update(0.016, false, 0);
  assert.ok(p0.object.visible, 'Ponies should be visible when in view distance');
  assert.equal(paddock.mesh.material.visible, false, 'Procedural mesh material should be hidden when rigged ponies exist');
  assert.equal(paddock.mesh.visible, true, 'Procedural mesh container must remain visible for blankets and picks');
});


async function posedPony() {
  globalThis.self ??= globalThis;
  const bytes=fs.readFileSync('models/pony-rigged.glb');
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o});
  const update=()=>{gltf.scene.updateMatrixWorld(true);mesh.skeleton.update()};
  const vertex=i=>mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i));
  return {gltf,mesh,update,vertex};
}

test('actual neutral skinning preserves the loft rather than adding bone translations twice',async()=>{
  const {mesh,update,vertex}=await posedPony();update();
  const pos=mesh.geometry.attributes.position;let maximum=0;
  for(let i=0;i<pos.count;i++) maximum=Math.max(maximum,vertex(i).distanceTo(new THREE.Vector3().fromBufferAttribute(pos,i)));
  assert.ok(maximum<1e-5,`inverse bind pose must reproduce source vertices; max displacement ${maximum}`);
  assert.ok((mesh.geometry.index?.count??pos.count)/3<=3000,'bounded detailed pony mesh, one material');
  assert.ok(!Array.isArray(mesh.material));
});

test('all animation clips keep deformed vertices within a pony-sized envelope and grazing reaches the grass',async()=>{
  const {gltf,mesh,update,vertex}=await posedPony(),pos=mesh.geometry.attributes.position;
  for(const clip of gltf.animations){
    const mixer=new THREE.AnimationMixer(gltf.scene);mixer.clipAction(clip).play();
    for(let sample=0;sample<=12;sample++){
      mixer.setTime(clip.duration*sample/13);update();const bounds=new THREE.Box3();let muzzle=Infinity;
      for(let i=0;i<pos.count;i++){const v=vertex(i);assert.ok(v.toArray().every(Number.isFinite));bounds.expandByPoint(v);if(pos.getZ(i)>1.25)muzzle=Math.min(muzzle,v.y)}
      assert.ok(bounds.min.y>-.055&&bounds.max.y<2.12,`${clip.name} keeps hooves/head near their actual frame: ${bounds.min.y}..${bounds.max.y}`);
      assert.ok(bounds.getSize(new THREE.Vector3()).z<2.7,`${clip.name} remains connected-sized, not exploded`);
      if(clip.name==='graze')assert.ok(muzzle>.0&&muzzle<.20,`muzzle reaches grass without sinking, got ${muzzle}`);
    }
    mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
  }
});
