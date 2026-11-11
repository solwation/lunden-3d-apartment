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
  assert.ok(box.max.y >= 1.65 && box.max.y <= 1.85, `Total head height should be ~1.7m, got ${box.max.y}`);
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

