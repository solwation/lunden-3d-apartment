import * as THREE from 'three';
import { HALL_CARE as P } from './config.js';
import { frameMatrix } from './contents.js';

// Ordinary Items places: one original jacket and shoe pair with homes on the hall floor;
// tidy them onto the existing hook/rack or the hall wardrobe. A new visit starts with a clean hall:
// the floor stock is gated until the task list reveals the 'tidyHall' task (#594, tasks.js
// 'tasksShown'), then the normal restock lays them there once; existing items never get copies.
export class HallCare {
  constructor(life,world){
    Object.assign(this,{life,world,stores:new Map(),wardrobes:[],armed:false});
    const floors=[];
    for(const [type,kind,pos,size] of [['hallJacket','jacket',P.jacket.floor,P.floorJacketPick],['hallShoes','shoes',P.shoes.floor,P.floorShoePick]]){
      const root=new THREE.Group();root.position.set(...pos);life.scene.add(root);world.looseItems.push(root);
      const store=this.add(`hallFloor${kind}`,type,'golvet i hallen',root,[0,0,0],size);
      life.stock.push([type,store.id,0,()=>this.armed]);floors.push(store.id);
    }
    life.onEvent((kind,d)=>{
      if(kind!=='tasksShown')return;
      this.armed=d.ids.includes('tidyHall');
      if(this.armed)for(const id of floors)life.restock(id);
    });
    life.items.on((kind,item)=>{ // tidied away: the hall task's goal (tasks.js)
      if(kind==='move'&&item.place?.at==='slot'&&P.tidy[item.place.store]===item.type)life.emit('hallTidied',{item,store:item.place.store});
    });
    for(const piece of world.furniture.movable.filter(p=>p.object.userData.hallCare)){
      const c=piece.object.userData.hallCare;
      if(c.jacket)this.add('hallCoatRack','hallJacket','kroken i hallen',piece.object,c.jacket,P.jacketPick);
      if(c.shoes)this.add('hallShoeRack','hallShoes','skohyllan i hallen',piece.object,c.shoes,P.shoePick);
    }
    for(const w of world.hallWardrobes??[]){
      const root=new THREE.Group();root.applyMatrix4(frameMatrix(w.hall.dir,w.hall.origin));life.scene.add(root);
      const pos=w.hall.slot;root.updateWorldMatrix(true,true);const p=new THREE.Vector3(...pos).applyMatrix4(root.matrixWorld),along=w.along?p.x:p.z;
      const open=()=>w.doors.every(d=>Math.abs(d.pos-along)>d.len/2+P.access);
      const store=this.add('hallWardrobeHook','hallJacket','hallgarderoben',root,pos,P.wardrobePick,open);
      store.anchors[0].rotation.y=Math.PI/2;
      // Pick just behind the fronts, independent of the hanging jacket's side-on rod pose.
      store.pick.position.z=Math.abs(w.front-w.back)-P.frontGap;root.visible=open();this.wardrobes.push({spec:w,root,store,open});
      for(const d of w.doors){const update=d.update.bind(d);d.update=dt=>{update(dt);root.visible=open();};}
    }
  }
  add(id,type,name,root,pos,size,isOpen){
    const anchor=new THREE.Object3D();anchor.position.set(...pos);root.add(anchor);
    const I=this.life.items,store=I.addStore({id,name,slots:[{size:'m',accepts:[type]}],isOpen,shutText:'Öppna garderobsdörren framför kroken först',fullText:type==='hallJacket'?'Här hänger redan en jacka':'Här står redan ett par skor',
      putLabel:it=>`${id.startsWith('hallFloor')?'lägga':type==='hallJacket'?'hänga':'ställa'} ${I.name(it)} ${id==='hallWardrobeHook'?'i':'på'} ${name}`,
      refuse:it=>it?.type===type?null:type==='hallJacket'?'Här hänger du jackan':'Här ställer du skorna'});
    this.life.anchors.set(id,()=>anchor);
    const pick=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshBasicMaterial());pick.visible=false;pick.position.set(pos[0],pos[1]+(type==='hallJacket'&&!id.startsWith('hallFloor')?-size[1]/2:size[1]/2),pos[2]);root.add(pick);
    const ray=pick.raycast.bind(pick);pick.raycast=(r,h)=>{if(I.held()?.type===type&&(!isOpen||isOpen()))ray(r,h)};
    const target={kind:'life',name,store:id,pickable:pick};target.options=()=>this.life.options(target);target.toggle=()=>this.life.run(target);
    Object.defineProperties(target,{blocked:{get:()=>!target.options().some(a=>!a.reason)},blockedText:{get:()=>target.options()[0]?.reason??null}});pick.userData.door=target;
    this.life.storeTargets.push(target);Object.assign(store,{root,anchors:[anchor],pick,target});this.stores.set(id,store);return store;
  }
}
