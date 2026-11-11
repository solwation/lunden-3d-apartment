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

export function buildPonyModel() {
  // Proportions matching C-pony: withers 1.32m
  // 1. Bones definition (19 bones)
  const root = new THREE.Bone();
  root.name = 'Joint_Root';
  root.position.set(0, 0, 0);

  const body = new THREE.Bone();
  body.name = 'Joint_Body';
  body.position.set(0, 1.05, -0.05);
  root.add(body);

  const neck = new THREE.Bone();
  neck.name = 'Joint_Neck';
  neck.position.set(0, 0.20, 0.55); // relative to body -> world (0, 1.25, 0.50)
  body.add(neck);

  const head = new THREE.Bone();
  head.name = 'Joint_Head';
  head.position.set(0, 0.30, 0.25); // relative to neck -> world (0, 1.55, 0.75)
  neck.add(head);

  const snout = new THREE.Bone();
  snout.name = 'Joint_Snout';
  snout.position.set(0, -0.25, 0.30); // relative to head -> world (0, 1.30, 1.05)
  head.add(snout);

  const earL = new THREE.Bone();
  earL.name = 'Joint_Ear_L';
  earL.position.set(0.09, 0.12, -0.05);
  head.add(earL);

  const earR = new THREE.Bone();
  earR.name = 'Joint_Ear_R';
  earR.position.set(-0.09, 0.12, -0.05);
  head.add(earR);

  // Tail
  const tailBase = new THREE.Bone();
  tailBase.name = 'Joint_Tail_Base';
  tailBase.position.set(0, 0.15, -0.70); // relative to body -> world (0, 1.20, -0.75)
  body.add(tailBase);

  const tailMid = new THREE.Bone();
  tailMid.name = 'Joint_Tail_Mid';
  tailMid.position.set(0, -0.35, -0.12);
  tailBase.add(tailMid);

  const tailTip = new THREE.Bone();
  tailTip.name = 'Joint_Tail_Tip';
  tailTip.position.set(0, -0.40, 0.02);
  tailMid.add(tailTip);

  // Front legs
  const legFrontL = new THREE.Bone();
  legFrontL.name = 'Joint_Leg_Front_L';
  legFrontL.position.set(0.18, -0.10, 0.55); // world y: 0.95, z: 0.50
  body.add(legFrontL);

  const kneeFrontL = new THREE.Bone();
  kneeFrontL.name = 'Joint_Knee_Front_L';
  kneeFrontL.position.set(0, -0.45, 0); // world y: 0.50
  legFrontL.add(kneeFrontL);

  const hoofFrontL = new THREE.Bone();
  hoofFrontL.name = 'Joint_Hoof_Front_L';
  hoofFrontL.position.set(0, -0.48, 0); // world y: 0.02
  kneeFrontL.add(hoofFrontL);

  const legFrontR = new THREE.Bone();
  legFrontR.name = 'Joint_Leg_Front_R';
  legFrontR.position.set(-0.18, -0.10, 0.55);
  body.add(legFrontR);

  const kneeFrontR = new THREE.Bone();
  kneeFrontR.name = 'Joint_Knee_Front_R';
  kneeFrontR.position.set(0, -0.45, 0);
  legFrontR.add(kneeFrontR);

  const hoofFrontR = new THREE.Bone();
  hoofFrontR.name = 'Joint_Hoof_Front_R';
  hoofFrontR.position.set(0, -0.48, 0);
  kneeFrontR.add(hoofFrontR);

  // Hind legs
  const legBackL = new THREE.Bone();
  legBackL.name = 'Joint_Leg_Back_L';
  legBackL.position.set(0.18, 0.05, -0.55); // world y: 1.10, z: -0.60
  body.add(legBackL);

  const kneeBackL = new THREE.Bone();
  kneeBackL.name = 'Joint_Knee_Back_L';
  kneeBackL.position.set(0, -0.55, -0.05); // world y: 0.55
  legBackL.add(kneeBackL);

  const hoofBackL = new THREE.Bone();
  hoofBackL.name = 'Joint_Hoof_Back_L';
  hoofBackL.position.set(0, -0.52, 0.05); // world y: 0.03
  kneeBackL.add(hoofBackL);

  const legBackR = new THREE.Bone();
  legBackR.name = 'Joint_Leg_Back_R';
  legBackR.position.set(-0.18, 0.05, -0.55);
  body.add(legBackR);

  const kneeBackR = new THREE.Bone();
  kneeBackR.name = 'Joint_Knee_Back_R';
  kneeBackR.position.set(0, -0.55, -0.05);
  legBackR.add(kneeBackR);

  const hoofBackR = new THREE.Bone();
  hoofBackR.name = 'Joint_Hoof_Back_R';
  hoofBackR.position.set(0, -0.52, 0.05);
  kneeBackR.add(hoofBackR);

  const bones = [
    root, body, neck, head, snout, earL, earR,
    tailBase, tailMid, tailTip,
    legFrontL, kneeFrontL, hoofFrontL,
    legFrontR, kneeFrontR, hoofFrontR,
    legBackL, kneeBackL, hoofBackL,
    legBackR, kneeBackR, hoofBackR
  ];

  const boneMap = new Map();
  bones.forEach((b, i) => boneMap.set(b.name, i));

  // 2. Geometry construction with skinning & UVs
  const positions = [];
  const normals = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const colors = [];
  const indices = [];

  let vertOffset = 0;

  function addPart({
    geom,
    boneName,
    uvRect = [0, 0, 1, 1],
    defaultCol = [0.85, 0.82, 0.78]
  }) {
    const posAttr = geom.attributes.position;
    const normAttr = geom.attributes.normal;
    const uvAttr = geom.attributes.uv;
    const boneIdx = boneMap.get(boneName) ?? 0;

    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
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

  // A. Barrel / Body (attached to Joint_Body)
  // Dimensions: width ~0.52, height ~0.64, length ~1.35
  const bodyGeom = new THREE.CylinderGeometry(0.32, 0.30, 1.35, 12);
  bodyGeom.rotateX(Math.PI / 2);
  bodyGeom.scale(0.85, 1.08, 1.0);
  bodyGeom.translate(0, 1.02, -0.05);
  addPart({
    geom: bodyGeom,
    boneName: 'Joint_Body',
    uvRect: [0.05, 0.05, 0.55, 0.40],
    defaultCol: [0.85, 0.82, 0.78]
  });

  // Withers crest
  const withersGeom = new THREE.ConeGeometry(0.18, 0.42, 6);
  withersGeom.scale(0.7, 1.0, 1.2);
  withersGeom.translate(0, 1.30, 0.42);
  addPart({
    geom: withersGeom,
    boneName: 'Joint_Body',
    uvRect: [0.05, 0.35, 0.25, 0.15],
    defaultCol: [0.85, 0.82, 0.78]
  });

  // B. Neck (attached to Joint_Neck)
  const neckGeom = new THREE.CylinderGeometry(0.14, 0.22, 0.58, 8);
  neckGeom.rotateX(0.75); // tilted forward
  neckGeom.scale(0.72, 1.0, 1.15);
  neckGeom.translate(0, 1.38, 0.60);
  addPart({
    geom: neckGeom,
    boneName: 'Joint_Neck',
    uvRect: [0.05, 0.50, 0.40, 0.30],
    defaultCol: [0.85, 0.82, 0.78]
  });

  // Mane crest along neck
  const maneGeom = new THREE.BoxGeometry(0.045, 0.55, 0.15);
  maneGeom.rotateX(0.75);
  maneGeom.translate(0, 1.46, 0.56);
  addPart({
    geom: maneGeom,
    boneName: 'Joint_Neck',
    uvRect: [0.65, 0.55, 0.30, 0.20],
    defaultCol: [0.55, 0.53, 0.50]
  });

  // C. Head (attached to Joint_Head)
  const headGeom = new THREE.BoxGeometry(0.20, 0.28, 0.34);
  headGeom.rotateX(-0.55); // sloping down towards muzzle
  headGeom.scale(0.85, 1.0, 1.0);
  headGeom.translate(0, 1.50, 0.85);
  addPart({
    geom: headGeom,
    boneName: 'Joint_Head',
    uvRect: [0.45, 0.50, 0.25, 0.30],
    defaultCol: [0.85, 0.82, 0.78]
  });

  // Forehead star mark patch (for Princess)
  const starGeom = new THREE.PlaneGeometry(0.065, 0.08);
  starGeom.rotateX(-0.55);
  starGeom.translate(0, 1.54, 0.94);
  addPart({
    geom: starGeom,
    boneName: 'Joint_Head',
    uvRect: [0.90, 0.90, 0.08, 0.08],
    defaultCol: [0.98, 0.98, 0.98]
  });

  // D. Snout / Muzzle (attached to Joint_Snout)
  const snoutGeom = new THREE.BoxGeometry(0.14, 0.16, 0.20);
  snoutGeom.translate(0, 1.30, 1.05);
  addPart({
    geom: snoutGeom,
    boneName: 'Joint_Snout',
    uvRect: [0.70, 0.40, 0.25, 0.15],
    defaultCol: [0.45, 0.42, 0.40]
  });

  // Nostrils
  for (const s of [-1, 1]) {
    const nostril = new THREE.BoxGeometry(0.025, 0.04, 0.02);
    nostril.translate(s * 0.045, 1.30, 1.155);
    addPart({
      geom: nostril,
      boneName: 'Joint_Snout',
      uvRect: [0.92, 0.45, 0.05, 0.05],
      defaultCol: [0.15, 0.12, 0.12]
    });
  }

  // Eyes
  for (const s of [-1, 1]) {
    const eyeGeom = new THREE.SphereGeometry(0.03, 6, 4);
    eyeGeom.scale(0.4, 0.8, 0.8);
    eyeGeom.translate(s * 0.11, 1.53, 0.85);
    addPart({
      geom: eyeGeom,
      boneName: 'Joint_Head',
      uvRect: [0.85, 0.80, 0.10, 0.10],
      defaultCol: [0.10, 0.08, 0.08]
    });
  }

  // Ears (attached to Joint_Ear_L / R)
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const earGeom = new THREE.ConeGeometry(0.045, 0.16, 5);
    earGeom.rotateZ(s * -0.25);
    earGeom.translate(s * 0.09, 1.68, 0.72);
    addPart({
      geom: earGeom,
      boneName: 'Joint_Ear_' + side,
      uvRect: [0.55, 0.80, 0.15, 0.15],
      defaultCol: [0.85, 0.82, 0.78]
    });
  }

  // E. Tail (attached to tailBase, tailMid, tailTip)
  const tail1Geom = new THREE.CylinderGeometry(0.065, 0.055, 0.40, 7);
  tail1Geom.rotateX(-0.35);
  tail1Geom.translate(0, 1.05, -0.80);
  addPart({
    geom: tail1Geom,
    boneName: 'Joint_Tail_Base',
    uvRect: [0.65, 0.10, 0.30, 0.25],
    defaultCol: [0.55, 0.53, 0.50]
  });

  const tail2Geom = new THREE.CylinderGeometry(0.055, 0.045, 0.42, 7);
  tail2Geom.translate(0, 0.65, -0.86);
  addPart({
    geom: tail2Geom,
    boneName: 'Joint_Tail_Mid',
    uvRect: [0.65, 0.10, 0.30, 0.25],
    defaultCol: [0.55, 0.53, 0.50]
  });

  const tail3Geom = new THREE.ConeGeometry(0.050, 0.35, 6);
  tail3Geom.rotateX(Math.PI);
  tail3Geom.translate(0, 0.38, -0.86);
  addPart({
    geom: tail3Geom,
    boneName: 'Joint_Tail_Tip',
    uvRect: [0.65, 0.10, 0.30, 0.25],
    defaultCol: [0.55, 0.53, 0.50]
  });

  // F. Front Legs (attached to Joint_Leg_Front_L/R, Knee, Hoof)
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    // Upper leg / shoulder
    const upperGeom = new THREE.CylinderGeometry(0.09, 0.07, 0.45, 8);
    upperGeom.translate(s * 0.18, 0.75, 0.50);
    addPart({
      geom: upperGeom,
      boneName: 'Joint_Leg_Front_' + side,
      uvRect: [0.05, 0.80, 0.15, 0.18],
      defaultCol: [0.85, 0.82, 0.78]
    });

    // Lower leg / cannon
    const lowerGeom = new THREE.CylinderGeometry(0.065, 0.052, 0.48, 8);
    lowerGeom.translate(s * 0.18, 0.26, 0.50);
    addPart({
      geom: lowerGeom,
      boneName: 'Joint_Knee_Front_' + side,
      uvRect: [0.22, 0.80, 0.15, 0.18],
      defaultCol: [0.80, 0.76, 0.72]
    });

    // Hoof
    const hoofGeom = new THREE.CylinderGeometry(0.056, 0.072, 0.08, 8);
    hoofGeom.translate(s * 0.18, 0.04, 0.51);
    addPart({
      geom: hoofGeom,
      boneName: 'Joint_Hoof_Front_' + side,
      uvRect: [0.38, 0.82, 0.12, 0.12],
      defaultCol: [0.15, 0.14, 0.13]
    });
  }

  // G. Hind Legs (attached to Joint_Leg_Back_L/R, Knee, Hoof)
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    // Thigh
    const thighGeom = new THREE.CylinderGeometry(0.12, 0.085, 0.55, 8);
    thighGeom.rotateX(-0.15);
    thighGeom.translate(s * 0.18, 0.85, -0.58);
    addPart({
      geom: thighGeom,
      boneName: 'Joint_Leg_Back_' + side,
      uvRect: [0.05, 0.80, 0.15, 0.18],
      defaultCol: [0.85, 0.82, 0.78]
    });

    // Hock & Cannon
    const cannonGeom = new THREE.CylinderGeometry(0.075, 0.055, 0.52, 8);
    cannonGeom.translate(s * 0.18, 0.28, -0.60);
    addPart({
      geom: cannonGeom,
      boneName: 'Joint_Knee_Back_' + side,
      uvRect: [0.22, 0.80, 0.15, 0.18],
      defaultCol: [0.80, 0.76, 0.72]
    });

    // Hoof
    const hoofGeom = new THREE.CylinderGeometry(0.058, 0.075, 0.08, 8);
    hoofGeom.translate(s * 0.18, 0.04, -0.59);
    addPart({
      geom: hoofGeom,
      boneName: 'Joint_Hoof_Back_' + side,
      uvRect: [0.38, 0.82, 0.12, 0.12],
      defaultCol: [0.15, 0.14, 0.13]
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const material = new THREE.MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0.05,
    vertexColors: true
  });

  const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
  skinnedMesh.name = 'PonyMesh';
  const skeleton = new THREE.Skeleton(bones);
  skinnedMesh.bind(skeleton);
  skinnedMesh.add(root);

  // 3. Animation Clips
  // Clip 1: idle (subtle breathing, tail swish, ear twitch)
  const idleTracks = [];
  idleTracks.push(new THREE.VectorKeyframeTrack(
    'Joint_Body.position',
    [0, 1.0, 2.0],
    [
      0, 1.05, -0.05,
      0, 1.055, -0.05,
      0, 1.05, -0.05
    ]
  ));
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Tail_Base.quaternion',
    [0, 0.5, 1.0, 1.5, 2.0],
    [
      0, 0, 0, 1,
      0, 0.15, 0, 0.988,
      0, 0, 0, 1,
      0, -0.15, 0, 0.988,
      0, 0, 0, 1
    ]
  ));
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Ear_L.quaternion',
    [0, 0.4, 0.8, 2.0],
    [
      0, 0, 0, 1,
      0.15, 0, 0, 0.988,
      0, 0, 0, 1,
      0, 0, 0, 1
    ]
  ));
  const idleClip = new THREE.AnimationClip('idle', 2.0, idleTracks);

  // Clip 2: walk (diagonal four-beat walk gait, swinging neck and tail)
  const walkTracks = [];
  walkTracks.push(new THREE.VectorKeyframeTrack(
    'Joint_Body.position',
    [0, 0.3, 0.6, 0.9, 1.2],
    [
      0, 1.05, -0.05,
      0, 1.07, -0.05,
      0, 1.05, -0.05,
      0, 1.07, -0.05,
      0, 1.05, -0.05
    ]
  ));
  // Front legs
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Leg_Front_L.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2],
    [
      0.25, 0, 0, 0.968,
      0, 0, 0, 1,
      -0.25, 0, 0, 0.968,
      0, 0, 0, 1,
      0.25, 0, 0, 0.968
    ]
  ));
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Leg_Front_R.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2],
    [
      -0.25, 0, 0, 0.968,
      0, 0, 0, 1,
      0.25, 0, 0, 0.968,
      0, 0, 0, 1,
      -0.25, 0, 0, 0.968
    ]
  ));
  // Hind legs (diagonal phase offset)
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Leg_Back_L.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2],
    [
      -0.22, 0, 0, 0.975,
      0, 0, 0, 1,
      0.22, 0, 0, 0.975,
      0, 0, 0, 1,
      -0.22, 0, 0, 0.975
    ]
  ));
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Leg_Back_R.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2],
    [
      0.22, 0, 0, 0.975,
      0, 0, 0, 1,
      -0.22, 0, 0, 0.975,
      0, 0, 0, 1,
      0.22, 0, 0, 0.975
    ]
  ));
  // Neck bobbing
  walkTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Neck.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2],
    [
      0.05, 0, 0, 0.998,
      -0.03, 0, 0, 0.999,
      0.05, 0, 0, 0.998,
      -0.03, 0, 0, 0.999,
      0.05, 0, 0, 0.998
    ]
  ));
  const walkClip = new THREE.AnimationClip('walk', 1.2, walkTracks);

  // Clip 3: graze (neck and head lowered towards ground, chewing motion)
  const grazeTracks = [];
  grazeTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Neck.quaternion',
    [0, 0.6, 1.2, 1.8, 2.5],
    [
      0.65, 0, 0, 0.760,
      0.68, 0, 0, 0.733,
      0.65, 0, 0, 0.760,
      0.68, 0, 0, 0.733,
      0.65, 0, 0, 0.760
    ]
  ));
  grazeTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Head.quaternion',
    [0, 0.6, 1.2, 1.8, 2.5],
    [
      0.30, 0, 0, 0.954,
      0.25, 0, 0, 0.968,
      0.30, 0, 0, 0.954,
      0.25, 0, 0, 0.968,
      0.30, 0, 0, 0.954
    ]
  ));
  grazeTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Snout.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.5],
    [
      0, 0, 0, 1,
      0.08, 0, 0, 0.996,
      0, 0, 0, 1,
      0.08, 0, 0, 0.996,
      0, 0, 0, 1,
      0.08, 0, 0, 0.996,
      0, 0, 0, 1,
      0.08, 0, 0, 0.996,
      0, 0, 0, 1
    ]
  ));
  const grazeClip = new THREE.AnimationClip('graze', 2.5, grazeTracks);

  // Clip 4: watch (erect neck, alert ears, looking around)
  const watchTracks = [];
  watchTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Neck.quaternion',
    [0, 0.75, 1.5],
    [
      -0.08, 0, 0, 0.996,
      -0.08, 0, 0, 0.996,
      -0.08, 0, 0, 0.996
    ]
  ));
  watchTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Head.quaternion',
    [0, 0.5, 1.0, 1.5],
    [
      0, 0, 0, 1,
      0, 0.12, 0, 0.992,
      0, -0.12, 0, 0.992,
      0, 0, 0, 1
    ]
  ));
  const watchClip = new THREE.AnimationClip('watch', 1.5, watchTracks);

  // Clip 5: pet (affectionate nuzzle, happy ear flick)
  const petTracks = [];
  petTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Neck.quaternion',
    [0, 0.3, 0.7, 1.0],
    [
      0.15, 0, 0, 0.988,
      0.10, 0, 0, 0.995,
      0.18, 0, 0, 0.983,
      0.15, 0, 0, 0.988
    ]
  ));
  petTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Head.quaternion',
    [0, 0.3, 0.7, 1.0],
    [
      0, 0.18, 0, 0.983,
      0.05, 0.22, 0, 0.974,
      -0.05, 0.14, 0, 0.988,
      0, 0.18, 0, 0.983
    ]
  ));
  const petClip = new THREE.AnimationClip('pet', 1.0, petTracks);

  const animations = [idleClip, walkClip, grazeClip, watchClip, petClip];

  const scene = new THREE.Scene();
  scene.name = 'PonyScene';
  scene.add(skinnedMesh);

  return { scene, skinnedMesh, bones, animations };
}

export function exportPonyGLB() {
  return new Promise((resolve, reject) => {
    const { scene, animations } = buildPonyModel();
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
  console.log('Building pony GLB...');
  exportPonyGLB().then((glb) => {
    const outPath = path.resolve(process.cwd(), 'models/pony-rigged.glb');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(glb));
    console.log(`Successfully exported rigged pony GLB to ${outPath} (${glb.byteLength} bytes)`);
  }).catch((err) => {
    console.error('Failed to export pony GLB:', err);
    process.exit(1);
  });
}
