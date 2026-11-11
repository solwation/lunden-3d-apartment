import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadFishModel, fishGeometry } from '../src/riverfish.js';
import { loadSharkModel, finGeometry, skeletonGeometry } from '../src/shark.js';

test('fish-generic.glb exists and contains valid glTF binary header', () => {
  const file = path.resolve(process.cwd(), 'models/fish-generic.glb');
  assert.ok(fs.existsSync(file), 'models/fish-generic.glb must exist');
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 5000, `Fish GLB file should be non-trivial, got ${buf.length} bytes`);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File magic must be glTF');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('shark.glb exists and contains valid glTF binary header', () => {
  const file = path.resolve(process.cwd(), 'models/shark.glb');
  assert.ok(fs.existsSync(file), 'models/shark.glb must exist');
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 5000, `Shark GLB file should be non-trivial, got ${buf.length} bytes`);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File magic must be glTF');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('fish-generic.glb contains rigged fish with skeleton, static mesh, and animation clips', async () => {
  const loader = new GLTFLoader();
  const file = path.resolve(process.cwd(), 'models/fish-generic.glb');
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    loader.parse(ab, '', resolve, reject);
  });

  assert.ok(gltf.scene, 'GLTF scene must be present');

  let riggedMesh = null;
  let staticMesh = null;
  const boneNames = [];

  gltf.scene.traverse((obj) => {
    if (obj.isSkinnedMesh && obj.name === 'Fish_Rigged') riggedMesh = obj;
    if (obj.isMesh && obj.name === 'Fish_Static') staticMesh = obj;
    if (obj.isBone) boneNames.push(obj.name);
  });

  assert.ok(riggedMesh, 'Fish_Rigged SkinnedMesh must exist');
  assert.ok(staticMesh, 'Fish_Static Mesh must exist');
  assert.ok(boneNames.includes('Joint_Root'), 'Bone Joint_Root must exist');
  assert.ok(boneNames.includes('Joint_Tail'), 'Bone Joint_Tail must exist');

  assert.ok(gltf.animations.length >= 2, `Should have at least 2 animation clips, found ${gltf.animations.length}`);
  const clipNames = gltf.animations.map(a => a.name);
  assert.ok(clipNames.includes('swim'), 'Animation swim must exist');
  assert.ok(clipNames.includes('idle'), 'Animation idle must exist');
});

test('shark.glb contains fin, body, and skeleton meshes', async () => {
  const loader = new GLTFLoader();
  const file = path.resolve(process.cwd(), 'models/shark.glb');
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    loader.parse(ab, '', resolve, reject);
  });

  assert.ok(gltf.scene, 'GLTF scene must be present');

  let fin = null;
  let body = null;
  let skeleton = null;

  gltf.scene.traverse((obj) => {
    if (obj.name === 'Shark_fin') fin = obj;
    if (obj.name === 'Shark_body') body = obj;
    if (obj.name === 'Shark_skeleton') skeleton = obj;
  });

  assert.ok(fin, 'Shark_fin mesh must exist');
  assert.ok(body, 'Shark_body mesh must exist');
  assert.ok(skeleton, 'Shark_skeleton mesh must exist');
});

test('riverfish.js and shark.js load and extract GLB geometries correctly', async () => {
  const fishGltf = await loadFishModel();
  assert.ok(fishGltf, 'loadFishModel should return parsed gltf');
  const fg = fishGeometry();
  assert.ok(fg, 'fishGeometry should return geometry');
  assert.ok(fg.attributes.position.count > 0, 'Geometry position attribute should have vertices');
  assert.ok(fg.attributes.color, 'Geometry should have color attribute');

  const sharkGltf = await loadSharkModel();
  assert.ok(sharkGltf, 'loadSharkModel should return parsed gltf');
  const fin = finGeometry(0.58, false);
  assert.ok(fin, 'finGeometry should return geometry');
  assert.ok(fin.attributes.position.count > 0);

  const skel = skeletonGeometry();
  assert.ok(skel, 'skeletonGeometry should return geometry');
  assert.ok(skel.attributes.position.count > 0);
});
