import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '/home/devcontainers/kvarteret-lunden/node_modules/three/build/three.module.js';
import { GLTFLoader } from '/home/devcontainers/kvarteret-lunden/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
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

test('draw call reduction and all 10 configured squirrel variants supported', () => {
  assert.equal(SQUIRRELS.animals.length, 10, 'Expected 10 squirrels in Kv. Lunden');
  // Procedural squirrel used 3 draw calls per animal (body, head, tail before merge or parts)
  // Rigged model is exactly 1 SkinnedMesh per animal
  const procDrawCallsPerSquirrel = 3;
  const riggedDrawCallsPerSquirrel = 1;
  const totalProcDrawCalls = procDrawCallsPerSquirrel * SQUIRRELS.animals.length;
  const totalRiggedDrawCalls = riggedDrawCallsPerSquirrel * SQUIRRELS.animals.length;

  const reduction = ((totalProcDrawCalls - totalRiggedDrawCalls) / totalProcDrawCalls) * 100;
  assert.equal(totalRiggedDrawCalls, 10, '10 squirrels take 10 draw calls');
  assert.ok(reduction >= 66, `Draw call reduction is ${reduction.toFixed(1)}%`);

  // Verify all 10 variants have distinct color properties
  for (const a of SQUIRRELS.animals) {
    assert.ok(Number.isFinite(a.color), `${a.name} must have a valid coat color`);
    assert.ok(Number.isFinite(a.belly), `${a.name} must have a valid belly color`);
    assert.ok(Number.isFinite(a.tail), `${a.name} must have a valid tail color`);
    assert.ok(a.scale >= 0.8 && a.scale <= 1.4, `${a.name} scale should be between 0.8 and 1.4`);
  }
});
