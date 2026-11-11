import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('models/avatar-rigged.glb exists and has valid glTF 2.0 binary header', () => {
  const modelPath = path.resolve('models/avatar-rigged.glb');
  assert.ok(fs.existsSync(modelPath), 'avatar-rigged.glb must exist');
  const stat = fs.statSync(modelPath);
  assert.ok(stat.size > 20000 && stat.size < 500000, `Expected reasonable model size (20KB - 500KB), got ${stat.size} bytes`);

  const buf = fs.readFileSync(modelPath);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File must start with glTF binary magic');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('avatar-rigged.glb parses with SkinnedMesh, 15 humanoid bones and animations', async () => {
  if (typeof self === 'undefined') globalThis.self = globalThis;
  const modelPath = path.resolve('models/avatar-rigged.glb');
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
  assert.equal(skinnedMesh.name, 'avatar', 'SkinnedMesh should be named avatar');

  const requiredBones = [
    'hips', 'torso', 'head',
    'shoulderL', 'elbowL', 'handL',
    'shoulderR', 'elbowR', 'handR',
    'thighL', 'kneeL', 'footL',
    'thighR', 'kneeR', 'footR'
  ];

  for (const b of requiredBones) {
    assert.ok(bones.includes(b), `Skeleton must include bone: ${b}`);
  }

  // Animation clips check
  const requiredClips = ['idle', 'walk', 'run', 'crouch', 'wave', 'sit'];
  const clipNames = gltf.animations.map((c) => c.name);
  for (const clip of requiredClips) {
    assert.ok(clipNames.includes(clip), `Must contain animation clip: ${clip}`);
  }
  assert.ok(gltf.animations.length >= 6, `Expected at least 6 animations, found ${gltf.animations.length}`);

  // Geometry attributes check
  const geom = skinnedMesh.geometry;
  assert.ok(geom.attributes.position, 'Must have position attribute');
  assert.ok(geom.attributes.normal, 'Must have normal attribute');
  assert.ok(geom.attributes.uv, 'Must have uv attribute');
  assert.ok(geom.attributes.skinIndex, 'Must have skinIndex attribute');
  assert.ok(geom.attributes.skinWeight, 'Must have skinWeight attribute');
  assert.ok(geom.attributes.color, 'Must have color attribute');
  assert.ok(geom.attributes._region || geom.attributes.region, 'Must have region attribute');
  assert.ok(geom.attributes._bare || geom.attributes.bare, 'Must have bare attribute');
});

test('avatar-rigged.glb proportions match Olof bind pose heights', async () => {
  if (typeof self === 'undefined') globalThis.self = globalThis;
  const modelPath = path.resolve('models/avatar-rigged.glb');
  const glbBuf = fs.readFileSync(modelPath);
  const arrayBuffer = glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });

  const boneMap = {};
  gltf.scene.traverse((obj) => {
    if (obj.isBone) boneMap[obj.name] = obj;
  });

  // Check hips height
  assert.ok(Math.abs(boneMap.hips.position.y - 0.90) < 0.01, `Hips y should be ~0.90, got ${boneMap.hips.position.y}`);
  // Check head position relative to torso (NECK = 0.64)
  assert.ok(Math.abs(boneMap.head.position.y - 0.64) < 0.01, `Head y should be ~0.64, got ${boneMap.head.position.y}`);
  // Check foot position relative to knee (-SHIN = -0.41)
  assert.ok(Math.abs(boneMap.footL.position.y - (-0.41)) < 0.01, `FootL y should be ~ -0.41, got ${boneMap.footL.position.y}`);
});
