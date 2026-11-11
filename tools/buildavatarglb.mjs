import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';

// Polyfill FileReader for GLTFExporter in Node.js
class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
}
globalThis.FileReader = NodeFileReader;

export function buildAvatarModel() {
  // Proportions matching Olof / Avatar:
  const HIP = 0.90;
  const THIGH = 0.44;
  const SHIN = 0.41;
  const UPPER = 0.28;
  const FORE = 0.25;
  const HAND = 0.04;
  const SH = [0.20, 0.55]; // shoulder offset from torso: x, y
  const NECK = 0.64;       // head offset from torso: y

  // 1. Armature (15 bones matching Olof/Avatar NAMES):
  // Root bone at origin to anchor the skeleton in GLB
  const root = new THREE.Bone();
  root.name = 'root';
  root.position.set(0, 0, 0);

  const hips = new THREE.Bone();
  hips.name = 'hips';
  hips.position.set(0, HIP, 0);
  root.add(hips);

  const torso = new THREE.Bone();
  torso.name = 'torso';
  torso.position.set(0, 0, 0);
  hips.add(torso);

  const head = new THREE.Bone();
  head.name = 'head';
  head.position.set(0, NECK, 0);
  torso.add(head);

  // Arms
  const shoulderL = new THREE.Bone();
  shoulderL.name = 'shoulderL';
  shoulderL.position.set(SH[0], SH[1], 0);
  torso.add(shoulderL);

  const elbowL = new THREE.Bone();
  elbowL.name = 'elbowL';
  elbowL.position.set(0, -UPPER, 0);
  shoulderL.add(elbowL);

  const handL = new THREE.Bone();
  handL.name = 'handL';
  handL.position.set(0, -FORE - HAND, 0);
  elbowL.add(handL);

  const shoulderR = new THREE.Bone();
  shoulderR.name = 'shoulderR';
  shoulderR.position.set(-SH[0], SH[1], 0);
  torso.add(shoulderR);

  const elbowR = new THREE.Bone();
  elbowR.name = 'elbowR';
  elbowR.position.set(0, -UPPER, 0);
  shoulderR.add(elbowR);

  const handR = new THREE.Bone();
  handR.name = 'handR';
  handR.position.set(0, -FORE - HAND, 0);
  elbowR.add(handR);

  // Legs
  const thighL = new THREE.Bone();
  thighL.name = 'thighL';
  thighL.position.set(0.085, 0, 0);
  hips.add(thighL);

  const kneeL = new THREE.Bone();
  kneeL.name = 'kneeL';
  kneeL.position.set(0, -THIGH, 0);
  thighL.add(kneeL);

  const footL = new THREE.Bone();
  footL.name = 'footL';
  footL.position.set(0, -SHIN, 0);
  kneeL.add(footL);

  const thighR = new THREE.Bone();
  thighR.name = 'thighR';
  thighR.position.set(-0.085, 0, 0);
  hips.add(thighR);

  const kneeR = new THREE.Bone();
  kneeR.name = 'kneeR';
  kneeR.position.set(0, -THIGH, 0);
  thighR.add(kneeR);

  const footR = new THREE.Bone();
  footR.name = 'footR';
  footR.position.set(0, -SHIN, 0);
  kneeR.add(footR);

  // Order of bones matching NAMES in src/olof.js
  const bones = [
    hips, torso, head,
    shoulderL, elbowL, handL,
    shoulderR, elbowR, handR,
    thighL, kneeL, footL,
    thighR, kneeR, footR
  ];

  const boneMap = new Map();
  bones.forEach((b, i) => boneMap.set(b.name, i));

  // 2. Build humanoid low-poly geometry
  const positions = [];
  const normals = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const colors = [];
  const regions = [];
  const bares = [];
  const mouths = [];
  const puckers = [];
  const rifleSkulls = [];
  const rifleNoses = [];
  const rifleJaws = [];
  const faceParts = [];
  const faceAnchors = [];
  const armPumps = [];
  const indices = [];

  let vertOffset = 0;

  function addPart({
    geom,
    boneName,
    region = 0,
    bare = 0,
    mouthVal = 0,
    facePart = 0,
    uvRect = [0, 0, 1, 1],
    defaultCol = [0.8, 0.7, 0.6]
  }) {
    const posAttr = geom.attributes.position;
    const normAttr = geom.attributes.normal;
    const uvAttr = geom.attributes.uv;
    const boneIdx = boneMap.get(boneName) ?? 0;

    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      positions.push(vx, vy, vz);

      if (normAttr) {
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      } else {
        normals.push(0, 1, 0);
      }

      let u = 0.5, v = 0.5;
      if (uvAttr) {
        u = uvRect[0] + uvAttr.getX(i) * uvRect[2];
        v = uvRect[1] + uvAttr.getY(i) * uvRect[3];
      }
      uvs.push(u, v);

      skinIndices.push(boneIdx, 0, 0, 0);
      skinWeights.push(1.0, 0.0, 0.0, 0.0);

      colors.push(...defaultCol);
      regions.push(region);
      bares.push(bare);
      mouths.push(mouthVal);
      puckers.push(mouthVal > 0 ? 255 : 0);

      rifleSkulls.push(boneName === 'head' && facePart === 1 ? 1 : 0);
      rifleNoses.push(boneName === 'head' && facePart === 4 ? 1 : 0);
      rifleJaws.push(boneName === 'head' && facePart === 1 && vy < 1.58 ? 1 : 0);

      faceParts.push(facePart);
      faceAnchors.push(0, 1.54, 0);
      armPumps.push(0, 0, 0, 0);
    }

    if (geom.index) {
      const idxArr = geom.index.array;
      for (let i = 0; i < idxArr.length; i++) {
        indices.push(vertOffset + idxArr[i]);
      }
    } else {
      for (let i = 0; i < count; i++) {
        indices.push(vertOffset + i);
      }
    }

    vertOffset += count;
  }

  // Head and Face:
  // Base head (bone: head)
  const headGeom = new THREE.SphereGeometry(0.11, 12, 10);
  headGeom.scale(0.92, 1.05, 1.0);
  headGeom.translate(0, 1.63, 0.01);
  addPart({
    geom: headGeom,
    boneName: 'head',
    region: 0, // skin
    bare: 1,
    facePart: 1, // head
    uvRect: [0.05, 0.55, 0.40, 0.40],
    defaultCol: [0.9, 0.75, 0.65]
  });

  // Nose
  const noseGeom = new THREE.ConeGeometry(0.016, 0.035, 4);
  noseGeom.rotateX(Math.PI / 2);
  noseGeom.translate(0, 1.62, 0.12);
  addPart({
    geom: noseGeom,
    boneName: 'head',
    region: 0,
    bare: 1,
    facePart: 4, // nose
    uvRect: [0.22, 0.70, 0.06, 0.06],
    defaultCol: [0.88, 0.70, 0.60]
  });

  // Ears
  for (const s of [-1, 1]) {
    const earGeom = new THREE.SphereGeometry(0.025, 6, 4);
    earGeom.scale(0.4, 0.9, 0.7);
    earGeom.translate(s * 0.105, 1.63, -0.01);
    addPart({
      geom: earGeom,
      boneName: 'head',
      region: 0,
      bare: 1,
      facePart: 5, // ear
      uvRect: [0.02, 0.65, 0.05, 0.05],
      defaultCol: [0.88, 0.72, 0.62]
    });
  }

  // Hair shell
  const hairGeom = new THREE.SphereGeometry(0.116, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
  hairGeom.scale(0.96, 1.06, 1.04);
  hairGeom.translate(0, 1.64, -0.01);
  addPart({
    geom: hairGeom,
    boneName: 'head',
    region: 3, // hair
    bare: 0,
    facePart: 7, // hair
    uvRect: [0.05, 0.75, 0.40, 0.22],
    defaultCol: [0.3, 0.2, 0.15]
  });

  // Neck
  const neckGeom = new THREE.CylinderGeometry(0.052, 0.058, 0.10, 8);
  neckGeom.translate(0, 1.49, 0);
  addPart({
    geom: neckGeom,
    boneName: 'head',
    region: 0,
    bare: 1,
    facePart: 2, // neck
    uvRect: [0.55, 0.10, 0.15, 0.15],
    defaultCol: [0.9, 0.75, 0.65]
  });

  // Torso / Chest / Shirt (bone: torso)
  const torsoGeom = new THREE.CylinderGeometry(0.17, 0.14, 0.42, 10);
  torsoGeom.scale(1.15, 1.0, 0.72);
  torsoGeom.translate(0, 1.25, 0);
  addPart({
    geom: torsoGeom,
    boneName: 'torso',
    region: 1, // top
    bare: 0,
    facePart: 0,
    uvRect: [0.52, 0.52, 0.45, 0.45],
    defaultCol: [0.2, 0.5, 0.8]
  });

  // Hips / Pelvis / Belt (bone: hips)
  const hipsGeom = new THREE.CylinderGeometry(0.145, 0.138, 0.18, 10);
  hipsGeom.scale(1.15, 1.0, 0.75);
  hipsGeom.translate(0, 0.96, 0);
  addPart({
    geom: hipsGeom,
    boneName: 'hips',
    region: 2, // pants
    bare: 0,
    facePart: 0,
    uvRect: [0.05, 0.28, 0.40, 0.20],
    defaultCol: [0.22, 0.25, 0.35]
  });

  // Arms: Shoulders, Forearms, Hands
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    // Upper arm / sleeve
    const upperArmGeom = new THREE.CylinderGeometry(0.046, 0.040, UPPER - 0.02, 8);
    upperArmGeom.translate(s * SH[0], 1.45 - UPPER / 2, 0);
    addPart({
      geom: upperArmGeom,
      boneName: 'shoulder' + side,
      region: 1, // top
      bare: 0,
      facePart: 0,
      uvRect: [0.75, 0.55, 0.20, 0.40],
      defaultCol: [0.2, 0.5, 0.8]
    });

    // Forearm
    const forearmGeom = new THREE.CylinderGeometry(0.038, 0.032, FORE - 0.02, 8);
    forearmGeom.translate(s * SH[0], 1.17 - FORE / 2, 0);
    addPart({
      geom: forearmGeom,
      boneName: 'elbow' + side,
      region: 0, // skin
      bare: 1,
      facePart: 0,
      uvRect: [0.55, 0.25, 0.18, 0.22],
      defaultCol: [0.9, 0.75, 0.65]
    });

    // Hand
    const handGeom = new THREE.BoxGeometry(0.045, 0.09, 0.075);
    handGeom.translate(s * SH[0], 0.88 - 0.05, 0.01);
    addPart({
      geom: handGeom,
      boneName: 'hand' + side,
      region: 0, // skin
      bare: 1,
      facePart: 0,
      uvRect: [0.55, 0.02, 0.18, 0.20],
      defaultCol: [0.9, 0.75, 0.65]
    });
  }

  // Legs: Thighs, Shin/Calf, Shoes
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    // Thigh
    const thighGeom = new THREE.CylinderGeometry(0.065, 0.055, THIGH - 0.02, 8);
    thighGeom.translate(s * 0.085, 0.90 - THIGH / 2, 0);
    addPart({
      geom: thighGeom,
      boneName: 'thigh' + side,
      region: 2, // pants
      bare: 0,
      facePart: 0,
      uvRect: [0.05, 0.02, 0.20, 0.28],
      defaultCol: [0.22, 0.25, 0.35]
    });

    // Shin
    const shinGeom = new THREE.CylinderGeometry(0.052, 0.045, SHIN - 0.02, 8);
    shinGeom.translate(s * 0.085, 0.46 - SHIN / 2, 0);
    addPart({
      geom: shinGeom,
      boneName: 'knee' + side,
      region: 2, // pants
      bare: 0,
      facePart: 0,
      uvRect: [0.25, 0.02, 0.20, 0.28],
      defaultCol: [0.22, 0.25, 0.35]
    });

    // Shoe
    const shoeGeom = new THREE.BoxGeometry(0.095, 0.07, 0.22);
    shoeGeom.translate(s * 0.085, 0.035, 0.04);
    addPart({
      geom: shoeGeom,
      boneName: 'foot' + side,
      region: 5, // shoes
      bare: 0,
      facePart: 0,
      uvRect: [0.75, 0.02, 0.22, 0.22],
      defaultCol: [0.15, 0.15, 0.18]
    });

    // Sole
    const soleGeom = new THREE.BoxGeometry(0.10, 0.015, 0.23);
    soleGeom.translate(s * 0.085, 0.0075, 0.04);
    addPart({
      geom: soleGeom,
      boneName: 'foot' + side,
      region: 4, // fixed white sole
      bare: 0,
      facePart: 0,
      uvRect: [0.75, 0.25, 0.22, 0.10],
      defaultCol: [0.95, 0.95, 0.95]
    });
  }

  // Assemble BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('region', new THREE.Float32BufferAttribute(regions, 1));
  geometry.setAttribute('bare', new THREE.Float32BufferAttribute(bares, 1));
  geometry.setAttribute('mouth', new THREE.Float32BufferAttribute(mouths, 1));
  geometry.setAttribute('pucker', new THREE.Uint8BufferAttribute(puckers, 1, true));
  geometry.setAttribute('rifleSkull', new THREE.Uint8BufferAttribute(rifleSkulls, 1));
  geometry.setAttribute('rifleNose', new THREE.Uint8BufferAttribute(rifleNoses, 1));
  geometry.setAttribute('rifleJaw', new THREE.Uint8BufferAttribute(rifleJaws, 1));
  geometry.setAttribute('facePart', new THREE.Float32BufferAttribute(faceParts, 1));
  geometry.setAttribute('faceAnchor', new THREE.Float32BufferAttribute(faceAnchors, 3));
  geometry.setAttribute('armPump', new THREE.Float32BufferAttribute(armPumps, 4));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const material = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0.1,
    vertexColors: true
  });

  const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
  skinnedMesh.name = 'avatar';
  const skeleton = new THREE.Skeleton(bones);
  skinnedMesh.bind(skeleton);
  skinnedMesh.add(root);

  // 3. Animation Clips
  // Clip 1: idle (subtle breathing, relaxed posture)
  const idleTracks = [];
  idleTracks.push(new THREE.VectorKeyframeTrack(
    'hips.position',
    [0, 1.0, 2.0],
    [
      0, HIP, 0,
      0, HIP + 0.006, 0,
      0, HIP, 0
    ]
  ));
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'torso.quaternion',
    [0, 1.0, 2.0],
    [
      0, 0, 0, 1,
      -0.015, 0, 0, 0.9998,
      0, 0, 0, 1
    ]
  ));
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'head.quaternion',
    [0, 1.0, 2.0],
    [
      0, 0, 0, 1,
      0.012, 0, 0, 0.9999,
      0, 0, 0, 1
    ]
  ));
  const idleClip = new THREE.AnimationClip('idle', 2.0, idleTracks);

  // Clip 2: walk (alternating legs, swinging arms, stride cycle)
  const walkTracks = [];
  walkTracks.push(new THREE.VectorKeyframeTrack(
    'hips.position',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      0, HIP, 0,
      0, HIP + 0.015, 0,
      0, HIP, 0,
      0, HIP + 0.015, 0,
      0, HIP, 0
    ]
  ));
  // Legs walk
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'thighL.quaternion',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      0.30, 0, 0, 0.954,
      0, 0, 0, 1,
      -0.30, 0, 0, 0.954,
      0, 0, 0, 1,
      0.30, 0, 0, 0.954
    ]
  ));
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'kneeL.quaternion',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      0.05, 0, 0, 0.998,
      0.35, 0, 0, 0.936,
      0.02, 0, 0, 0.999,
      0.15, 0, 0, 0.988,
      0.05, 0, 0, 0.998
    ]
  ));
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'thighR.quaternion',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      -0.30, 0, 0, 0.954,
      0, 0, 0, 1,
      0.30, 0, 0, 0.954,
      0, 0, 0, 1,
      -0.30, 0, 0, 0.954
    ]
  ));
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'kneeR.quaternion',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      0.02, 0, 0, 0.999,
      0.15, 0, 0, 0.988,
      0.05, 0, 0, 0.998,
      0.35, 0, 0, 0.936,
      0.02, 0, 0, 0.999
    ]
  ));
  // Arms walk (counter-swing)
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'shoulderL.quaternion',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      -0.20, 0, 0, 0.980,
      0, 0, 0, 1,
      0.20, 0, 0, 0.980,
      0, 0, 0, 1,
      -0.20, 0, 0, 0.980
    ]
  ));
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'shoulderR.quaternion',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      0.20, 0, 0, 0.980,
      0, 0, 0, 1,
      -0.20, 0, 0, 0.980,
      0, 0, 0, 1,
      0.20, 0, 0, 0.980
    ]
  ));
  const walkClip = new THREE.AnimationClip('walk', 1.0, walkTracks);

  // Clip 3: run (higher amplitude, faster cycle)
  const runTracks = [];
  runTracks.push(new THREE.VectorKeyframeTrack(
    'hips.position',
    [0, 0.15, 0.3, 0.45, 0.6],
    [
      0, HIP - 0.02, 0,
      0, HIP + 0.04, 0,
      0, HIP - 0.02, 0,
      0, HIP + 0.04, 0,
      0, HIP - 0.02, 0
    ]
  ));
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'torso.quaternion',
    [0, 0.3, 0.6],
    [
      -0.12, 0, 0, 0.992,
      -0.15, 0, 0, 0.988,
      -0.12, 0, 0, 0.992
    ]
  ));
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'thighL.quaternion',
    [0, 0.15, 0.3, 0.45, 0.6],
    [
      0.55, 0, 0, 0.835,
      0, 0, 0, 1,
      -0.45, 0, 0, 0.893,
      0, 0, 0, 1,
      0.55, 0, 0, 0.835
    ]
  ));
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'thighR.quaternion',
    [0, 0.15, 0.3, 0.45, 0.6],
    [
      -0.45, 0, 0, 0.893,
      0, 0, 0, 1,
      0.55, 0, 0, 0.835,
      0, 0, 0, 1,
      -0.45, 0, 0, 0.893
    ]
  ));
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'shoulderL.quaternion',
    [0, 0.15, 0.3, 0.45, 0.6],
    [
      -0.40, 0, 0, 0.916,
      0, 0, 0, 1,
      0.40, 0, 0, 0.916,
      0, 0, 0, 1,
      -0.40, 0, 0, 0.916
    ]
  ));
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'shoulderR.quaternion',
    [0, 0.15, 0.3, 0.45, 0.6],
    [
      0.40, 0, 0, 0.916,
      0, 0, 0, 1,
      -0.40, 0, 0, 0.916,
      0, 0, 0, 1,
      0.40, 0, 0, 0.916
    ]
  ));
  const runClip = new THREE.AnimationClip('run', 0.6, runTracks);

  // Clip 4: crouch (deep squat, lowered hips, knees bent, torso leaned forward)
  const crouchTracks = [];
  crouchTracks.push(new THREE.VectorKeyframeTrack(
    'hips.position',
    [0, 0.5, 1.0],
    [
      0, HIP - 0.36, 0.08,
      0, HIP - 0.36, 0.08,
      0, HIP - 0.36, 0.08
    ]
  ));
  crouchTracks.push(new THREE.QuaternionKeyframeTrack(
    'torso.quaternion',
    [0, 0.5, 1.0],
    [
      -0.35, 0, 0, 0.936,
      -0.35, 0, 0, 0.936,
      -0.35, 0, 0, 0.936
    ]
  ));
  crouchTracks.push(new THREE.QuaternionKeyframeTrack(
    'thighL.quaternion',
    [0, 0.5, 1.0],
    [
      0.80, 0, 0, 0.60,
      0.80, 0, 0, 0.60,
      0.80, 0, 0, 0.60
    ]
  ));
  crouchTracks.push(new THREE.QuaternionKeyframeTrack(
    'thighR.quaternion',
    [0, 0.5, 1.0],
    [
      0.80, 0, 0, 0.60,
      0.80, 0, 0, 0.60,
      0.80, 0, 0, 0.60
    ]
  ));
  crouchTracks.push(new THREE.QuaternionKeyframeTrack(
    'kneeL.quaternion',
    [0, 0.5, 1.0],
    [
      -0.90, 0, 0, 0.435,
      -0.90, 0, 0, 0.435,
      -0.90, 0, 0, 0.435
    ]
  ));
  crouchTracks.push(new THREE.QuaternionKeyframeTrack(
    'kneeR.quaternion',
    [0, 0.5, 1.0],
    [
      -0.90, 0, 0, 0.435,
      -0.90, 0, 0, 0.435,
      -0.90, 0, 0, 0.435
    ]
  ));
  const crouchClip = new THREE.AnimationClip('crouch', 1.0, crouchTracks);

  // Clip 5: wave (right hand raised waving)
  const waveTracks = [];
  waveTracks.push(new THREE.QuaternionKeyframeTrack(
    'shoulderR.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2, 1.5],
    [
      0, 0, 0.90, 0.435,
      0, 0, 0.95, 0.312,
      0, 0, 0.90, 0.435,
      0, 0, 0.95, 0.312,
      0, 0, 0.90, 0.435,
      0, 0, 0.90, 0.435
    ]
  ));
  waveTracks.push(new THREE.QuaternionKeyframeTrack(
    'elbowR.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2, 1.5],
    [
      0.2, 0, 0.4, 0.894,
      0.2, 0, 0.2, 0.959,
      0.2, 0, 0.4, 0.894,
      0.2, 0, 0.2, 0.959,
      0.2, 0, 0.4, 0.894,
      0.2, 0, 0.4, 0.894
    ]
  ));
  const waveClip = new THREE.AnimationClip('wave', 1.5, waveTracks);

  // Clip 6: sit (chair posture: 90 deg thighs, knees down)
  const sitTracks = [];
  sitTracks.push(new THREE.VectorKeyframeTrack(
    'hips.position',
    [0, 1.0],
    [
      0, 0.52, 0.15,
      0, 0.52, 0.15
    ]
  ));
  sitTracks.push(new THREE.QuaternionKeyframeTrack(
    'thighL.quaternion',
    [0, 1.0],
    [
      0.707, 0, 0, 0.707,
      0.707, 0, 0, 0.707
    ]
  ));
  sitTracks.push(new THREE.QuaternionKeyframeTrack(
    'thighR.quaternion',
    [0, 1.0],
    [
      0.707, 0, 0, 0.707,
      0.707, 0, 0, 0.707
    ]
  ));
  sitTracks.push(new THREE.QuaternionKeyframeTrack(
    'kneeL.quaternion',
    [0, 1.0],
    [
      -0.707, 0, 0, 0.707,
      -0.707, 0, 0, 0.707
    ]
  ));
  sitTracks.push(new THREE.QuaternionKeyframeTrack(
    'kneeR.quaternion',
    [0, 1.0],
    [
      -0.707, 0, 0, 0.707,
      -0.707, 0, 0, 0.707
    ]
  ));
  const sitClip = new THREE.AnimationClip('sit', 1.0, sitTracks);

  const animations = [idleClip, walkClip, runClip, crouchClip, waveClip, sitClip];

  const scene = new THREE.Scene();
  scene.name = 'AvatarScene';
  scene.add(skinnedMesh);

  return { scene, skinnedMesh, bones, animations };
}

export function exportAvatarGLB() {
  return new Promise((resolve, reject) => {
    const { scene, animations } = buildAvatarModel();
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (glb) => resolve(glb),
      (err) => reject(err),
      {
        binary: true,
        animations,
        embedImages: false
      }
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Building avatar GLB...');
  exportAvatarGLB().then((glb) => {
    const outPath = path.resolve(process.cwd(), 'models/avatar-rigged.glb');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(glb));
    console.log(`Successfully exported rigged avatar GLB to ${outPath} (${glb.byteLength} bytes)`);
  }).catch((err) => {
    console.error('Failed to export avatar GLB:', err);
    process.exit(1);
  });
}
