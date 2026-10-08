import * as THREE from 'three';
import { SKANSNAS, TABLE_SETTING as P } from './config.js';

// Each existing chair gets a plate/glass pair. The normal Items slots carry identities,
// plate contents and liquid; there is no separate stock or saved table counter (#554).
export class TableSetting {
  constructor(life,world){
    this.life=life;this.places=[];
    const piece=world.furniture.movable.find(p=>p.item.type==='skansnasTable');if(!piece)return;
    this.table=piece.object;
    for(const side of [-1,1])for(const row of [-1,0,1]){
      const index=this.places.length,id=`tableSetting${index}`,name=`dukplats ${index+1}`,x=side*(SKANSNAS.table.w/2-P.inset),z=row*SKANSNAS.table.l/4,y=SKANSNAS.table.h+.004+P.lift;
      const root=new THREE.Group();this.table.add(root);
      const anchors=[[x,y,z],[x-side*P.glassIn,y,z+P.glassAhead]].map(p=>{const a=new THREE.Object3D();a.position.set(...p);root.add(a);return a});
      const store=life.items.addStore({id,name,carriers:true,slots:[{size:'m',accepts:['plate']},{size:'s',accepts:['glass']}],
        fullText:'Här finns redan en sådan sak',putLabel:it=>`duka med ${life.items.name(it)} vid ${name}`,
        refuse:it=>!['plate','glass'].includes(it?.type)?'Duka med en tallrik eller ett dricksglas':null});
      life.anchors.set(id,k=>anchors[k]);
      const pick=new THREE.Mesh(new THREE.BoxGeometry(...P.pick),new THREE.MeshBasicMaterial());pick.visible=false;pick.position.set(x-side*P.pickIn,y+P.pickY,z+P.pickZ);root.add(pick);
      const ray=pick.raycast.bind(pick);pick.raycast=(r,h)=>{if(this.dishHeld&&this.table.visible)ray(r,h)};
      const target={kind:'life',name,store:id,pickable:pick};target.options=()=>life.options(target);target.toggle=()=>life.run(target);
      Object.defineProperties(target,{blocked:{get:()=>!target.options().some(a=>!a.reason)},blockedText:{get:()=>target.options()[0]?.reason??null}});pick.userData.door=target;
      life.storeTargets.push(target);this.places.push({root,anchors,store,pick,target});
    }
  }
  get dishHeld(){return ['plate','glass'].includes(this.life.items.held()?.type)}
  aim(target){
    if(!this.dishHeld)return null;
    const it=target?.item?.lifeItem?target.item.item:target?.instance;
    return this.places.find(p=>p.store.id===it?.place?.store)?.target??null;
  }
}
