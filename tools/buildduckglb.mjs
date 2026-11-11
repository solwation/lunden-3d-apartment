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

export function buildDuckModel() {
  // 1. Bones definition
  const root = new THREE.Bone();
  root.name = 'Joint_Root';
  root.position.set(0, 0, 0);

  const body = new THREE.Bone();
  body.name = 'Joint_Body';
  body.position.set(0, 0.29, 0);
  root.add(body);

  const neck = new THREE.Bone();
  neck.name = 'Joint_Neck';
  neck.position.set(0, 0.18, 0.23); // relative to body: (0, 0.47, 0.23)
  body.add(neck);

  const head = new THREE.Bone();
  head.name = 'Joint_Head';
  head.position.set(0, 0.14, 0.05); // relative to neck: (0, 0.61, 0.28)
  neck.add(head);

  const bill = new THREE.Bone();
  bill.name = 'Joint_Bill';
  bill.position.set(0, -0.03, 0.16); // relative to head: (0, 0.58, 0.44)
  head.add(bill);

  // Wings attached to body
  const wingL = new THREE.Bone();
  wingL.name = 'Joint_Wing_L';
  wingL.position.set(0.18, 0.06, 0.02);
  body.add(wingL);

  const wingTipL = new THREE.Bone();
  wingTipL.name = 'Joint_WingTip_L';
  wingTipL.position.set(0.04, -0.04, -0.20);
  wingL.add(wingTipL);

  const wingR = new THREE.Bone();
  wingR.name = 'Joint_Wing_R';
  wingR.position.set(-0.18, 0.06, 0.02);
  body.add(wingR);

  const wingTipR = new THREE.Bone();
  wingTipR.name = 'Joint_WingTip_R';
  wingTipR.position.set(-0.04, -0.04, -0.20);
  wingR.add(wingTipR);

  // Tail
  const tail = new THREE.Bone();
  tail.name = 'Joint_Tail';
  tail.position.set(0, 0.04, -0.36); // relative to body: (0, 0.33, -0.36)
  body.add(tail);

  // Legs and webbed feet
  const legL = new THREE.Bone();
  legL.name = 'Joint_Leg_L';
  legL.position.set(0.12, -0.15, 0.02);
  body.add(legL);

  const footL = new THREE.Bone();
  footL.name = 'Joint_Foot_L';
  footL.position.set(0, -0.105, 0.02); // relative to leg: y = 0.035, z = 0.04
  legL.add(footL);

  const legR = new THREE.Bone();
  legR.name = 'Joint_Leg_R';
  legR.position.set(-0.12, -0.15, 0.02);
  body.add(legR);

  const footR = new THREE.Bone();
  footR.name = 'Joint_Foot_R';
  footR.position.set(0, -0.105, 0.02);
  legR.add(footR);

  const bones = [
    root, body, neck, head, bill,
    wingL, wingTipL, wingR, wingTipR,
    tail, legL, footL, legR, footR
  ];

  const boneMap = new Map();
  bones.forEach((b, i) => boneMap.set(b.name, i));

  // 2. Build duck low-poly geometry with skinning & UVs
  const positions = [];
  const normals = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  function addQuad(p0, p1, p2, p3, uv0, uv1, uv2, uv3, bIdx, bWeight) {
    const baseIndex = positions.length / 3;

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

    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }

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

  // UV Atlas layout
  const UV_BODY   = [0.05, 0.05, 0.45, 0.45];
  const UV_BREAST = [0.55, 0.05, 0.95, 0.45];
  const UV_HEAD   = [0.05, 0.55, 0.45, 0.75];
  const UV_BILL   = [0.05, 0.80, 0.30, 0.95];
  const UV_FEET   = [0.35, 0.80, 0.50, 0.95];
  const UV_WING   = [0.55, 0.55, 0.95, 0.75];
  const UV_TAIL   = [0.55, 0.80, 0.95, 0.95];

  const idxBody    = boneMap.get('Joint_Body');
  const idxNeck    = boneMap.get('Joint_Neck');
  const idxHead    = boneMap.get('Joint_Head');
  const idxBill    = boneMap.get('Joint_Bill');
  const idxWingL   = boneMap.get('Joint_Wing_L');
  const idxWingTipL= boneMap.get('Joint_WingTip_L');
  const idxWingR   = boneMap.get('Joint_Wing_R');
  const idxWingTipR= boneMap.get('Joint_WingTip_R');
  const idxTail    = boneMap.get('Joint_Tail');
  const idxLegL    = boneMap.get('Joint_Leg_L');
  const idxFootL   = boneMap.get('Joint_Foot_L');
  const idxLegR    = boneMap.get('Joint_Leg_R');
  const idxFootR   = boneMap.get('Joint_Foot_R');

  // 2a. Torso & Belly
  // Main body center: [0, .29, 0], scale [.22, .21, .38]
  addBox(0, 0.29, 0, 0.44, 0.36, 0.60, UV_BODY, [idxBody, 0, 0, 0], [1.0, 0, 0, 0]);

  // Breast (chest curve): [0, 0.33, 0.16]
  addBox(0, 0.33, 0.16, 0.38, 0.28, 0.28, UV_BREAST, [idxBody, idxNeck, 0, 0], [0.8, 0.2, 0, 0]);

  // Back / Rump: [0, .37, -.12], scale [.19, .1, .25]
  addBox(0, 0.37, -0.12, 0.36, 0.20, 0.36, UV_BODY, [idxBody, idxTail, 0, 0], [0.8, 0.2, 0, 0]);

  // 2b. Neck: [0, .47, .23], scale [.115, .18, .12]
  addBox(0, 0.47, 0.23, 0.22, 0.28, 0.22, UV_HEAD, [idxNeck, idxHead, idxBody, 0], [0.6, 0.3, 0.1, 0]);

  // 2c. Head: [0, .61, .28], scale [.135, .13, .14]
  addBox(0, 0.61, 0.28, 0.24, 0.22, 0.26, UV_HEAD, [idxHead, idxNeck, 0, 0], [0.85, 0.15, 0, 0]);

  // 2d. Bill: [0, .58, .44], scale [.10, .035, .12] -> tip at z = 0.554
  addBox(0, 0.58, 0.44, 0.18, 0.065, 0.228, UV_BILL, [idxBill, idxHead, 0, 0], [0.95, 0.05, 0, 0]);

  // 2e. Wings (Left and Right)
  // Left Wing
  addBox(0.20, 0.34, -0.02, 0.04, 0.16, 0.38, UV_WING, [idxWingL, idxBody, 0, 0], [0.85, 0.15, 0, 0]);
  addBox(0.18, 0.33, -0.22, 0.03, 0.12, 0.20, UV_WING, [idxWingTipL, idxWingL, 0, 0], [0.9, 0.1, 0, 0]);

  // Right Wing
  addBox(-0.20, 0.34, -0.02, 0.04, 0.16, 0.38, UV_WING, [idxWingR, idxBody, 0, 0], [0.85, 0.15, 0, 0]);
  addBox(-0.18, 0.33, -0.22, 0.03, 0.12, 0.20, UV_WING, [idxWingTipR, idxWingR, 0, 0], [0.9, 0.1, 0, 0]);

  // 2f. Tail / Rump feather curl: [0, .33, -.36], scale [.1, .07, .17]
  addBox(0, 0.34, -0.34, 0.16, 0.10, 0.24, UV_TAIL, [idxTail, idxBody, 0, 0], [0.9, 0.1, 0, 0]);

  // 2g. Legs and Webbed Feet: [±.12, .035, .04], scale [.075, .03, .13]
  // Left leg & webbed foot
  addBox(0.12, 0.14, 0.02, 0.04, 0.14, 0.04, UV_FEET, [idxLegL, idxBody, 0, 0], [0.9, 0.1, 0, 0]);
  addBox(0.12, 0.035, 0.04, 0.14, 0.03, 0.18, UV_FEET, [idxFootL, 0, 0, 0], [1.0, 0, 0, 0]);

  // Right leg & webbed foot
  addBox(-0.12, 0.14, 0.02, 0.04, 0.14, 0.04, UV_FEET, [idxLegR, idxBody, 0, 0], [0.9, 0.1, 0, 0]);
  addBox(-0.12, 0.035, 0.04, 0.14, 0.03, 0.18, UV_FEET, [idxFootR, 0, 0, 0], [1.0, 0, 0, 0]);

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
  skinnedMesh.name = 'Duck_Mesh';
  skinnedMesh.add(root);
  skinnedMesh.bind(skeleton);

  // 4. Create Animation Clips
  // Clip 1: idle (subtle buoyancy bob and breathing)
  const idleTracks = [];
  idleTracks.push(new THREE.VectorKeyframeTrack(
    'Joint_Body.position',
    [0, 1.0, 2.0],
    [
      0, 0.29, 0,
      0, 0.298, 0,
      0, 0.29, 0
    ]
  ));
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Head.quaternion',
    [0, 0.9, 1.4, 2.0],
    [
      0, 0, 0, 1,
      0, 0.04, 0, 0.999,
      0, -0.03, 0, 0.9995,
      0, 0, 0, 1
    ]
  ));
  idleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Tail.quaternion',
    [0, 0.7, 1.3, 2.0],
    [
      0, 0, 0, 1,
      0.03, 0.06, 0, 0.998,
      -0.02, -0.05, 0, 0.998,
      0, 0, 0, 1
    ]
  ));
  const idleClip = new THREE.AnimationClip('idle', 2.0, idleTracks);

  // Clip 2: swim (webbed feet paddling, subtle water gliding)
  const swimTracks = [];
  swimTracks.push(new THREE.VectorKeyframeTrack(
    'Joint_Body.position',
    [0, 0.35, 0.7],
    [
      0, 0.29, 0,
      0, 0.295, 0.01,
      0, 0.29, 0
    ]
  ));
  // Feet paddle alternately
  swimTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Leg_L.quaternion',
    [0, 0.35, 0.7],
    [
      0.35, 0, 0, 0.936,
      -0.3, 0, 0, 0.953,
      0.35, 0, 0, 0.936
    ]
  ));
  swimTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Leg_R.quaternion',
    [0, 0.35, 0.7],
    [
      -0.3, 0, 0, 0.953,
      0.35, 0, 0, 0.936,
      -0.3, 0, 0, 0.953
    ]
  ));
  const swimClip = new THREE.AnimationClip('swim', 0.7, swimTracks);

  // Clip 3: waddle (shore walking with side-to-side roll)
  const waddleTracks = [];
  waddleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Body.quaternion',
    [0, 0.25, 0.5],
    [
      0, 0, 0.12, 0.992,
      0, 0, -0.12, 0.992,
      0, 0, 0.12, 0.992
    ]
  ));
  waddleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Leg_L.quaternion',
    [0, 0.25, 0.5],
    [
      0.4, 0, 0, 0.916,
      -0.35, 0, 0, 0.936,
      0.4, 0, 0, 0.916
    ]
  ));
  waddleTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Leg_R.quaternion',
    [0, 0.25, 0.5],
    [
      -0.35, 0, 0, 0.936,
      0.4, 0, 0, 0.916,
      -0.35, 0, 0, 0.936
    ]
  ));
  const waddleClip = new THREE.AnimationClip('waddle', 0.5, waddleTracks);

  // Clip 4: flap (energetic wing beating and body elevation)
  const flapTracks = [];
  flapTracks.push(new THREE.VectorKeyframeTrack(
    'Joint_Body.position',
    [0, 0.15, 0.3, 0.45, 0.6],
    [
      0, 0.29, 0,
      0, 0.35, 0,
      0, 0.32, 0,
      0, 0.35, 0,
      0, 0.29, 0
    ]
  ));
  flapTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Wing_L.quaternion',
    [0, 0.15, 0.3, 0.45, 0.6],
    [
      0, 0, 0, 1,
      0, 0, 0.707, 0.707,
      0, 0, -0.3, 0.953,
      0, 0, 0.707, 0.707,
      0, 0, 0, 1
    ]
  ));
  flapTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Wing_R.quaternion',
    [0, 0.15, 0.3, 0.45, 0.6],
    [
      0, 0, 0, 1,
      0, 0, -0.707, 0.707,
      0, 0, 0.3, 0.953,
      0, 0, -0.707, 0.707,
      0, 0, 0, 1
    ]
  ));
  const flapClip = new THREE.AnimationClip('flap', 0.6, flapTracks);

  // Clip 5: eat (dabbling / nodding head peck)
  const eatTracks = [];
  eatTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Neck.quaternion',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      0, 0, 0, 1,
      0.35, 0, 0, 0.936,
      0.05, 0, 0, 0.998,
      0.35, 0, 0, 0.936,
      0, 0, 0, 1
    ]
  ));
  eatTracks.push(new THREE.QuaternionKeyframeTrack(
    'Joint_Head.quaternion',
    [0, 0.25, 0.5, 0.75, 1.0],
    [
      0, 0, 0, 1,
      0.25, 0, 0, 0.968,
      0, 0, 0, 1,
      0.25, 0, 0, 0.968,
      0, 0, 0, 1
    ]
  ));
  const eatClip = new THREE.AnimationClip('eat', 1.0, eatTracks);

  const animations = [idleClip, swimClip, waddleClip, flapClip, eatClip];

  const scene = new THREE.Scene();
  scene.name = 'DuckScene';
  scene.add(skinnedMesh);

  return { scene, skinnedMesh, bones, animations };
}

export function exportDuckGLB() {
  return new Promise((resolve, reject) => {
    const { scene, animations } = buildDuckModel();
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
  console.log('Building duck GLB...');
  exportDuckGLB().then((glb) => {
    const outPath = path.resolve(process.cwd(), 'models/duck-rigged.glb');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(glb));
    console.log(`Successfully exported rigged duck GLB to ${outPath} (${glb.byteLength} bytes)`);
  }).catch((err) => {
    console.error('Failed to export duck GLB:', err);
    process.exit(1);
  });
}
