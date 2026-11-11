import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { squirrelRigGeometry } from '../src/squirrels.js';
import { SQUIRRELS } from '../src/config.js';
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

  const geometry=squirrelRigGeometry(SQUIRRELS.animals[0]);
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92});
  const skinnedMesh=new THREE.SkinnedMesh(geometry,material);skinnedMesh.name='Squirrel_Mesh';
  skinnedMesh.add(root);skinnedMesh.updateMatrixWorld(true);
  skinnedMesh.bind(new THREE.Skeleton(bones));skinnedMesh.skeleton.update();
  const axes={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0)};
  const rotate=(name,axis,times,angles)=>new THREE.QuaternionKeyframeTrack('Joint_'+name+'.quaternion',times,
    angles.flatMap(a=>new THREE.Quaternion().setFromAxisAngle(axes[axis],a).toArray()));
  const idleClip=new THREE.AnimationClip('idle',2,[rotate('Tail_0','y',[0,.5,1,1.5,2],[0,.06,0,-.06,0])]);
  const gait=(name,duration,strength)=>{
    const times=Array.from({length:9},(_,i)=>i*duration/8),tracks=[];
    for(const [limb,phase] of [['Arm_L',0],['Arm_R',.3],['Thigh_L',Math.PI],['Thigh_R',Math.PI+.3]])
      tracks.push(rotate(limb,'x',times,times.map(t=>Math.sin(t/duration*Math.PI*2+phase)*strength)));
    tracks.push(rotate('Tail_1','x',times,times.map(t=>Math.sin(t/duration*Math.PI*2)*.08)));
    return new THREE.AnimationClip(name,duration,tracks);
  };
  const runClip=gait('run',.4,.4),climbClip=gait('climb',.35,.5);
  const flickClip=new THREE.AnimationClip('flick',.6,[
    rotate('Tail_0','x',[0,.15,.3,.6],[0,-.12,.08,0]),
    rotate('Tail_3','x',[0,.15,.3,.6],[0,-.18,.10,0])]);
  // The consumer already sits the entire animal around its haunch. Keep that
  // pivot and the external carried nut; only lift paws and nod the connected head.
  const eatClip=new THREE.AnimationClip('eat',1.2,[
    rotate('Arm_L','x',[0,.3,.6,.9,1.2],[-1.7,-1.78,-1.7,-1.78,-1.7]),
    rotate('Arm_R','x',[0,.3,.6,.9,1.2],[-1.7,-1.78,-1.7,-1.78,-1.7]),
    rotate('Head','x',[0,.3,.6,.9,1.2],[.04,.08,.04,.08,.04])]);
  const animations=[idleClip,runClip,flickClip,climbClip,eatClip];

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
