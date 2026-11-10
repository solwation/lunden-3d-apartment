import * as THREE from '/home/devcontainers/kvarteret-lunden/node_modules/three/build/three.module.js';
import { GLTFExporter } from '/home/devcontainers/kvarteret-lunden/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
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

export function buildSquirrelModel() {
  // 1. Bones definition
  const root = new THREE.Bone();
  root.name = 'Joint_Root';
  root.position.set(0, 0, 0);

  const haunch = new THREE.Bone();
  haunch.name = 'Joint_Haunch';
  haunch.position.set(0, 0.075, -0.065);
  root.add(haunch);

  const spine = new THREE.Bone();
  spine.name = 'Joint_Spine';
  spine.position.set(0, 0.020, 0.065); // relative to haunch: (0, 0.095, 0.0)
  haunch.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Joint_Chest';
  chest.position.set(0, 0.020, 0.055); // relative to spine: (0, 0.115, 0.055)
  spine.add(chest);

  const head = new THREE.Bone();
  head.name = 'Joint_Head';
  head.position.set(0, 0.020, 0.038); // relative to chest: (0, 0.135, 0.093)
  chest.add(head);

  const snout = new THREE.Bone();
  snout.name = 'Joint_Snout';
  snout.position.set(0, -0.012, 0.045); // relative to head: (0, 0.123, 0.138)
  head.add(snout);

  const earL = new THREE.Bone();
  earL.name = 'Joint_Ear_L';
  earL.position.set(0.021, 0.028, -0.010);
  head.add(earL);

  const earR = new THREE.Bone();
  earR.name = 'Joint_Ear_R';
  earR.position.set(-0.021, 0.028, -0.010);
  head.add(earR);

  // Forelimbs
  const armL = new THREE.Bone();
  armL.name = 'Joint_Arm_L';
  armL.position.set(0.026, -0.045, 0.015);
  chest.add(armL);

  const forearmL = new THREE.Bone();
  forearmL.name = 'Joint_Forearm_L';
  forearmL.position.set(0, -0.030, 0.015);
  armL.add(forearmL);

  const pawL = new THREE.Bone();
  pawL.name = 'Joint_Paw_L';
  pawL.position.set(0, -0.025, 0.010);
  forearmL.add(pawL);

  const armR = new THREE.Bone();
  armR.name = 'Joint_Arm_R';
  armR.position.set(-0.026, -0.045, 0.015);
  chest.add(armR);

  const forearmR = new THREE.Bone();
  forearmR.name = 'Joint_Forearm_R';
  forearmR.position.set(0, -0.030, 0.015);
  armR.add(forearmR);

  const pawR = new THREE.Bone();
  pawR.name = 'Joint_Paw_R';
  pawR.position.set(0, -0.025, 0.010);
  forearmR.add(pawR);

  // Hindlimbs (attached to haunch)
  const thighL = new THREE.Bone();
  thighL.name = 'Joint_Thigh_L';
  thighL.position.set(0.040, -0.015, 0.005);
  haunch.add(thighL);

  const footL = new THREE.Bone();
  footL.name = 'Joint_Foot_L';
  footL.position.set(0, -0.050, 0.015);
  thighL.add(footL);

  const thighR = new THREE.Bone();
  thighR.name = 'Joint_Thigh_R';
  thighR.position.set(-0.040, -0.015, 0.005);
  haunch.add(thighR);

  const footR = new THREE.Bone();
  footR.name = 'Joint_Foot_R';
  footR.position.set(0, -0.050, 0.015);
  thighR.add(footR);

  // Tail bones (along curved spline matching TAIL.rest)
  // Rest coords: [0.075, -0.1], [0.14, -0.15], [0.2, -0.18], [0.26, -0.175], [0.31, -0.135], [0.34, -0.075], [0.35, -0.015]
  const tail0 = new THREE.Bone();
  tail0.name = 'Joint_Tail_0';
  tail0.position.set(0, 0.000, -0.035); // relative to haunch: (0, 0.075, -0.100)
  haunch.add(tail0);

  const tail1 = new THREE.Bone();
  tail1.name = 'Joint_Tail_1';
  tail1.position.set(0, 0.065, -0.050); // -> (0, 0.140, -0.150)
  tail0.add(tail1);

  const tail2 = new THREE.Bone();
  tail2.name = 'Joint_Tail_2';
  tail2.position.set(0, 0.060, -0.030); // -> (0, 0.200, -0.180)
  tail1.add(tail2);

  const tail3 = new THREE.Bone();
  tail3.name = 'Joint_Tail_3';
  tail3.position.set(0, 0.060, 0.005); // -> (0, 0.260, -0.175)
  tail2.add(tail3);

  const tail4 = new THREE.Bone();
  tail4.name = 'Joint_Tail_4';
  tail4.position.set(0, 0.050, 0.040); // -> (0, 0.310, -0.135)
  tail3.add(tail4);

  const tail5 = new THREE.Bone();
  tail5.name = 'Joint_Tail_5';
  tail5.position.set(0, 0.030, 0.060); // -> (0, 0.340, -0.075)
  tail4.add(tail5);

  const tailTip = new THREE.Bone();
  tailTip.name = 'Joint_Tail_Tip';
  tailTip.position.set(0, 0.010, 0.060); // -> (0, 0.350, -0.015)
  tail5.add(tailTip);

  const bones = [
    root, haunch, spine, chest, head, snout, earL, earR,
    armL, forearmL, pawL, armR, forearmR, pawR,
    thighL, footL, thighR, footR,
    tail0, tail1, tail2, tail3, tail4, tail5, tailTip
  ];

  // Helper map from bone name to index
  const boneIndexMap = new Map();
  bones.forEach((b, i) => boneIndexMap.set(b.name, i));

  // 2. Build squirrel low-poly geometry with skin indices & weights
  const positions = [];
  const normals = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  // Helper function to add a quad
  function addQuad(p0, p1, p2, p3, uv0, uv1, uv2, uv3, bIdx, bWeight) {
    const baseIndex = positions.length / 3;

    // Normal calculation
    const vA = new THREE.Vector3(...p0);
    const vB = new THREE.Vector3(...p1);
    const vC = new THREE.Vector3(...p2);
    const cb = new THREE.Vector3().subVectors(vC, vB);
    const ab = new THREE.Vector3().subVectors(vA, vB);
    const n = cb.cross(ab).normalize();

    const verts = [p0, p1, p2, p3];
    const uvsArr = [uv0, uv1, uv2, uv3];

    for (let i = 0; i < 4; i++) {
      positions.push(...verts[i]);
      normals.push(n.x, n.y, n.z);
      uvs.push(...uvsArr[i]);
      skinIndices.push(...bIdx);
      skinWeights.push(...bWeight);
    }

    // Two triangles for quad: 0-1-2, 0-2-3
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }

  // Helper to add a box with skinning
  function addBox(cx, cy, cz, sx, sy, sz, uvBox, bIdx, bWeight) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const [u0, v0, u1, v1] = uvBox;

    // Front (+Z)
    addQuad(
      [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
      [u0, v0], [u1, v0], [u1, v1], [u0, v1],
      bIdx, bWeight
    );
    // Back (-Z)
    addQuad(
      [cx + hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
      [u0, v0], [u1, v0], [u1, v1], [u0, v1],
      bIdx, bWeight
    );
    // Left (+X)
    addQuad(
      [cx + hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz],
      [u0, v0], [u1, v0], [u1, v1], [u0, v1],
      bIdx, bWeight
    );
    // Right (-X)
    addQuad(
      [cx - hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz + hz],
      [cx - hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz - hz],
      [u0, v0], [u1, v0], [u1, v1], [u0, v1],
      bIdx, bWeight
    );
    // Top (+Y)
    addQuad(
      [cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz],
      [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
      [u0, v0], [u1, v0], [u1, v1], [u0, v1],
      bIdx, bWeight
    );
    // Bottom (-Y)
    addQuad(
      [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
      [u0, v0], [u1, v0], [u1, v1], [u0, v1],
      bIdx, bWeight
    );
  }

  // UV areas in [u0, v0, u1, v1] (0 to 1 normalized)
  const UV_BODY  = [0.05, 0.05, 0.45, 0.45];
  const UV_BELLY = [0.55, 0.05, 0.95, 0.45];
  const UV_HEAD  = [0.05, 0.55, 0.45, 0.70];
  const UV_EAR   = [0.05, 0.75, 0.25, 0.95];
  const UV_PAW   = [0.30, 0.75, 0.45, 0.95];
  const UV_TAIL  = [0.55, 0.55, 0.95, 0.75];
  const UV_TIP   = [0.55, 0.80, 0.95, 0.95];

  const idxHaunch = boneIndexMap.get('Joint_Haunch');
  const idxSpine  = boneIndexMap.get('Joint_Spine');
  const idxChest  = boneIndexMap.get('Joint_Chest');
  const idxHead   = boneIndexMap.get('Joint_Head');
  const idxSnout  = boneIndexMap.get('Joint_Snout');
  const idxEarL   = boneIndexMap.get('Joint_Ear_L');
  const idxEarR   = boneIndexMap.get('Joint_Ear_R');
  const idxArmL   = boneIndexMap.get('Joint_Arm_L');
  const idxForeL  = boneIndexMap.get('Joint_Forearm_L');
  const idxPawL   = boneIndexMap.get('Joint_Paw_L');
  const idxArmR   = boneIndexMap.get('Joint_Arm_R');
  const idxForeR  = boneIndexMap.get('Joint_Forearm_R');
  const idxPawR   = boneIndexMap.get('Joint_Paw_R');
  const idxThighL = boneIndexMap.get('Joint_Thigh_L');
  const idxFootL  = boneIndexMap.get('Joint_Foot_L');
  const idxThighR = boneIndexMap.get('Joint_Thigh_R');
  const idxFootR  = boneIndexMap.get('Joint_Foot_R');

  // --- 2a. Pelvis & Haunch ---
  addBox(0, 0.075, -0.065, 0.088, 0.090, 0.090, UV_BODY, [idxHaunch, idxSpine, 0, 0], [0.8, 0.2, 0, 0]);

  // --- 2b. Torso / Belly ---
  addBox(0, 0.088, -0.005, 0.076, 0.085, 0.085, UV_BELLY, [idxSpine, idxChest, idxHaunch, 0], [0.5, 0.3, 0.2, 0]);

  // --- 2c. Chest ---
  addBox(0, 0.105, 0.055, 0.070, 0.075, 0.070, UV_BODY, [idxChest, idxSpine, idxHead, 0], [0.7, 0.2, 0.1, 0]);

  // --- 2d. Head ---
  addBox(0, 0.130, 0.095, 0.065, 0.065, 0.070, UV_HEAD, [idxHead, idxChest, 0, 0], [0.9, 0.1, 0, 0]);

  // Cheeks / Snout
  addBox(0, 0.120, 0.135, 0.038, 0.032, 0.038, UV_HEAD, [idxSnout, idxHead, 0, 0], [0.85, 0.15, 0, 0]);
  // Cute nose tip
  addBox(0, 0.123, 0.154, 0.014, 0.010, 0.010, UV_PAW, [idxSnout, 0, 0, 0], [1.0, 0, 0, 0]);

  // Tufts / Ears
  addBox(0.021, 0.165, 0.084, 0.018, 0.040, 0.012, UV_EAR, [idxEarL, idxHead, 0, 0], [0.9, 0.1, 0, 0]);
  addBox(-0.021, 0.165, 0.084, 0.018, 0.040, 0.012, UV_EAR, [idxEarR, idxHead, 0, 0], [0.9, 0.1, 0, 0]);

  // --- 2e. Forelimbs ---
  // Left arm
  addBox(0.026, 0.062, 0.070, 0.020, 0.038, 0.022, UV_BODY, [idxArmL, idxChest, 0, 0], [0.85, 0.15, 0, 0]);
  addBox(0.024, 0.032, 0.082, 0.016, 0.032, 0.018, UV_BODY, [idxForeL, idxArmL, 0, 0], [0.8, 0.2, 0, 0]);
  addBox(0.023, 0.008, 0.092, 0.018, 0.014, 0.024, UV_PAW, [idxPawL, 0, 0, 0], [1.0, 0, 0, 0]);

  // Right arm
  addBox(-0.026, 0.062, 0.070, 0.020, 0.038, 0.022, UV_BODY, [idxArmR, idxChest, 0, 0], [0.85, 0.15, 0, 0]);
  addBox(-0.024, 0.032, 0.082, 0.016, 0.032, 0.018, UV_BODY, [idxForeR, idxArmR, 0, 0], [0.8, 0.2, 0, 0]);
  addBox(-0.023, 0.008, 0.092, 0.018, 0.014, 0.024, UV_PAW, [idxPawR, 0, 0, 0], [1.0, 0, 0, 0]);

  // --- 2f. Hindlimbs ---
  // Left thigh & foot
  addBox(0.040, 0.060, -0.060, 0.038, 0.065, 0.065, UV_BODY, [idxThighL, idxHaunch, 0, 0], [0.85, 0.15, 0, 0]);
  addBox(0.036, 0.009, -0.045, 0.024, 0.016, 0.068, UV_PAW, [idxFootL, idxThighL, 0, 0], [0.9, 0.1, 0, 0]);

  // Right thigh & foot
  addBox(-0.040, 0.060, -0.060, 0.038, 0.065, 0.065, UV_BODY, [idxThighR, idxHaunch, 0, 0], [0.85, 0.15, 0, 0]);
  addBox(-0.036, 0.009, -0.045, 0.024, 0.016, 0.068, UV_PAW, [idxFootR, idxThighR, 0, 0], [0.9, 0.1, 0, 0]);

  // --- 2g. Bushy Tail (segmented flat-oval segments over back) ---
  const tailSegments = [
    { boneName: 'Joint_Tail_0', pos: [0, 0.075, -0.100], size: [0.035, 0.035, 0.045], uv: UV_TAIL },
    { boneName: 'Joint_Tail_1', pos: [0, 0.140, -0.150], size: [0.065, 0.048, 0.065], uv: UV_TAIL },
    { boneName: 'Joint_Tail_2', pos: [0, 0.200, -0.180], size: [0.088, 0.058, 0.072], uv: UV_TAIL },
    { boneName: 'Joint_Tail_3', pos: [0, 0.260, -0.175], size: [0.096, 0.064, 0.076], uv: UV_TAIL },
    { boneName: 'Joint_Tail_4', pos: [0, 0.310, -0.135], size: [0.090, 0.060, 0.072], uv: UV_TAIL },
    { boneName: 'Joint_Tail_5', pos: [0, 0.340, -0.075], size: [0.075, 0.052, 0.065], uv: UV_TIP },
    { boneName: 'Joint_Tail_Tip', pos: [0, 0.350, -0.015], size: [0.050, 0.038, 0.055], uv: UV_TIP }
  ];

  tailSegments.forEach((seg, i) => {
    const bIdx = boneIndexMap.get(seg.boneName);
    const prevIdx = i > 0 ? boneIndexMap.get(tailSegments[i - 1].boneName) : bIdx;
    addBox(
      seg.pos[0], seg.pos[1], seg.pos[2],
      seg.size[0], seg.size[1], seg.size[2],
      seg.uv,
      [bIdx, prevIdx, 0, 0],
      [0.85, 0.15, 0, 0]
    );
  });

  // --- 2h. Acorn / Hazelnut prop attached to Snout (can be toggled/skinned with snout) ---
  addBox(0, 0.112, 0.180, 0.024, 0.028, 0.024, UV_PAW, [idxSnout, 0, 0, 0], [1.0, 0, 0, 0]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);

  // 3. Create SkinnedMesh and Skeleton
  const skeleton = new THREE.Skeleton(bones);
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide
  });

  const skinnedMesh = new THREE.SkinnedMesh(geo, material);
  skinnedMesh.name = 'Squirrel_Mesh';
  skinnedMesh.add(root);
  skinnedMesh.bind(skeleton);

  // 4. Create Animation Clips
  // Animation 1: idle (soft breathing & tail wave)
  const idleTracks = [];
  // Chest subtle bob
  idleTracks.push(new THREE.VectorKeyframeTrack(
    'Joint_Chest.position',
    [0, 1.0, 2.0],
    [
      0, 0.020, 0.055,
      0, 0.022, 0.055,
      0, 0.020, 0.055
    ]
  ));
  // Head subtle curiosity tilt
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Head.quaternion',
    [0, 0.8, 1.4, 2.0],
    [
      0, 0, 0, 1,
      0, 0.05, 0, 0.998,
      0, -0.04, 0, 0.999,
      0, 0, 0, 1
    ]
  ));
  // Tail soft wave
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Tail_3.quaternion',
    [0, 0.6, 1.3, 2.0],
    [
      0, 0, 0, 1,
      0.04, 0.08, 0, 0.993,
      -0.03, -0.06, 0, 0.996,
      0, 0, 0, 1
    ]
  ));
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Tail_4.quaternion',
    [0, 0.7, 1.4, 2.0],
    [
      0, 0, 0, 1,
      0.05, 0.12, 0, 0.99,
      -0.04, -0.09, 0, 0.994,
      0, 0, 0, 1
    ]
  ));
  const idleClip = new THREE.AnimationClip('idle', 2.0, idleTracks);

  // Animation 2: run / hop (scampering bounding run cycle, 0.4s)
  const runTracks = [];
  runTracks.push(new THREE.VectorKeyframeTrack(
    'Joint_Haunch.position',
    [0, 0.2, 0.4],
    [
      0, 0.075, -0.065,
      0, 0.095, -0.065,
      0, 0.075, -0.065
    ]
  ));
  // Forelegs reach and push
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Arm_L.quaternion',
    [0, 0.15, 0.3, 0.4],
    [
      0.35, 0, 0, 0.936,
      -0.4, 0, 0, 0.916,
      0.2, 0, 0, 0.979,
      0.35, 0, 0, 0.936
    ]
  ));
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Arm_R.quaternion',
    [0, 0.15, 0.3, 0.4],
    [
      -0.3, 0, 0, 0.953,
      0.35, 0, 0, 0.936,
      -0.35, 0, 0, 0.936,
      -0.3, 0, 0, 0.953
    ]
  ));
  // Hindlegs kick
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Thigh_L.quaternion',
    [0, 0.2, 0.4],
    [
      -0.4, 0, 0, 0.916,
      0.45, 0, 0, 0.893,
      -0.4, 0, 0, 0.916
    ]
  ));
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Thigh_R.quaternion',
    [0, 0.2, 0.4],
    [
      -0.4, 0, 0, 0.916,
      0.45, 0, 0, 0.893,
      -0.4, 0, 0, 0.916
    ]
  ));
  // Tail bobbing bounce during run
  runTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Tail_1.quaternion',
    [0, 0.2, 0.4],
    [
      -0.12, 0, 0, 0.992,
      0.15, 0, 0, 0.988,
      -0.12, 0, 0, 0.992
    ]
  ));
  const runClip = new THREE.AnimationClip('run', 0.4, runTracks);

  // Animation 3: flick (squirrel alert tail flick, 0.6s)
  const flickTracks = [];
  flickTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Tail_0.quaternion',
    [0, 0.15, 0.3, 0.6],
    [
      0, 0, 0, 1,
      -0.25, 0, 0, 0.968,
      0.15, 0, 0, 0.988,
      0, 0, 0, 1
    ]
  ));
  flickTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Tail_3.quaternion',
    [0, 0.15, 0.3, 0.6],
    [
      0, 0, 0, 1,
      -0.45, 0, 0, 0.893,
      0.25, 0, 0, 0.968,
      0, 0, 0, 1
    ]
  ));
  flickTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Tail_4.quaternion',
    [0, 0.15, 0.3, 0.6],
    [
      0, 0, 0, 1,
      -0.55, 0, 0, 0.835,
      0.30, 0, 0, 0.953,
      0, 0, 0, 1
    ]
  ));
  const flickClip = new THREE.AnimationClip('flick', 0.6, flickTracks);

  // Animation 4: climb (vertical tree scamper, 0.35s)
  const climbTracks = [];
  climbTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Arm_L.quaternion',
    [0, 0.18, 0.35],
    [
      0.5, 0, 0, 0.866,
      -0.3, 0, 0, 0.953,
      0.5, 0, 0, 0.866
    ]
  ));
  climbTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Arm_R.quaternion',
    [0, 0.18, 0.35],
    [
      -0.3, 0, 0, 0.953,
      0.5, 0, 0, 0.866,
      -0.3, 0, 0, 0.953
    ]
  ));
  const climbClip = new THREE.AnimationClip('climb', 0.35, climbTracks);

  // Animation 5: eat / sit (sitting upright on haunches nibbling nut, 1.2s)
  const eatTracks = [];
  eatTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Haunch.quaternion',
    [0, 0.3, 0.9, 1.2],
    [
      -0.45, 0, 0, 0.893,
      -0.50, 0, 0, 0.866,
      -0.48, 0, 0, 0.877,
      -0.45, 0, 0, 0.893
    ]
  ));
  // Paws up to mouth
  eatTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Arm_L.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2],
    [
      0.65, 0.15, 0, 0.745,
      0.68, 0.18, 0, 0.710,
      0.64, 0.14, 0, 0.756,
      0.68, 0.18, 0, 0.710,
      0.65, 0.15, 0, 0.745
    ]
  ));
  eatTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Arm_R.quaternion',
    [0, 0.3, 0.6, 0.9, 1.2],
    [
      0.65, -0.15, 0, 0.745,
      0.68, -0.18, 0, 0.710,
      0.64, -0.14, 0, 0.756,
      0.68, -0.18, 0, 0.710,
      0.65, -0.15, 0, 0.745
    ]
  ));
  // Snout rapid nibble
  eatTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Snout.quaternion',
    [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2],
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
  const eatClip = new THREE.AnimationClip('eat', 1.2, eatTracks);

  const animations = [idleClip, runClip, flickClip, climbClip, eatClip];

  const scene = new THREE.Scene();
  scene.name = 'SquirrelScene';
  scene.add(skinnedMesh);

  return { scene, skinnedMesh, bones, animations };
}

// Function to export to GLB buffer
export function exportSquirrelGLB() {
  return new Promise((resolve, reject) => {
    const { scene, animations } = buildSquirrelModel();
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

// If run directly:
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Building squirrel GLB...');
  exportSquirrelGLB().then((glb) => {
    const outPath = path.resolve(process.cwd(), 'models/squirrel-rigged.glb');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(glb));
    console.log(`Successfully exported rigged squirrel GLB to ${outPath} (${glb.byteLength} bytes)`);
  }).catch((err) => {
    console.error('Failed to export squirrel GLB:', err);
    process.exit(1);
  });
}
