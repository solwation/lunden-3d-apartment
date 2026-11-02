import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {DuckBrain,DUCKS,heldBread,feedBread} from './duckbrain.js';
import {riverAt,waterYAt} from './riverbridge.js';
import {heldItem} from './holdable.js';
import {sfx} from './audio.js';

// All sizes, flock placement and timing are playful guesses. Four shared low-poly meshes, no lights/shadows.
function model() {
 const parts=[],c=new THREE.Color();
 const blob=(p,s,color)=>{const g=new THREE.SphereGeometry(1,...DUCKS.model.segments);g.deleteAttribute('uv');g.scale(...s);g.translate(...p);const a=new Float32Array(g.attributes.position.count*3);c.setHex(color);for(let i=0;i<a.length;i+=3)c.toArray(a,i);g.setAttribute('color',new THREE.BufferAttribute(a,3));parts.push(g);};
 for(const [p,s,color] of DUCKS.model.blobs)blob(p,s,color);
 for(const side of [-1,1])for(const [p,s,color] of DUCKS.model.paired)blob([side*p[0],p[1],p[2]],s,color);
 const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
export class Ducks {
 constructor({scene,camera,life,ground,say}) {
  Object.assign(this,{camera,life,ground,say,quackCooldown:0,quacks:0,feeds:0});
  const r=riverAt(...DUCKS.habitat.at), nx=r.nx,nz=r.nz, tx=nz,tz=-nx, north=nz>0?-1:1;
  // The northern shore's flat reach, away from the bridge piers and paddock fence.
  const point=(along,across)=>({x:r.x+tx*along+nx*across,z:r.z+tz*along+nz*across});
  this.habitat={surface:(x,z)=>{const w=waterYAt(x,z),g=ground(x,z);return{y:Math.max(w-DUCKS.habitat.sink,g),water:g<w-DUCKS.habitat.waterMargin};},
   goal:(mode,a,b)=>point((a-.5)*DUCKS.habitat.span,mode==='swim'?(b-.5)*r.width*DUCKS.habitat.waterSpan:north*(r.width/2+r.bank*.4+DUCKS.habitat.shore[0]+b*DUCKS.habitat.shore[1])),
   contains:(x,z)=>{const dx=x-r.x,dz=z-r.z;return Math.abs(dx*tx+dz*tz)<DUCKS.habitat.along&&Math.abs(dx*nx+dz*nz)<r.width/2+r.bank*.4+DUCKS.habitat.extraBank;}};
  const geo=model(),mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  this.animals=Array.from({length:DUCKS.count},(_,i)=>{
   const home=point((i-DUCKS.habitat.startAlong)*DUCKS.habitat.spacing,i%2?0:north*(r.width/2+r.bank*.4+DUCKS.habitat.startShore)),brain=new DuckBrain({home,habitat:this.habitat,seed:i+1});
   const mesh=new THREE.Mesh(geo,mat);mesh.name='river-duck';scene.add(mesh);
   const pick=new THREE.Mesh(new THREE.BoxGeometry(...DUCKS.pick.size),new THREE.MeshBasicMaterial());pick.visible=false;scene.add(pick);
   const target={kind:'duck',name:'ankan med bröd',verb:'mata',pickable:pick,toggle:()=>this.feed(brain)};
   Object.defineProperties(target,{blocked:{get:()=>!heldBread(life,heldItem())||brain.cooldown>0},blockedText:{get:()=>brain.cooldown>0?'Ankan tuggar':'Håll en brödskiva utan pålägg'}});pick.userData.door=target;
   return{brain,mesh,pick,target};
  });
  this.update(0,false);
 }
 targets(){return this.animals.filter(a=>a.mesh.visible).map(a=>a.pick);}
 feed(brain){
  if(brain.cooldown>0 || Math.hypot(this.camera.position.x-brain.x,this.camera.position.z-brain.z)>DUCKS.feedReach || Math.abs(this.camera.position.y-brain.y)>DUCKS.maxFeedHeight || !feedBread(this.life,heldItem()))return false;
  brain.feed();this.feeds++;this.say('Ankan åt en bit bröd');this.quack(brain);return true;
 }
 quack(b){if(this.quackCooldown>0)return;this.quackCooldown=DUCKS.quackCooldown;this.quacks++;sfx.quack({x:b.x,y:b.y+.5,z:b.z});}
 update(dt,hidden){
  this.quackCooldown=Math.max(0,this.quackCooldown-dt);
  const bread=heldBread(this.life,heldItem()),p=this.camera.position;
  for(const a of this.animals){const b=a.brain,d=Math.hypot(p.x-b.x,p.z-b.z);a.mesh.visible=!hidden&&d<DUCKS.draw;
   if(!hidden&&d<DUCKS.near){if(b.update(dt,bread&&Math.abs(p.y-b.y)<DUCKS.maxFeedHeight?{x:p.x,z:p.z}:null))this.quack(b);}
   a.mesh.position.set(b.x,b.y+(b.swimming ? DUCKS.bob*Math.sin(b.phase) : 0),b.z);
   a.mesh.rotation.set(b.eating?Math.sin(b.eating*DUCKS.eatPhase)*DUCKS.eatNod:0,b.yaw,!b.swimming&&b.moving?Math.sin(b.phase)*DUCKS.waddle:0,'YXZ');
   a.pick.position.set(b.x,b.y+DUCKS.pick.height,b.z);a.pick.rotation.y=b.yaw;
   a.mesh.updateMatrixWorld();a.pick.updateMatrixWorld();
  }
 }
}
