import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PLAYROOM as R} from './config.js';
import {BilliardPhysics} from './billiardphysics.js';
// #1328: local children's table. Three visible batches (table, instanced balls, moving cue); no lights/textures/services.
const paint=(g,hex)=>{const c=new T.Color(hex),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3)a.set([c.r,c.g,c.b],i);g.setAttribute('color',new T.BufferAttribute(a,3));return g;};
const merge=list=>{const flat=list.map(q=>q.index?q.toNonIndexed():q),g=mergeGeometries(flat);new Set([...list,...flat]).forEach(q=>q.dispose());return g;};
export class Billiards {
  constructor() {
    const c=this.c=R.billiards,L=c.length,W=c.width,H=c.height,A=c.rail;this.physics=new BilliardPhysics(c);
    this.object=new T.Group();this.object.name='playroom-billiards';this.object.position.set(R.x+c.x,0,R.z+c.z);
    const parts=[],box=(w,h,d,x,y,z,col)=>parts.push(paint(new T.BoxGeometry(w,h,d).translate(x,y,z),col));
    box(L+2*A,.12,W+2*A,0,H-.08,0,0x593c29);box(L,.025,W,0,H-.0125,0,0x226b55);
    for(const x of[-L*.35,L*.35])for(const z of[-W*.32,W*.32])box(c.leg,H-.14,c.leg,x,(H-.14)/2,z,0x302820);
    for(const z of[-W/2-A/2,W/2+A/2])for(const x of[-L/4,L/4])box(L/2-c.pocketR*2,c.railH,A,x,H+c.railH/2,z,0x6e4c30);
    for(const x of[-L/2-A/2,L/2+A/2])box(A,c.railH,W-c.pocketR*2,x,H+c.railH/2,0,0x6e4c30);
    for(const[x,z]of this.physics.pockets)parts.push(paint(new T.CircleGeometry(c.pocketR,16).rotateX(-Math.PI/2).translate(x,H+.002,z),0x080b09));
    this.table=new T.Mesh(merge(parts),new T.MeshStandardMaterial({vertexColors:true,roughness:.82}));this.table.name='billiard-table';this.object.add(this.table);
    const geometry=new T.SphereGeometry(c.ballR,12,8),stripe=new Float32Array(16);
    this.physics.balls.forEach((b,i)=>stripe[i]=b.id>=9?1:0);geometry.setAttribute('aStripe',new T.InstancedBufferAttribute(stripe,1));
    const material=new T.MeshStandardMaterial({roughness:.25,metalness:.05});
    material.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float aStripe; varying float vStripe; varying float vBallY;').replace('#include <begin_vertex>','#include <begin_vertex>\nvStripe=aStripe;vBallY=position.y;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vStripe; varying float vBallY;').replace('#include <color_fragment>','#include <color_fragment>\nif(vStripe>.5 && abs(vBallY)>'+String(c.ballR*.4)+') diffuseColor.rgb=vec3(.92);');};
    material.customProgramCacheKey=()=> 'playroom-billiard-stripes-v1';
    this.mesh=new T.InstancedMesh(geometry,material,16);this.mesh.name='billiard-balls';this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.boundingSphere=new T.Sphere(new T.Vector3(0,H,0),Math.hypot(L,W));
    const colours=[0xf3f0e5,0xe8b72b,0x265bb6,0xb92528,0x643d83,0xdf762a,0x247046,0x7e292e,0x17191a];
    this.physics.balls.forEach((b,i)=>this.mesh.setColorAt(i,new T.Color(colours[b.id<9?b.id:b.id-8])));this.object.add(this.mesh);
    const tip=c.cueLength*.04,cue=[paint(new T.CylinderGeometry(.004,.004,tip,8).translate(0,tip/2,0),0xe9dfc4),paint(new T.CylinderGeometry(.009,.004,c.cueLength-tip,8).translate(0,tip+(c.cueLength-tip)/2,0),0x976333)];
    this.cue=new T.Mesh(merge(cue),new T.MeshStandardMaterial({vertexColors:true,roughness:.6}));this.cue.name='billiard-cue';this.object.add(this.cue);
    this.target={kind:'playroomBilliards',name:'biljardbordet',verb:'stöt på'};
    const pick=this.target.pickable=new T.Mesh(new T.BoxGeometry(L+2*A,.14,W+2*A),new T.MeshBasicMaterial({visible:false}));pick.position.y=H+.05;pick.userData.door=this.target;this.object.add(pick);
    const x=R.x+c.x,z=R.z+c.z,hx=L/2+A,hz=W/2+A;this.segments=[[x-hx,z-hz,x+hx,z-hz],[x+hx,z-hz,x+hx,z+hz],[x+hx,z+hz,x-hx,z+hz],[x-hx,z+hz,x-hx,z-hz]];
    this.rotations=this.physics.balls.map(()=>new T.Quaternion());this.last=this.physics.balls.map(b=>[b.x,b.z]);
    this.matrix=new T.Matrix4();this.pos=new T.Vector3();this.scale=new T.Vector3();this.axis=new T.Vector3();this.spin=new T.Quaternion();this.up=new T.Vector3(0,1,0);this.direction=new T.Vector3(1,0,0);this.strokeT=0;this.strokeOrigin=new T.Vector3();this.strokeDirection=new T.Vector3();this.update(0);
  }
  aim(camera) { camera.getWorldDirection(this.direction);this.direction.y=0;if(this.direction.lengthSq()<1e-8)this.direction.set(-Math.sin(camera.rotation.y),0,-Math.cos(camera.rotation.y));this.direction.normalize(); }
  shoot(camera) {
    this.aim(camera);
    if(!this.physics.shoot(this.direction.x,this.direction.z))return false;
    const b=this.physics.balls[0];
    this.strokeOrigin.set(b.x,this.c.height+this.c.ballR,b.z);this.strokeDirection.copy(this.direction);this.strokeT=this.c.strokeSeconds;return true;
  }
  update(dt,camera=null,aimed=false) {
    const c=this.c;this.physics.step(dt);this.strokeT=Math.max(0,this.strokeT-dt);
    if(camera)this.aim(camera);
    this.physics.balls.forEach((b,i)=>{const last=this.last[i],dx=b.x-last[0],dz=b.z-last[1],distance=Math.hypot(dx,dz);if(b.active&&distance>1e-8){this.axis.set(dz,0,-dx).normalize();this.rotations[i].premultiply(this.spin.setFromAxisAngle(this.axis,distance/c.ballR));}last[0]=b.x;last[1]=b.z;
      this.pos.set(b.x,c.height+c.ballR,b.z);this.scale.setScalar(b.active?1:0);this.mesh.setMatrixAt(i,this.matrix.compose(this.pos,this.rotations[i],this.scale));});this.mesh.instanceMatrix.needsUpdate=true;
    const moving=this.physics.moving;this.cue.visible=this.strokeT>0||(!moving&&aimed);
    const b=this.physics.balls[0],dir=this.strokeT>0?this.strokeDirection:this.direction;
    this.cue.position.copy(this.strokeT>0?this.strokeOrigin:this.pos.set(b.x,c.height+c.ballR,b.z));
    const advance=this.strokeT>0?Math.sin((1-this.strokeT/c.strokeSeconds)*Math.PI)*c.cueTravel:0;
    this.cue.position.addScaledVector(dir,-c.ballR*2+advance);this.axis.set(-dir.x,.12,-dir.z).normalize();this.cue.quaternion.setFromUnitVectors(this.up,this.axis);
  }
}
