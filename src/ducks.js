import { discoverCreature } from './bestiaryevents.js';
import { creature } from './bestiarymetadata.js';
import {DuckKiss,duckBill} from './duckkiss.js';
import {Hearts} from './pingping.js';
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
  this.kiss=new DuckKiss({config:DUCKS.kiss,bill:duckBill(geometries[0].attributes.position),habitat:this.habitat,seen:b=>this.kissVisible(b),burst:p=>{
   this.kissHearts??=new Hearts(scene,DUCKS.kiss.hearts,DUCKS.kiss.heartScale);this.kissHearts.burst({...p.point,y:p.point.y+DUCKS.kiss.heartLift});}});
  this.animals=this.flock.brains.map(brain=>{
   const mesh=new THREE.Mesh(geometries[brain.female?1:0],mat);mesh.name=brain.female?'river-duck-female':'river-duck-male';scene.add(mesh);
   const pick=new THREE.Mesh(new THREE.BoxGeometry(...DUCKS.pick.size),new THREE.MeshBasicMaterial());pick.visible=false;scene.add(pick);
   const target={kind:'duck',name:'ankan med bröd',verb:'mata',pickable:pick,toggle:()=>this.feed(brain)};
   Object.defineProperties(target,{blocked:{get:()=>!heldBread(life,heldItem())||brain.cooldown>0},blockedText:{get:()=>brain.cooldown>0?'Ankan tuggar':'Håll en brödskiva utan pålägg'}});pick.userData.door=target;
   return{brain,mesh,pick,target};
  });
  this.update(0,false);
 }
 kissVisible(b){const p=this.camera.position;if(Math.hypot(p.x-b.x,p.y-b.y,p.z-b.z)>Math.min(DUCKS.near,DUCKS.kiss.near))return false;
  this.camera.updateMatrixWorld();const v=(this.kissV??=new THREE.Vector3()).set(b.x,b.y+this.kiss.bill.y,b.z).project(this.camera);return Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z>-1&&v.z<1;}
 targets(){return this.animals.filter(a=>a.mesh.visible).map(a=>a.pick);}
 feed(brain){
  if(brain.cooldown>0 || Math.hypot(this.camera.position.x-brain.x,this.camera.position.z-brain.z)>DUCKS.feedReach || Math.abs(this.camera.position.y-brain.y)>DUCKS.maxFeedHeight || !feedBread(this.life,heldItem()))return false;
  this.kiss.interrupt(brain);brain.feed();this.feeds++;discoverCreature(`duck:${brain.female?'female':'male'}`,'feed');this.onFeed?.();this.say('Ankan åt en bit bröd');this.quack(brain);return true;
 }
 quack(b){if(this.quackCooldown>0)return;this.quackCooldown=DUCKS.quackCooldown;this.quacks++;sfx.quack({x:b.x,y:b.y+.5,z:b.z});}
 update(dt,hidden){
  this.quackCooldown=Math.max(0,this.quackCooldown-dt);
  const bread=heldBread(this.life,heldItem()),p=this.camera.position;
  const food=bread?{x:p.x,z:p.z,y:p.y}:null;this.kiss.update(dt,this.flock,food,hidden);
  if(!hidden){for(const b of this.flock.update(dt,food,b=>!this.kiss.owns(b)&&Math.hypot(p.x-b.x,p.z-b.z)<DUCKS.near))this.quack(b);}
  if(this.kissHearts){if(hidden||!this.kiss.pair)this.kissHearts.points.visible=false;else this.kissHearts.update(dt);}
  for(const a of this.animals){const b=a.brain,d=Math.hypot(p.x-b.x,p.z-b.z);a.mesh.visible=!hidden&&d<DUCKS.draw;
   a.mesh.position.set(b.x,b.y+(b.swimming&&!b.kissing ? DUCKS.bob*Math.sin(b.phase) : 0),b.z);
   a.mesh.rotation.set(b.eating?Math.sin(b.eating*DUCKS.eatPhase)*DUCKS.eatNod:0,b.yaw,!b.kissing&&!b.swimming&&b.moving?Math.sin(b.phase)*DUCKS.waddle:0,'YXZ');
   a.pick.position.set(b.x,b.y+DUCKS.pick.height,b.z);a.pick.rotation.y=b.yaw;
   a.mesh.updateMatrixWorld();a.pick.updateMatrixWorld();
  }
 }
}

for (const [female,no] of [[false,48],[true,49]]) creature({id:`duck:${female?'female':'male'}`,no,name:female?'Gräsand · hona':'Gräsand · hane',family:'ducks',variant:female?'Brunspräcklig dräkt':'Grönt huvud',model:{kind:'duck',female},info:{size:'Cirka 50–65 cm (uppskattning)',weight:'0,7–1,5 kg (uppskattning)',where:'Stränder och vatten i Höje å',when:'Dag och kväll',likes:'Lugnt vatten och sällskap'},facts:['Honans bruna dräkt ger kamouflage.','Paret håller ofta ihop med honan framför.']});
