import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';
import { PINGPING as P, LANDSKRONA } from '../src/config.js';
import { santaBody, santaArm, santaLegGeometry } from '../src/santasurface.js';

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
export function buildSantaModel() {
  const group = new THREE.Group(); group.name = 'Santa_Scene';
  const mat = new THREE.MeshStandardMaterial({ name: 'Mat_Santa', vertexColors: true, roughness: .88 });
  const body = santaBody(mat); body.name = 'Santa_body';
  const left = santaArm(mat, false); left.name = 'Santa_arm_left';
  const right = santaArm(mat, true); right.name = 'Santa_arm_right';
  const spot = { y: LANDSKRONA.seatHeight, z: -.08 };
  const sitting = new THREE.Mesh(santaLegGeometry(spot, false), mat); sitting.name = 'Santa_legs_sitting';
  const sleeping = new THREE.Mesh(santaLegGeometry(spot, true), mat); sleeping.name = 'Santa_legs_sleeping';
  const glass = new THREE.Group(); glass.name = 'Santa_glass';
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(.048,.043,.095,12,1,true),
    new THREE.MeshStandardMaterial({ name: 'Mat_Glass', color: 0xe3e8e5, transparent: true, opacity: .35, roughness: .18 }));
  const glogg = new THREE.Mesh(new THREE.CylinderGeometry(.042,.038,.058,12).translate(0,-.013,0),
    new THREE.MeshStandardMaterial({ name: 'Mat_Glogg', color: 0x631d27, roughness: .28 }));
  glass.add(shell,glogg); group.add(body,left,right,sitting,sleeping,glass); return group;
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
  console.log('Building figure GLBs...');
  exportFiguresGLBs().then(([santaGlb, pingpingGlb]) => {
    const outSanta = path.resolve(process.cwd(), 'models/santa.glb');
    const outPingping = path.resolve(process.cwd(), 'models/pingping.glb');
    fs.mkdirSync(path.dirname(outSanta), { recursive: true });
    fs.writeFileSync(outSanta, Buffer.from(santaGlb));
    if (!process.argv.includes('--santa-only')) fs.writeFileSync(outPingping, Buffer.from(pingpingGlb));
    console.log(`Exported models/santa.glb: ${santaGlb.byteLength} bytes`);
    if (!process.argv.includes('--santa-only')) console.log(`Exported models/pingping.glb: ${pingpingGlb.byteLength} bytes`);
  }).catch((err) => {
    console.error('Failed to export figures GLBs:', err);
    process.exit(1);
  });
}
