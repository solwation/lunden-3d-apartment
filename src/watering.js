import * as THREE from 'three';
import { WATERING as P } from './config.js';
import { sfx } from './audio.js';

const shown=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
const capture=geo=>(geo.userData.keepCpu=true,{geo,pos:geo.attributes.position.array.slice(),color:geo.attributes.color?.array.slice()});
// Change existing pot geometry from original arrays, so repeated loads never accumulate deformation.
function tintPot(entry,part,soilY,watered){
  const {geo,pos,color}=entry,vertices=geo.attributes.position;
  vertices.array.set(pos);
  if(['leaf','flower'].includes(part)&&!watered)for(let i=0;i<vertices.count;i++)if(vertices.getY(i)>soilY)vertices.setY(i,soilY+(vertices.getY(i)-soilY)*P.dryLift);
  vertices.needsUpdate=true;
  if(color){const attr=geo.attributes.color,factor=part==='soil'?(watered?P.soilWet:1):watered?1:P.dryLeaf;for(let k=0;k<color.length;k++)attr.array[k]=color[k]*factor;attr.needsUpdate=true;}
  geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();
}

// Existing plants retain their Holdable/furniture identity. Only watered ids live in the saved care extra.
export class Watering {
  constructor(life,world,{sillPots,things,lights}){
    Object.assign(this,{life,world,plants:[],byTarget:new Map()});
    this.rack();
    for(const owner of sillPots)this.sill(owner);
    for(const owner of things.filter(t=>t.kind==='plant'))this.plant(`thing:${owner.fullName}:${owner.backTarget.name}`,owner.model,owner);
    for(const piece of world.furniture.movable.filter(p=>['palm','zzplant'].includes(p.item.type)))this.plant(`furniture:${piece.id}`,piece.object);
    lights.wash.patch(life.scene); // independent cloned soil finishes get one normal lamp patch.
    life.items.namers.wateringCan=it=>it.amount>0?`vattenkannan (${Math.round(it.amount)} ml)`:'den tomma vattenkannan';
    this.load([]);life.keepPart('watering',{save:()=>this.plants.filter(p=>p.watered).map(p=>p.id),load:v=>this.load(v)});
    const stream=this.stream=new THREE.Mesh(new THREE.CylinderGeometry(P.streamRadius,P.streamRadius,1,6),new THREE.MeshBasicMaterial({color:0x8fc5e3,transparent:true,opacity:.7}));
    stream.visible=false;stream.raycast=()=>{};stream.userData.ghost=true;life.scene.add(stream);
    const stop=(c,job)=>{stream.visible=false;const v=c.heldView;if(v?.held&&job.base){v.model.position.copy(job.base);v.model.rotation.copy(v.heldPose.rot);}v?.refresh();};
    life.actions.define({id:'waterPlant',order:0,duration:P.seconds,label:'vattna växten',applies:c=>life.items.has(c.held,'wateringCan')&&!!c.raw.wateringPlant,
      check:c=>{
        const p=c.raw.wateringPlant;
        return p.artificial?'Konstväxten behöver inget vatten':!shown(p.root)?'Växten är inte framme':p.watered?'Växten är redan vattnad':c.held.amount<P.dose?'Fyll vattenkannan först':null;
      },reserve:c=>({inputs:[c.held]}),
      animate:(c,k,job)=>{
        const v=c.heldView;if(!v?.held)return;job.base??=v.model.position.clone();v.model.rotation.z=v.heldPose.rot.z-P.tilt*Math.sin(Math.PI*k);
        if(!job.sound){job.sound=true;sfx.pour(v.where(),job.duration);}
        const a=v.view.spout.getWorldPosition(new THREE.Vector3()),b=c.raw.wateringPlant.soilPoint(),d=new THREE.Vector3().subVectors(b,a);
        stream.position.copy(a).add(b).multiplyScalar(.5);stream.scale.y=d.length();stream.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());stream.visible=k>0&&k<1;
      },commit:c=>{
        const p=c.raw.wateringPlant;life.items.consume(c.held,P.dose);p.apply(true);this.rebuildSills();life.emit('plantWatered',{id:p.id,ml:P.dose});life.dirty=true;return P.dose;
      },done:stop,cancel:stop,consumes:'one assumed game dose from the saved can',result:'the same plant has wet soil and perked window foliage'});
  }
  get canHeld(){return this.life.items.has(this.life.items.held(),'wateringCan');}
  aim(target){return this.canHeld?this.byTarget.get(target)?.target??null:null;}
  rack(){
    const I=this.life.items,root=new THREE.Group();root.position.set(...P.home);this.life.scene.add(root);this.rackRoot=root;
    const anchor=new THREE.Object3D();root.add(anchor);I.addStore({id:'wateringCanRack',name:'kannans plats',slots:[{size:'m'}],accepts:['wateringCan'],fullText:'Här står redan en vattenkanna'});this.life.anchors.set('wateringCanRack',()=>anchor);
    const box=new THREE.Mesh(new THREE.BoxGeometry(...P.rackPick),new THREE.MeshBasicMaterial());box.position.y=P.can.h/2;box.visible=false;root.add(box);
    const ray=box.raycast.bind(box);box.raycast=(r,h)=>{if(this.canHeld)ray(r,h);};
    const target={kind:'life',name:'kannans plats',store:'wateringCanRack',pickable:box};target.options=()=>this.life.options(target);target.toggle=()=>this.life.run(target);Object.defineProperties(target,{blocked:{get:()=>!target.options().some(a=>!a.reason)},blockedText:{get:()=>target.options()[0]?.reason??null}});box.userData.door=target;
    (this.life.storeTargets??=[]).push(target);this.life.stock.push(['wateringCan','wateringCanRack',0]);
  }
  target(p,owner){
    const box=new THREE.Box3().setFromObject(p.root),size=box.getSize(new THREE.Vector3()).addScalar(P.pickMargin),centre=box.getCenter(new THREE.Vector3());
    const pick=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),new THREE.MeshBasicMaterial({visible:false}));pick.userData.ghost=true;p.root.updateWorldMatrix(true,false);pick.position.copy(p.root.worldToLocal(centre));pick.visible=false;p.root.add(pick);
    const ray=pick.raycast.bind(pick);pick.raycast=(r,h)=>{if(this.canHeld&&!owner?.held)ray(r,h);};
    const target=p.target={kind:'life',name:owner?.name??'krukväxten',wateringPlant:p,pickable:pick,outlineRoot:p.root};
    target.options=()=>this.life.options(target);target.toggle=()=>this.life.run(target);
    Object.defineProperties(target,{blocked:{get:()=>!target.options().some(a=>!a.reason)},blockedText:{get:()=>target.options()[0]?.reason??null}});
    pick.userData.door=target;(this.life.storeTargets??=[]).push(target);if(owner)this.byTarget.set(owner.takeTarget,p);this.plants.push(p);
  }
  sill(owner){
    const pot=owner.pot,source=[],model=[];
    for(const [part,geos] of Object.entries(pot.geos))for(const geo of geos)if(['soil','leaf','trail','flower'].includes(part))source.push({part:part==='trail'?'leaf':part,...capture(geo)});
    owner.model.traverse(m=>{if(m.isMesh&&['soil','leaf','flower'].includes(m.userData.plantPart))model.push({part:m.userData.plantPart,...capture(m.geometry)});});
    const p={id:`sill:${pot.sill}:${pot.k}`,root:owner.model,owner,soilPoint:()=>owner.model.localToWorld(new THREE.Vector3(0,pot.soilY,0)),apply:watered=>{
      p.watered=watered;pot.watered=watered;for(const e of [...source,...model])tintPot(e,e.part,pot.soilY,watered);
    }};this.target(p,owner);
  }
  plant(id,root,owner){
    const soils=[];root.traverse(m=>{if(m.isMesh&&!Array.isArray(m.material)&&m.material.userData.plantSoil){
      const material=m.material.clone();m.material=material;soils.push({mesh:m,material,color:material.color.clone(),roughness:material.roughness});
    }});
    const artificial=!!root.userData.artificial;
    if(!soils.length&&!artificial)return;
    const p={id,root,owner,artificial,soilPoint:()=>soils[0]?new THREE.Box3().setFromObject(soils[0].mesh).getCenter(new THREE.Vector3()):root.getWorldPosition(new THREE.Vector3()),apply:watered=>{
      p.watered=watered&&!artificial;for(const s of soils){s.material.color.copy(s.color).multiplyScalar(p.watered?P.soilWet:1);s.material.roughness=p.watered?P.soilRoughness:s.roughness;}
    }};this.target(p,owner);
  }
  rebuildSills(){if(this.plants.some(p=>p.id.startsWith('sill:')))this.world.sillPlants.userData.rebuild(this.plants.find(p=>p.id.startsWith('sill:')).owner.away);}
  load(v){const ids=new Set(Array.isArray(v)?v.filter(id=>typeof id==='string'):[]);for(const p of this.plants)p.apply(ids.has(p.id));this.rebuildSills();}
}
