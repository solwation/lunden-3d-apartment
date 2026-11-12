import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ponyGeometry } from '../src/paddock.js';
import fs from 'node:fs';
import path from 'node:path';

class NodeFileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); }); }
}
globalThis.FileReader = NodeFileReader;

// #1906: bake the established photo-based loft, not disconnected primitive parts.
// Coordinates and proportions are the existing PADDOCK model assumptions from #1293.
export function buildPonyModel() {
  const bones = [], boneMap = new Map();
  function bone(name, parent, world) {
    const b = new THREE.Bone(); b.name = name;
    b.position.fromArray(world);
    if (parent) { b.position.sub(parent.userData.rest); parent.add(b); }
    b.userData.rest = new THREE.Vector3(...world);
    boneMap.set(name, bones.length); bones.push(b); return b;
  }
  const root = bone('Joint_Root', null, [0, 0, 0]);
  const body = bone('Joint_Body', root, [0, 1.05, -0.05]);
  const neck = bone('Joint_Neck', body, [0, 1.12, 0.55]);
  const head = bone('Joint_Head', neck, [0, 1.689, 0.992]);
  bone('Joint_Snout', head, [0, 1.30, 1.30]);
  bone('Joint_Ear_L', head, [0.055, 1.75, 1.05]);
  bone('Joint_Ear_R', head, [-0.055, 1.75, 1.05]);
  const tailBase = bone('Joint_Tail_Base', body, [0, 1.20, -0.72]);
  const tailMid = bone('Joint_Tail_Mid', tailBase, [0, 0.88, -0.90]);
  bone('Joint_Tail_Tip', tailMid, [0, 0.48, -0.90]);
  for (const [label,x,z,hipY,kneeY] of [['Front_L',0.15,0.52,0.88,0.43],['Front_R',-0.15,0.52,0.88,0.43],['Back_L',0.16,-0.62,0.96,0.43],['Back_R',-0.16,-0.62,0.96,0.43]]) {
    const upper = bone('Joint_Leg_'+label,body,[x,hipY,z]);
    const lower = bone('Joint_Knee_'+label,upper,[x,kneeY,z]);
    bone('Joint_Hoof_'+label,lower,[x,0.06,z]);
  }
  const geometry = ponyGeometry();
  const position = geometry.attributes.position, part = geometry.attributes.aPart, code = geometry.attributes.color;
  const skinIndices = new Uint16Array(position.count*4), skinWeights = new Float32Array(position.count*4), uvs = new Float32Array(position.count*2), colors = new Float32Array(position.count*3);
  const clamp = v => Math.min(1, Math.max(0,v));
  function weights(i, entries) {
    let slot=0; for (const [name,w] of entries) { if(w>0) { skinIndices[i*4+slot]=boneMap.get(name);skinWeights[i*4+slot]=w;slot++; } }
  }
  for (let i=0;i<position.count;i++) {
    const id=part.getX(i),x=position.getX(i),y=position.getY(i),z=position.getZ(i),tone=code.getX(i);
    const region=tone===0?1:tone===2?2:tone===3?3:tone<0.7?4:0;
    uvs.set([(region+0.5)/5,0.5],i*2);colors.set([1,1,1],i*3);
    if(id===0) weights(i,[['Joint_Body',1]]);
    else if(id===1) { const w=clamp((y-1.13)/0.22);weights(i,[['Joint_Neck',w],['Joint_Body',1-w]]); }
    else if(id===2) weights(i,[['Joint_Head',1]]);
    else if(id===8) weights(i,[[x>0?'Joint_Ear_L':'Joint_Ear_R',1]]);
    else if(id===7) { const t=clamp((1.12-y)/0.65)*2;const names=['Joint_Tail_Base','Joint_Tail_Mid','Joint_Tail_Tip'];const a=Math.min(1,Math.floor(t));weights(i,[[names[a],1-(t-a)],[names[a+1],t-a]]); }
    else {
      const label=(id<=4?'Front_':'Back_')+(x>0?'L':'R');
      if(y>0.4) { const w=clamp((y-0.4)/0.22);weights(i,[['Joint_Leg_'+label,w],['Joint_Knee_'+label,1-w]]); }
      else { const w=clamp((y-0.06)/0.1);weights(i,[['Joint_Knee_'+label,w],['Joint_Hoof_'+label,1-w]]); }
    }
  }
  for(const key of ['aPart','aPivot'])geometry.deleteAttribute(key);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  geometry.setAttribute('skinIndex',new THREE.BufferAttribute(skinIndices,4));geometry.setAttribute('skinWeight',new THREE.BufferAttribute(skinWeights,4));
  const welded=mergeVertices(geometry);welded.computeBoundingBox();welded.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:0.92,metalness:0});
  const skinnedMesh=new THREE.SkinnedMesh(welded,material);skinnedMesh.name='PonyMesh';
  // The complete bone hierarchy must have world matrices BEFORE inverse bind matrices.
  skinnedMesh.add(root);skinnedMesh.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(bones);skinnedMesh.bind(skeleton);skeleton.update();
  // Local rotations leave bind translations intact. A four-beat gait uses modest
  // swings; grazing bends the neck and counter-rotates the already downsloping head.
  const axis = {x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
  const rotate=(name,dir,times,angles)=>new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,angles.flatMap(a=>new THREE.Quaternion().setFromAxisAngle(axis[dir],a).toArray()));
  const idleClip=new THREE.AnimationClip('idle',2,[
    rotate('Joint_Tail_Base','y',[0,.5,1,1.5,2],[0,.18,0,-.18,0]),
    rotate('Joint_Ear_L','x',[0,.2,.4,2],[0,.12,0,0])
  ]);
  const times=Array.from({length:9},(_,i)=>i*1.2/8),walkTracks=[];
  for(const [label,phase]of [['Front_L',0],['Back_R',Math.PI/2],['Front_R',Math.PI],['Back_L',3*Math.PI/2]]){
    const swings=times.map(t=>Math.sin(t/1.2*Math.PI*2+phase));
    walkTracks.push(rotate('Joint_Leg_'+label,'x',times,swings.map(v=>v*.16)));
    walkTracks.push(rotate('Joint_Knee_'+label,'x',times,swings.map(v=>Math.max(0,-v)*.16)));
    walkTracks.push(rotate('Joint_Hoof_'+label,'x',times,swings.map(v=>-v*.10)));
  }
  walkTracks.push(rotate('Joint_Neck','x',[0,.3,.6,.9,1.2],[.025,-.015,.025,-.015,.025]));
  const walkClip=new THREE.AnimationClip('walk',1.2,walkTracks);
  const grazeClip=new THREE.AnimationClip('graze',2.5,[
    rotate('Joint_Neck','x',[0,.6,1.2,1.8,2.5],[1.55,1.58,1.55,1.58,1.55]),
    rotate('Joint_Head','x',[0,.6,1.2,1.8,2.5],[-.85,-.87,-.85,-.87,-.85])
  ]);
  const watchClip=new THREE.AnimationClip('watch',1.5,[
    rotate('Joint_Neck','x',[0,1.5],[-.06,-.06]),
    rotate('Joint_Head','y',[0,.5,1,1.5],[0,.14,-.14,0])
  ]);
  const petClip=new THREE.AnimationClip('pet',1,[
    rotate('Joint_Neck','x',[0,.3,.7,1],[.25,.20,.28,.25]),
    rotate('Joint_Head','y',[0,.3,.7,1],[.10,.16,.08,.10]),
    rotate('Joint_Ear_R','x',[0,.3,.7,1],[0,-.15,0,0])
  ]);
  const animations=[idleClip,walkClip,grazeClip,watchClip,petClip];

  const scene = new THREE.Scene();
  scene.name = 'PonyScene';
  scene.add(skinnedMesh);

  return { scene, skinnedMesh, bones, animations };
}

export function exportPonyGLB() {
  return new Promise((resolve, reject) => {
    const { scene, animations } = buildPonyModel();
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
  console.log('Building pony GLB...');
  exportPonyGLB().then((glb) => {
    const outPath = path.resolve(process.cwd(), 'models/pony-rigged.glb');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(glb));
    console.log(`Successfully exported rigged pony GLB to ${outPath} (${glb.byteLength} bytes)`);
  }).catch((err) => {
    console.error('Failed to export pony GLB:', err);
    process.exit(1);
  });
}
