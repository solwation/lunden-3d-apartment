import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';
import { SANTA as S } from '../src/santaconfig.js';
import { PINGPING as P, LANDSKRONA } from '../src/config.js';

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

// ---------------------------------------------------------------------
// 1. Santa Model (Tomten i soffan)
// ---------------------------------------------------------------------
const SC = { red: 0xa51d28, white: 0xf4efe5, skin: 0xe6af89, black: 0x26201c, gold: 0xd7ad45 };

function part(geometry, color, at, scale = [1, 1, 1], rot = [0, 0, 0]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  const rgb = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rgb.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

const ball = (color, at, scale, seg = [12, 8]) => part(new THREE.SphereGeometry(1, seg[0], seg[1]), color, at, scale);
const box = (color, at, scale) => part(new THREE.BoxGeometry(1, 1, 1), color, at, scale);

function hatGeometry() {
  const H = S.hat;
  const geo = new THREE.ConeGeometry(H.radius, H.height, 12, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) / H.height + 0.5) ** 3;
    p.setXYZ(i, p.getX(i) + H.bend * t, p.getY(i) - H.drop * t, p.getZ(i));
  }
  geo.computeVertexNormals();
  return geo;
}

function cheek(side) {
  const g = ball(S.blush.base, [side * 0.092, 0.785, 0.132], [0.043, 0.033, 0.024], [8, 6]);
  g.userData.blush = true;
  return g;
}

function limb(a, b, radius, color) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, delta.length() - radius * 2), 3, 6);
  const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  return part(geo, color, from.add(to).multiplyScalar(0.5).toArray(), [1, 1, 1], rot.toArray().slice(0, 3));
}

function buildSantaLegs(local, sleeping) {
  const L = S.legs, rootY = local.y + 0.04;
  const kneeZ = sleeping ? 0.22 : LANDSKRONA.depth / 2 - local.z + L.radius + L.clearance;
  const ankleY = sleeping ? -0.18 : L.bootY + L.bootH - rootY;
  const parts = [];
  for (const side of [-1, 1]) {
    const x = side * L.spread, knee = [x, L.kneeY, kneeZ];
    parts.push(limb([x, L.thighY, 0.04], knee, L.radius, SC.red));
    parts.push(limb(knee, [x, ankleY, kneeZ], L.radius * 0.88, SC.red));
    parts.push(ball(SC.black, [x, sleeping ? -0.25 : L.bootY - rootY, kneeZ + 0.08], [0.105, L.bootH, 0.17], [10, 6]));
    parts.push(box(0x171615, [x, sleeping ? -0.31 : 0.015 - rootY, kneeZ + 0.08], [0.19, 0.03, 0.29]));
    parts.push(ball(SC.white, [x, ankleY, kneeZ], [0.085, 0.027, 0.085], [10, 6]));
  }
  return mergeGeometries(parts);
}

function buildSantaArm(right) {
  const parts = [
    ball(SC.red, [0, -0.15, 0.03], [0.105, 0.21, 0.105], [10, 6]),
    ball(SC.white, [0, -0.31, 0.06], [0.11, 0.045, 0.11], [10, 6]),
    ball(SC.skin, [0, -0.37, 0.07], [0.075, 0.085, 0.075], [8, 6])
  ];
  return mergeGeometries(parts);
}

export function buildSantaModel() {
  const group = new THREE.Group();
  group.name = 'Santa_Scene';

  const matStandard = new THREE.MeshStandardMaterial({
    name: 'Mat_Santa',
    vertexColors: true,
    roughness: 0.88
  });

  // 1. Santa body
  const parts = [
    ball(SC.red, [0, 0.3, 0.03], S.size.belly, [14, 8]),
    ball(SC.white, [0, 0.025, 0.035], [0.29, 0.045, 0.25], [12, 6]), // fur coat hem
    box(SC.black, [0, 0.17, 0.06], [0.61, 0.065, 0.49]),
    box(SC.gold, [0, 0.17, 0.313], [0.105, 0.09, 0.025]),
    box(SC.black, [0, 0.17, 0.328], [0.065, 0.055, 0.01]),
    box(SC.white, [0, 0.35, 0.3], [0.048, 0.28, 0.03]),
    ball(SC.skin, [0, 0.79, 0.02], [S.size.head, 0.18, 0.15], [12, 8]),
    ball(SC.white, [0, 0.57, 0.14], S.size.beard, [12, 8]),
    ball(SC.skin, [0, 0.8, 0.18], [0.047, 0.04, 0.045], [8, 6]),
    ball(SC.white, [-0.055, 0.747, 0.176], [0.065, 0.025, 0.04], [8, 6]),
    ball(SC.white, [0.055, 0.747, 0.176], [0.065, 0.025, 0.04], [8, 6]),
    part(hatGeometry(), SC.red, [0, 1.04, 0.01]),
    ball(SC.white, [0, 0.91, 0.02], [0.17, 0.045, 0.16], [12, 6])
  ];

  const cheeks = [];
  let offset = 0;
  for (const p of parts) offset += p.getAttribute('position').count;

  for (const side of [-1, 1]) {
    parts.push(ball(SC.white, [side * 0.06, 0.865, 0.18], [0.045, 0.013, 0.018], [8, 6]));
    offset += parts[parts.length - 1].getAttribute('position').count;

    parts.push(ball(SC.skin, [side * 0.147, 0.785, 0.02], [0.035, 0.06, 0.035], [8, 6])); // ears
    offset += parts[parts.length - 1].getAttribute('position').count;

    const chk = cheek(side);
    const count = chk.getAttribute('position').count;
    cheeks.push({ start: offset, count });
    parts.push(chk);
    offset += count;

    parts.push(ball(SC.white, [side * 0.055, 0.83, 0.178], [0.023, 0.019, 0.009], [8, 6]));
    offset += parts[parts.length - 1].getAttribute('position').count;

    parts.push(ball(0x547687, [side * 0.055, 0.83, 0.187], [0.011, 0.013, 0.006], [6, 4]));
    offset += parts[parts.length - 1].getAttribute('position').count;

    parts.push(ball(SC.black, [side * 0.055, 0.83, 0.193], [0.005, 0.008, 0.004], [6, 4]));
    offset += parts[parts.length - 1].getAttribute('position').count;

    for (let j = 0; j < 3; j++) {
      parts.push(ball(j % 2 ? 0xe5e1d8 : SC.white, [side * (0.04 + j * 0.042), 0.51 + j * 0.035, 0.245 - j * 0.012], [0.046, 0.125 - j * 0.02, 0.035], [8, 6]));
      offset += parts[parts.length - 1].getAttribute('position').count;
    }
  }

  parts.push(ball(SC.white, [S.hat.bend, 1.04 + S.hat.height / 2 - S.hat.drop, 0.01], [0.06, 0.06, 0.06], [8, 6]));

  const bodyGeo = mergeGeometries(parts);
  const meshBody = new THREE.Mesh(bodyGeo, matStandard);
  meshBody.name = 'Santa_body';
  meshBody.userData.cheeks = cheeks;
  meshBody.castShadow = true;
  meshBody.receiveShadow = true;

  // 2. Arms
  const meshArmL = new THREE.Mesh(buildSantaArm(false), matStandard);
  meshArmL.name = 'Santa_arm_left';
  meshArmL.castShadow = true;

  const meshArmR = new THREE.Mesh(buildSantaArm(true), matStandard);
  meshArmR.name = 'Santa_arm_right';
  meshArmR.castShadow = true;

  // 3. Legs (sitting & sleeping)
  const sofaSpot = { x: 0, y: LANDSKRONA.seatHeight, z: -0.08 };
  const meshLegsSit = new THREE.Mesh(buildSantaLegs(sofaSpot, false), matStandard);
  meshLegsSit.name = 'Santa_legs_sitting';
  meshLegsSit.castShadow = true;
  meshLegsSit.receiveShadow = true;

  const meshLegsSleep = new THREE.Mesh(buildSantaLegs(sofaSpot, true), matStandard);
  meshLegsSleep.name = 'Santa_legs_sleeping';
  meshLegsSleep.castShadow = true;
  meshLegsSleep.receiveShadow = true;

  // 4. Glass
  const glassShell = new THREE.CylinderGeometry(0.048, 0.043, 0.095, 12, 1, true);
  const gloggLiquid = new THREE.CylinderGeometry(0.042, 0.038, 0.058, 12).translate(0, -0.013, 0);
  const meshGlass = new THREE.Group();
  meshGlass.name = 'Santa_glass';
  const matGlass = new THREE.MeshStandardMaterial({ name: 'Mat_Glass', color: 0xe3e8e5, transparent: true, opacity: 0.35, roughness: 0.18 });
  const matGlogg = new THREE.MeshStandardMaterial({ name: 'Mat_Glogg', color: 0x631d27, roughness: 0.28 });
  meshGlass.add(new THREE.Mesh(glassShell, matGlass));
  meshGlass.add(new THREE.Mesh(gloggLiquid, matGlogg));

  group.add(meshBody, meshArmL, meshArmR, meshLegsSit, meshLegsSleep, meshGlass);
  return group;
}

// ---------------------------------------------------------------------
// 2. Pingping Model (Pingvinkudden i sängen)
// ---------------------------------------------------------------------
function shapeSuperellipsoid(geo, grow = 1) {
  const a = geo.attributes.position, v = new THREE.Vector3(), n = 2.6;
  for (let i = 0; i < a.count; i++) {
    v.fromBufferAttribute(a, i);
    const k = (Math.abs(v.x) ** n + Math.abs(v.y) ** n + Math.abs(v.z) ** n) ** (1 / n);
    v.divideScalar(k || 1);
    a.setXYZ(i, v.x * P.w / 2 * grow, P.h / 2 + v.y * P.h / 2 * grow, v.z * P.d / 2 * grow);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildPingpingModel() {
  const group = new THREE.Group();
  group.name = 'Pingping_Scene';

  const matNavy = new THREE.MeshStandardMaterial({
    name: 'Mat_PingpingNavy',
    color: P.navy,
    roughness: 0.95
  });

  const matFeet = new THREE.MeshStandardMaterial({
    name: 'Mat_PingpingFeet',
    color: P.feet,
    roughness: 0.95
  });

  // Body
  const bodyGeo = shapeSuperellipsoid(new THREE.SphereGeometry(1, 40, 24));
  const meshBody = new THREE.Mesh(bodyGeo, matNavy);
  meshBody.name = 'Pingping_body';
  meshBody.castShadow = true;
  meshBody.receiveShadow = true;

  // Face shell with UVs
  const frontGeo = shapeSuperellipsoid(new THREE.SphereGeometry(1, 36, 24, Math.PI / 2 - 1.25, 2.5), 1.008);
  const a = frontGeo.attributes.position;
  const uv = new Float32Array(a.count * 2);
  for (let i = 0; i < a.count; i++) {
    uv[i * 2] = a.getX(i) / P.w + 0.5;
    uv[i * 2 + 1] = a.getY(i) / P.h;
  }
  frontGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const matFacePlaceholder = new THREE.MeshStandardMaterial({
    name: 'Mat_PingpingFace',
    color: 0xffffff,
    roughness: 1.0,
    alphaTest: 0.5
  });
  const meshFace = new THREE.Mesh(frontGeo, matFacePlaceholder);
  meshFace.name = 'Pingping_face';
  meshFace.castShadow = true;
  meshFace.receiveShadow = true;

  // Flippers
  const flip = [-1, 1].map((s) => {
    const g = new THREE.SphereGeometry(1, 12, 8).scale(0.035, 0.08, 0.028).rotateZ(s * 0.65)
      .translate(s * (P.w / 2 - 0.004), P.h * 0.47, 0.01);
    return g.toNonIndexed();
  });
  const meshFlippers = new THREE.Mesh(mergeGeometries(flip), matNavy);
  meshFlippers.name = 'Pingping_flippers';
  meshFlippers.castShadow = true;

  // Feet
  const ft = [-1, 1].map((s) => {
    const g = new THREE.SphereGeometry(1, 12, 8).scale(0.045, 0.024, 0.045)
      .translate(s * 0.075, 0.022, P.d / 2 - 0.035);
    return g.toNonIndexed();
  });
  const meshFeet = new THREE.Mesh(mergeGeometries(ft), matFeet);
  meshFeet.name = 'Pingping_feet';
  meshFeet.castShadow = true;

  group.add(meshBody, meshFace, meshFlippers, meshFeet);
  return group;
}

export function exportFiguresGLBs() {
  const exporter = new GLTFExporter();
  const santaScene = buildSantaModel();
  const pingpingScene = buildPingpingModel();

  const exp = (scene) => new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (glb) => resolve(glb),
      (err) => reject(err),
      { binary: true, embedImages: false }
    );
  });

  return Promise.all([exp(santaScene), exp(pingpingScene)]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Building Santa and Pingping GLB models...');
  exportFiguresGLBs().then(([santaGlb, pingpingGlb]) => {
    const outSanta = path.resolve(process.cwd(), 'models/santa.glb');
    const outPingping = path.resolve(process.cwd(), 'models/pingping.glb');
    fs.mkdirSync(path.dirname(outSanta), { recursive: true });
    fs.writeFileSync(outSanta, Buffer.from(santaGlb));
    fs.writeFileSync(outPingping, Buffer.from(pingpingGlb));
    console.log(`Exported models/santa.glb: ${santaGlb.byteLength} bytes`);
    console.log(`Exported models/pingping.glb: ${pingpingGlb.byteLength} bytes`);
  }).catch((err) => {
    console.error('Failed to export figures GLBs:', err);
    process.exit(1);
  });
}
