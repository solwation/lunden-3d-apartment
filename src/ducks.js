import * as THREE from 'three';
import {DuckFlock,DUCKS,heldBread,feedBread} from './duckbrain.js';
import {duckHabitat} from './duckhabitat.js';
import {duckModel} from './duckmodel.js';
import {heldItem} from './holdable.js';
import {sfx} from './audio.js';

export class Ducks {
 constructor({scene,camera,life,ground,say}) {
  Object.assign(this,{camera,life,ground,say,quackCooldown:0,quacks:0,feeds:0});
  this.habitat=duckHabitat(ground);this.flock=new DuckFlock(this.habitat);
  const geometries=[duckModel(false),duckModel(true)],mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  this.animals=this.flock.brains.map(brain=>{
   const mesh=new THREE.Mesh(geometries[brain.female?1:0],mat);mesh.name=brain.female?'river-duck-female':'river-duck-male';scene.add(mesh);
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
  brain.feed();this.feeds++;this.onFeed?.();this.say('Ankan åt en bit bröd');this.quack(brain);return true;
 }
 quack(b){if(this.quackCooldown>0)return;this.quackCooldown=DUCKS.quackCooldown;this.quacks++;sfx.quack({x:b.x,y:b.y+.5,z:b.z});}
 update(dt,hidden){
  this.quackCooldown=Math.max(0,this.quackCooldown-dt);
  const bread=heldBread(this.life,heldItem()),p=this.camera.position;
  if(!hidden){for(const b of this.flock.update(dt,bread?{x:p.x,z:p.z,y:p.y}:null,b=>Math.hypot(p.x-b.x,p.z-b.z)<DUCKS.near))this.quack(b);}
  for(const a of this.animals){const b=a.brain,d=Math.hypot(p.x-b.x,p.z-b.z);a.mesh.visible=!hidden&&d<DUCKS.draw;
   a.mesh.position.set(b.x,b.y+(b.swimming ? DUCKS.bob*Math.sin(b.phase) : 0),b.z);
   a.mesh.rotation.set(b.eating?Math.sin(b.eating*DUCKS.eatPhase)*DUCKS.eatNod:0,b.yaw,!b.swimming&&b.moving?Math.sin(b.phase)*DUCKS.waddle:0,'YXZ');
   a.pick.position.set(b.x,b.y+DUCKS.pick.height,b.z);a.pick.rotation.y=b.yaw;
   a.mesh.updateMatrixWorld();a.pick.updateMatrixWorld();
  }
 }
}
