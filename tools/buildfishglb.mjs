import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
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

if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ getContext: () => ({}) })
  };
}

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

  // Fish geometry: 1m long along z (-0.5 to +0.5), 1m wide, 1m high (scaled per species in engine)
  const bodyGeo = new THREE.SphereGeometry(0.5, 12, 8).scale(0.35, 0.55, 0.85).translate(0, 0, 0.05);

  // Dorsal fin (ryggfena)
  const dorsalGeo = new THREE.BufferGeometry();
  dorsalGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.28, 0.15,
    0, 0.28, -0.12,
    0, 0.52, -0.05,
    0, 0.28, 0.15,
    0, 0.52, -0.05,
    0, 0.28, -0.12
  ], 3));

  // Pectoral fins (bröstfenor)
  const pectL = new THREE.BufferGeometry();
  pectL.setAttribute('position', new THREE.Float32BufferAttribute([
    0.12, -0.05, 0.20,
    0.28, -0.12, 0.05,
    0.10, -0.15, 0.08
  ], 3));
  const pectR = new THREE.BufferGeometry();
  pectR.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.12, -0.05, 0.20,
    -0.10, -0.15, 0.08,
    -0.28, -0.12, 0.05
  ], 3));

  // Tail fin (stjärtfena)
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.02, -0.28,
    0, 0.38, -0.52,
    0, 0.06, -0.44,
    0, -0.02, -0.28,
    0, -0.06, -0.44,
    0, -0.38, -0.52,
    0, 0.02, -0.28,
    0, 0.06, -0.44,
    0, -0.06, -0.44
  ], 3));

  for (const g of [dorsalGeo, pectL, pectR, tailGeo]) g.computeVertexNormals();
  const nonIndexedBody = bodyGeo.toNonIndexed();
  nonIndexedBody.deleteAttribute('uv');
  const rawMerged = mergeGeometries([nonIndexedBody, dorsalGeo, pectL, pectR, tailGeo]);
  const cleaned = mergeVertices(rawMerged);

  // Vertex colors: darker back, lighter belly
  const pos = cleaned.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const skinIndices = new Float32Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // Color gradient
    const tone = y > 0.08 ? 0.60 : y < -0.12 ? 1.25 : 0.95;
    colors.set([tone, tone, tone], i * 3);

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

  cleaned.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
  skinnedMesh.bind(skeleton);

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
  const root = new THREE.Group();
  root.name = 'Shark_Scene';

  const finHeight = 0.58;
  const H = [0, 0.3, 0.6, 0.85, 1];
  const L = [0.34, 0.22, 0.08, -0.05, -0.26];
  const T = [-0.2, -0.12, -0.1, -0.15, -0.26];
  const W = [0.07, 0.055, 0.035, 0.016, 0];

  const pos = [], cols = [];
  const skin = new THREE.Color(0x6b7782);
  const dark = skin.clone().multiplyScalar(0.75);
  const red = new THREE.Color(0x941c1c);

  const lead = (i) => [0, H[i] * finHeight, L[i] * finHeight];
  const trail = (i) => [0, H[i] * finHeight, T[i] * finHeight];
  const mid = (i, sd) => [sd * W[i] * finHeight, H[i] * finHeight, ((L[i] + T[i]) / 2) * finHeight];
  const tri = (a, b, c, col) => {
    pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) cols.push(col.r, col.g, col.b);
  };

  for (const sd of [1, -1]) {
    for (let i = 0; i < H.length - 1; i++) {
      const c = i === 0 ? dark : skin;
      const f = (a, b, cc) => (sd > 0 ? tri(a, b, cc, c) : tri(a, cc, b, c));
      f(lead(i), mid(i, sd), lead(i + 1));
      f(mid(i, sd), mid(i + 1, sd), lead(i + 1));
      f(mid(i, sd), trail(i), mid(i + 1, sd));
      f(trail(i), trail(i + 1), mid(i + 1, sd));
    }
  }

  // Base cap
  tri(lead(0), mid(0, -1), mid(0, 1), red);
  tri(trail(0), mid(0, 1), mid(0, -1), red);

  const finGeo = new THREE.BufferGeometry();
  finGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  finGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  finGeo.computeVertexNormals();

  const matFin = new THREE.MeshStandardMaterial({
    name: 'Mat_SharkFin',
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.1
  });
  const meshFin = new THREE.Mesh(finGeo, matFin);
  meshFin.name = 'Shark_fin';
  meshFin.castShadow = true;

  const cleanGeo = (g) => {
    const res = g.index ? g.toNonIndexed() : g;
    res.deleteAttribute('uv');
    if (!res.attributes.normal) res.computeVertexNormals();
    return res;
  };

  // Shark body
  const bodyGeo = new THREE.SphereGeometry(0.5, 14, 10).scale(0.38 * 3.2, 0.42 * 3.2, 1.6 * 3.2);
  const tailLower = new THREE.ConeGeometry(0.2, 0.8, 6).rotateZ(Math.PI * 0.7).translate(0, -0.3, -2.4);
  const tailUpper = new THREE.ConeGeometry(0.25, 1.2, 6).rotateZ(-Math.PI * 0.7).translate(0, 0.4, -2.5);
  const sharkBodyMerged = mergeVertices(mergeGeometries([cleanGeo(bodyGeo), cleanGeo(tailLower), cleanGeo(tailUpper)]));

  const matBody = new THREE.MeshStandardMaterial({
    name: 'Mat_SharkBody',
    color: 0x5a6570,
    roughness: 0.45,
    metalness: 0.1
  });
  const meshBody = new THREE.Mesh(sharkBodyMerged, matBody);
  meshBody.name = 'Shark_body';
  meshBody.castShadow = true;

  // Shark skeleton
  const boneMat = new THREE.MeshStandardMaterial({ name: 'Mat_Bone', color: 0xe8e2d2, roughness: 0.8 });
  const skull = new THREE.SphereGeometry(0.5, 8, 5).scale(0.32, 0.16, 0.5).translate(0, 0.09, 1.25);
  const jawUpper = new THREE.TorusGeometry(0.17, 0.024, 4, 8, Math.PI).rotateX(Math.PI / 2).translate(0, 0.07, 1.5);
  const jawLower = new THREE.TorusGeometry(0.15, 0.024, 4, 8, Math.PI).rotateX(Math.PI / 2).translate(0, 0.025, 1.46);
  const spineGeo = new THREE.CylinderGeometry(0.04, 0.02, 2.6, 6).rotateX(Math.PI / 2).translate(0, 0.08, -0.1);
  const skeletonMerged = mergeVertices(mergeGeometries([cleanGeo(skull), cleanGeo(jawUpper), cleanGeo(jawLower), cleanGeo(spineGeo)]));
  const meshSkeleton = new THREE.Mesh(skeletonMerged, boneMat);
  meshSkeleton.name = 'Shark_skeleton';
  meshSkeleton.castShadow = true;

  root.add(meshFin, meshBody, meshSkeleton);
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
