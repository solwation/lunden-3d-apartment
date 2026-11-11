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
