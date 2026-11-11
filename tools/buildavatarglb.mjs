import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';
import { avatarModelGeometry } from '../src/avatar.js';
import { defaultFaceLook } from '../src/config.js';
import { attachSkeleton, NAMES, HIP } from '../src/olof.js';

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
  // Reuse the actual detailed production recipe instead of a second generic body.
  // Optional accessory geometry is shader-selected in the application; omit its
  // hidden triangles from the standalone neutral asset, which has no custom shader.
  const look = { ...defaultFaceLook(), style: 0, sleeves: 0, gender: 0, facial: 0,
    legs: 0, cut: 0, skin: 0xd2a17e, hair: 0x493225, top: 0x326b89,
    pants: 0x344452, shoes: 0x302c2a };
  const source = avatarModelGeometry(look), keep = [];
  const face = source.getAttribute('facePart');
  for (let i = 0; i < face.count; i += 3) {
    const part = face.getX(i);
    if (part < 7.5 || part === 11) keep.push(i, i + 1, i + 2);
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(source.attributes)) {
    const data = new attr.array.constructor(keep.length * attr.itemSize);
    for (let i = 0; i < keep.length; i++) {
      const offset = keep[i] * attr.itemSize;
      data.set(attr.array.subarray(offset, offset + attr.itemSize), i * attr.itemSize);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(data, attr.itemSize, attr.normalized));
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true });
  const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
  skinnedMesh.name = 'avatar';
  // attachSkeleton attaches the hierarchy and updates its world matrices BEFORE
  // calculating inverse bind matrices, with exactly the production skinIndex order.
  const boneMap = attachSkeleton(skinnedMesh);
  const bones = NAMES.map(name => boneMap[name]);
  source.dispose();

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
