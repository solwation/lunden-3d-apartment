import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';
import { LANDSKRONA } from '../src/config.js';
import {buildPingpingSurface} from '../src/pingpingsurface.js';
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
export const buildPingpingModel=buildPingpingSurface;

export function exportFiguresGLBs({santaOnly=false}={}) {
  if(!santaOnly&&typeof document==='undefined')throw new Error('Textured Pingping requires browser canvas: run tools/browsertest.sh node tools/buildpingpingglb.cjs BASE; use --santa-only here for Santa.');
  const exporter = new GLTFExporter();
  const santaScene = buildSantaModel();
  const pingpingScene = santaOnly ? null : buildPingpingModel();

  const exp = (scene) => new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (glb) => resolve(glb),
      (err) => reject(err),
      { binary: true, embedImages: false }
    );
  });

  return Promise.all([exp(santaScene), pingpingScene ? exp(pingpingScene) : Promise.resolve(null)]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Building figure GLBs...');
  exportFiguresGLBs({santaOnly:process.argv.includes('--santa-only')}).then(([santaGlb, pingpingGlb]) => {
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
