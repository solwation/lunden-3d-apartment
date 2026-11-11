import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {duckRigGeometry} from '../src/duckmodel.js';
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

  const geo=duckRigGeometry(false),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  const skinnedMesh=new THREE.SkinnedMesh(geo,material);skinnedMesh.name='Duck_Mesh';
  skinnedMesh.add(root);skinnedMesh.updateMatrixWorld(true);skinnedMesh.bind(new THREE.Skeleton(bones));skinnedMesh.skeleton.update();
  const axes={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
  const rotate=(name,axis,times,angles)=>new THREE.QuaternionKeyframeTrack('Joint_'+name+'.quaternion',times,
    angles.flatMap(a=>new THREE.Quaternion().setFromAxisAngle(axes[axis],a).toArray()));
  // Idle keeps the bill fixed: DuckKiss uses its exact neutral contact point.
  const idleClip=new THREE.AnimationClip('idle',2,[rotate('Tail','y',[0,1,2],[0,.05,0])]);
  const gait=(name,duration,angle)=>new THREE.AnimationClip(name,duration,[
    rotate('Leg_L','x',[0,duration/4,duration/2,duration*.75,duration],[0,angle,0,-angle,0]),
    rotate('Leg_R','x',[0,duration/4,duration/2,duration*.75,duration],[0,-angle,0,angle,0])]);
  const swimClip=gait('swim',1.2,.24),waddleClip=gait('waddle',.7,.3);
  const flapClip=new THREE.AnimationClip('flap',.8,[
    rotate('Wing_L','z',[0,.2,.4,.6,.8],[0,-1.3,.1,-1.3,0]),
    rotate('Wing_R','z',[0,.2,.4,.6,.8],[0,1.3,-.1,1.3,0])]);
  const eatClip=new THREE.AnimationClip('eat',1,[rotate('Neck','x',[0,.25,.5,.75,1],[.05,.15,.05,.15,.05])]);
  const animations=[idleClip,swimClip,waddleClip,flapClip,eatClip];

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
