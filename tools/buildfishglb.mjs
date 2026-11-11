import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {riverFishGeometry} from '../src/riverfishmodel.js';
import {caughtFishGeometry} from '../src/caughtfish.js';
import {finGeometry,skeletonGeometry} from '../src/shark.js';
import {SHARK} from '../src/config.js';
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

// -------------------------------------------------------------
// 1. Generic Fish Model (Höje å arter)
// -------------------------------------------------------------
export function buildFishModel() {
  const root = new THREE.Bone();
  root.name = 'Joint_Root';
  root.position.set(0, 0, 0);

  const head = new THREE.Bone();
  head.name = 'Joint_Head';
  head.position.set(0, 0, 0.35);
  root.add(head);

  const spine1 = new THREE.Bone();
  spine1.name = 'Joint_Spine_1';
  spine1.position.set(0, 0, -0.15);
  root.add(spine1);

  const spine2 = new THREE.Bone();
  spine2.name = 'Joint_Spine_2';
  spine2.position.set(0, 0, -0.22);
  spine1.add(spine2);

  const tail = new THREE.Bone();
  tail.name = 'Joint_Tail';
  tail.position.set(0, 0, -0.25);
  spine2.add(tail);

  const bones = [root, head, spine1, spine2, tail];
  const skeleton = new THREE.Skeleton(bones);

  // Unit dimensions match the existing per-species instance scaling exactly.
  const cleaned=riverFishGeometry();

  // Vertex colors: darker back, lighter belly
  const pos = cleaned.attributes.position;
  const count = pos.count;

  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // Bone weights based on longitudinal position z
    // z ranges from +0.5 (head) to -0.52 (tail)
    if (z > 0.20) {
      // Head
      skinIndices.set([1, 0, 0, 0], i * 4);
      skinWeights.set([1.0, 0, 0, 0], i * 4);
    } else if (z > -0.05) {
      // Root / mid
      skinIndices.set([0, 1, 2, 0], i * 4);
      const wHead = Math.max(0, (z - 0.05) / 0.15);
      skinWeights.set([1.0 - wHead, wHead, 0, 0], i * 4);
    } else if (z > -0.25) {
      // Spine 1
      skinIndices.set([2, 3, 0, 0], i * 4);
      const t = (-0.05 - z) / 0.20;
      skinWeights.set([1.0 - t, t, 0, 0], i * 4);
    } else if (z > -0.38) {
      // Spine 2
      skinIndices.set([3, 4, 2, 0], i * 4);
      const t = (-0.25 - z) / 0.13;
      skinWeights.set([1.0 - t, t, 0, 0], i * 4);
    } else {
      // Tail
      skinIndices.set([4, 3, 0, 0], i * 4);
      skinWeights.set([1.0, 0, 0, 0], i * 4);
    }
  }

  cleaned.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
  cleaned.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));

  const material = new THREE.MeshStandardMaterial({
    name: 'Mat_Fish',
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.15,
    side: THREE.DoubleSide
  });

  const skinnedMesh = new THREE.SkinnedMesh(cleaned, material);
  skinnedMesh.name = 'Fish_Rigged';
  skinnedMesh.add(root);
  skinnedMesh.updateMatrixWorld(true);skinnedMesh.bind(skeleton);skeleton.update();

  // Also include a static mesh node for instanced mesh rendering in riverfish.js
  const staticMesh = new THREE.Mesh(cleaned.clone(), material);
  staticMesh.name = 'Fish_Static';

  // Animations: swim & idle
  const times = [0, 0.25, 0.5, 0.75, 1.0];
  const q = new THREE.Quaternion();
  const rad = Math.PI / 180;

  // Swim animation tracks (undulating spine wave)
  const swimTracks = [
    // Head yaw
    new THREE.QuaternionKeyframeTrack('Joint_Head.quaternion', times, [
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 6 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -6 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray()
    ]),
    // Spine 1 yaw
    new THREE.QuaternionKeyframeTrack('Joint_Spine_1.quaternion', times, [
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -10 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 10 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray()
    ]),
    // Spine 2 yaw
    new THREE.QuaternionKeyframeTrack('Joint_Spine_2.quaternion', times, [
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -18 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 18 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray()
    ]),
    // Tail yaw
    new THREE.QuaternionKeyframeTrack('Joint_Tail.quaternion', times, [
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -28 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 28 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray()
    ])
  ];
  const swimClip = new THREE.AnimationClip('swim', 1.0, swimTracks);

  // Idle animation tracks (gentle drift)
  const idleTimes = [0, 1.0, 2.0];
  const idleTracks = [
    new THREE.QuaternionKeyframeTrack('Joint_Tail.quaternion', idleTimes, [
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 8 * rad).toArray(),
      ...q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).toArray()
    ])
  ];
  const idleClip = new THREE.AnimationClip('idle', 2.0, idleTracks);

  const group = new THREE.Group();
  group.name = 'Fish_Scene';
  group.add(skinnedMesh, staticMesh);
  group.animations = [swimClip, idleClip];

  return group;
}

// -------------------------------------------------------------
// 2. Shark Model (Höje å sällsynt haj)
// -------------------------------------------------------------
export function buildSharkModel() {
  const root=new THREE.Group();root.name='Shark_Scene';
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,side:THREE.DoubleSide});
  const add=(name,geometry)=>{const mesh=new THREE.Mesh(geometry,material);mesh.name=name;root.add(mesh);return mesh;};
  add('Shark_fin',finGeometry(SHARK.fin,true,false));
  add('Shark_body',caughtFishGeometry('haj',SHARK.look).clone().scale(SHARK.len,SHARK.len,SHARK.len));
  add('Shark_skeleton',skeletonGeometry(false));
  // Separate intact inspection variant. Runtime carcass intentionally lacks its
  // first dorsal: that is the existing held fin. Never overlay alternatives.
  const intact={...SHARK.look,dorsal:[.42,.6,.14,.04],spots:[]};
  add('Shark_whole',caughtFishGeometry('haj-hel',intact).clone().scale(SHARK.len,SHARK.len,SHARK.len));
  return root;
}

export function exportFishGLBs() {
  const exporter = new GLTFExporter();
  const fishScene = buildFishModel();
  const sharkScene = buildSharkModel();

  const exp = (scene) => new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (glb) => resolve(glb),
      (err) => reject(err),
      { binary: true, embedImages: false, animations: scene.animations || [] }
    );
  });

  return Promise.all([exp(fishScene), exp(sharkScene)]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Building fish and shark GLB models...');
  exportFishGLBs().then(([fishGlb, sharkGlb]) => {
    const outFish = path.resolve(process.cwd(), 'models/fish-generic.glb');
    const outShark = path.resolve(process.cwd(), 'models/shark.glb');
    fs.mkdirSync(path.dirname(outFish), { recursive: true });
    fs.writeFileSync(outFish, Buffer.from(fishGlb));
    fs.writeFileSync(outShark, Buffer.from(sharkGlb));
    console.log(`Exported models/fish-generic.glb: ${fishGlb.byteLength} bytes`);
    console.log(`Exported models/shark.glb: ${sharkGlb.byteLength} bytes`);
  }).catch((err) => {
    console.error('Failed to export fish GLBs:', err);
    process.exit(1);
  });
}
