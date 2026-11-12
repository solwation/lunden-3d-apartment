import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { Avatar, avatarModelGeometry, loadRiggedAvatarModel, armTarget } from '../src/avatar.js';
import { NAMES, buildOlof, poseOlof, drivingPose } from '../src/olof.js';
import { decodeAvatarLook } from '../src/config.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('models/avatar-rigged.glb exists and has valid glTF 2.0 binary header', () => {
  const modelPath = path.resolve('models/avatar-rigged.glb');
  assert.ok(fs.existsSync(modelPath), 'avatar-rigged.glb must exist');
  const stat = fs.statSync(modelPath);
  assert.ok(stat.size > 20000, `Detailed model payload is present (${stat.size} bytes)`);

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
  assert.ok(!geom.attributes.uv, 'The detailed vertex-color source needs no lossy replacement texture atlas');
  assert.ok(geom.attributes.skinIndex, 'Must have skinIndex attribute');
  assert.ok(geom.attributes.skinWeight, 'Must have skinWeight attribute');
  assert.ok(geom.attributes.color, 'Must have color attribute');
  assert.ok(geom.attributes._facepart || geom.attributes.facePart, 'Detailed face/accessory identity is retained');
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


const loaded = async () => {
  const data = await loadRiggedAvatarModel();
  assert.ok(data?.scene, 'real committed model loads');
  let mesh;
  data.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  return { data, mesh };
};
const posedBounds = mesh => {
  mesh.updateWorldMatrix(true, false); mesh.skeleton.update();
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    mesh.getVertexPosition(i, v);
    assert.ok(v.toArray().every(Number.isFinite), 'every deformed vertex is finite');
    box.expandByPoint(v);
  }
  return box;
};

test('actual inverse bind matrices preserve every rest vertex and production bone order', async () => {
  const { data, mesh } = await loaded();
  data.scene.updateMatrixWorld(true); mesh.skeleton.update();
  assert.deepEqual(mesh.skeleton.bones.map(b => b.name), NAMES);
  const raw = new THREE.Vector3(), deformed = new THREE.Vector3();
  let error = 0;
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    raw.fromBufferAttribute(mesh.geometry.attributes.position, i);
    mesh.getVertexPosition(i, deformed);
    error = Math.max(error, raw.distanceTo(deformed));
  }
  assert.ok(error < 2e-6, `bind-pose skinning must be identity, maximum vertex error ${error}`);
  assert.ok(posedBounds(mesh).max.y < 2, 'whole head remains at human height');
});

test('all six exported clips keep real deformed vertices inside one connected human envelope', async () => {
  const { data, mesh } = await loaded();
  for (const clip of data.animations) {
    const mixer = new THREE.AnimationMixer(data.scene), action = mixer.clipAction(clip);
    action.play();
    for (const fraction of [0, .25, .5, .75]) {
      mixer.setTime(clip.duration * fraction);
      const b = posedBounds(mesh), size = b.getSize(new THREE.Vector3());
      assert.ok(size.y < 2.2 && size.x < 1.8 && size.z < 1.8, `${clip.name} at ${fraction}: ${size.toArray()}`);
      assert.ok(b.min.y > -.6 && b.max.y < 2.1, `${clip.name}: head/feet envelope ${b.min.y}..${b.max.y}`);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(data.scene);
  }
});

test('production loaded avatars retain detailed source variants and private palettes', async () => {
  await loaded();
  for (const [i, code] of ['240304100h0', '240344100h8q1', '240374100h8q3', '240334100h0q3', '240354100w0l8'].entries()) {
    const lk = { ...decodeAvatarLook(code, '1907'), style: i, sleeves: i % 2, gender: i % 2,
      facial: i % 4, legs: i % 3, cut: i % 3, hat: i % 5, glasses: i % 4 };
    const a = new Avatar(lk), b = new Avatar({ ...lk, skin: 0x916034, top: 0xb02b3d });
    const source = avatarModelGeometry(lk);
    assert.ok(a.isRigged, 'the loaded path is exercised');
    assert.deepEqual(a.mesh.geometry.attributes.position.array, source.attributes.position.array);
    for (const name of ['facePart', 'faceAnchor', 'armPump', 'mouth', 'pucker', 'rifleSkull', 'rifleNose', 'rifleJaw']) {
      assert.deepEqual(a.mesh.geometry.attributes[name].array, source.attributes[name].array, name);
    }
    assert.notEqual(a.mesh.geometry.attributes.color.array, b.mesh.geometry.attributes.color.array);
    const before = a.mesh.geometry.attributes.color.array.slice();
    b.mesh.geometry.attributes.color.setXYZ(0, 1, 0, 0);
    assert.deepEqual(a.mesh.geometry.attributes.color.array, before, 'another avatar cannot recolor this avatar');
    assert.ok(a.mesh.geometry.attributes.armPump.array.some(v => v > 0), 'real pump shoulder weights remain');
    assert.ok(a.mesh.geometry.attributes.facePart.array.some(v => v >= 70), 'actual optional watches/accessories remain');
    a.dispose(); b.dispose(); source.dispose();
  }
});

test('loaded runtime poses match the same established procedural IK through movement, tools and air', async () => {
  await loaded();
  const a = new Avatar('1907-poses'), b = new Avatar(a.look);
  b.object.remove(b.riggedScene); b.setupProcedural(b.look, b.rim);
  for (const state of [{}, { speed: 1.2 }, { speed: 3 }, { crouch: 1 },
    { hands: { R: armTarget.up(-1, .5) } }, { air: 1, airV: [1, 0, 1] },
    { dance: 2 }, { hands: { R: { at: [-.2, 1.3, .3], pole: [-1, 0, 1] } } }]) {
    a.update(.125, state); b.update(.125, state);
    a.object.updateMatrixWorld(true); b.object.updateMatrixWorld(true);
    for (const name of NAMES) {
      assert.deepEqual(a.bones[name].position.toArray(), b.bones[name].position.toArray(), name);
      assert.deepEqual(a.bones[name].quaternion.toArray(), b.bones[name].quaternion.toArray(), name);
    }
    assert.ok(posedBounds(a.mesh).getSize(new THREE.Vector3()).y < 2.5);
  }
  a.dispose(); b.dispose();
});

test('late rig availability preserves Olof/mirror retained mesh and bone references', async () => {
  const { data } = await loaded();
  const avatar = new Avatar('1907-late');
  const mesh = avatar.mesh, bones = avatar.bones;
  avatar.setupRigged(data);
  assert.equal(avatar.mesh, mesh); assert.equal(avatar.bones, bones);
  const fig = buildOlof();
  poseOlof(fig, drivingPose({ seat: .54, wheel: [.45, .95, 0], pedals: .5 }));
  assert.equal(fig.mesh, fig.avatar.mesh); assert.equal(fig.bones, fig.avatar.bones);
  assert.ok(posedBounds(fig.mesh).max.y < 2.2);
  avatar.dispose(); fig.avatar.dispose();
});

// The old segmented limbs could pass bone/IK tests while opening visible rings at
// elbows and knees. Exercise the actual new shared surface across those joints.
test('continuous elbow/knee surfaces have normalized adjacent-bone weights through bent poses', async () => {
  await loaded();
  for (const lk of [
    { ...decodeAvatarLook('241302112', '1916'), cut: 0, sleeves: 1, legs: 0, height: 195 },
    { ...decodeAvatarLook('241302112', '1916'), cut: 1, legs: 1, height: 120 },
  ]) {
    const a = new Avatar(lk), g = a.mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const joints = ['elbowL', 'elbowR', 'kneeL', 'kneeR'].map(n => [NAMES.indexOf(n), NAMES.indexOf(n.replace('elbow', 'shoulder').replace('knee', 'thigh'))]);
    const joined = new Set();
    for (let i = 0; i < si.count; i++) {
      const weights = Array.from({ length: 4 }, (_, j) => sw.array[i * 4 + j]);
      assert.ok(Math.abs(weights.reduce((n, v) => n + v, 0) - 1) < 2e-6, 'weights stay normalized');
      assert.ok(weights.every(v => v >= 0 && v <= 1));
      for (const [joint, parent] of joints) {
        const has = id => Array.from({ length: 4 }, (_, j) => si.array[i * 4 + j] === id && weights[j] > .1).some(Boolean);
        if (has(joint) && has(parent)) joined.add(joint);
      }
    }
    assert.equal(joined.size, joints.length, 'each joint has a real shared deforming surface');
    for (const state of [{ crouch: 1 }, { hands: { R: armTarget.up(-1, .5) } }, { speed: 3 }]) {
      a.update(.125, state); const box = posedBounds(a.mesh);
      assert.ok([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite));
      assert.ok(box.getSize(new THREE.Vector3()).y < 2.6);
    }
    a.dispose();
  }
});
