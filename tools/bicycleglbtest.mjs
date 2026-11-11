import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('models/bicycle.glb exists and has a valid glTF 2.0 binary header', () => {
  const modelPath = path.resolve('models/bicycle.glb');
  assert.ok(fs.existsSync(modelPath), 'models/bicycle.glb must exist');
  const stat = fs.statSync(modelPath);
  assert.ok(stat.size > 20000 && stat.size < 500000, `Expected reasonable model size (20KB - 500KB), got ${stat.size} bytes`);

  const buf = fs.readFileSync(modelPath);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File must start with glTF binary magic');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('bicycle.glb contains required meshes for frame, tyres, metal and spokes (both LODs)', async () => {
  if (typeof self === 'undefined') globalThis.self = globalThis;
  const modelPath = path.resolve('models/bicycle.glb');
  const glbBuf = fs.readFileSync(modelPath);
  const arrayBuffer = glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });

  assert.ok(gltf.scene, 'gltf must contain a scene');

  const meshNames = [];
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) meshNames.push(obj.name);
  });

  const expectedMeshes = [
    'Bicycle_frame', 'Bicycle_tyres', 'Bicycle_metal', 'Bicycle_spokes',
    'Bicycle_frame_Lo', 'Bicycle_tyres_Lo', 'Bicycle_metal_Lo', 'Bicycle_spokes_Lo'
  ];

  for (const m of expectedMeshes) {
    assert.ok(meshNames.includes(m), `Bicycle GLB must contain mesh: ${m}`);
  }
});

test('loadBicycleModel and bikeGeometry integration', async () => {
  const { loadBicycleModel, bikeGeometry } = await import('../src/streetlife.js');
  const gltf = await loadBicycleModel();
  assert.ok(gltf, 'loadBicycleModel should resolve with gltf');

  // Near LOD
  const nearGeoms = bikeGeometry(1);
  assert.equal(nearGeoms.length, 4, 'bikeGeometry(1) must return [frame, tyres, metal, spokes]');
  const [frameNear, tyresNear, metalNear, spokesNear] = nearGeoms;
  assert.ok(frameNear.attributes.position.count > 0, 'frameNear has positions');
  assert.ok(tyresNear.attributes.position.count > 0, 'tyresNear has positions');
  assert.ok(metalNear.attributes.position.count > 0, 'metalNear has positions');
  assert.ok(spokesNear.attributes.position.count > 0, 'spokesNear has positions');

  // Far LOD
  const farGeoms = bikeGeometry(0);
  assert.equal(farGeoms.length, 4, 'bikeGeometry(0) must return [frame, tyres, metal, spokes]');
  const [frameLo, tyresLo, metalLo, spokesLo] = farGeoms;
  assert.ok(frameLo.attributes.position.count > 0, 'frameLo has positions');
  assert.ok(tyresLo.attributes.position.count > 0, 'tyresLo has positions');
  assert.ok(metalLo.attributes.position.count > 0, 'metalLo has positions');
  assert.ok(spokesLo.attributes.position.count > 0, 'spokesLo has positions');

  // Verify far LOD has fewer or equal vertices
  assert.ok(frameLo.attributes.position.count <= frameNear.attributes.position.count);
});
