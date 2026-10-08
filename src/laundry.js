import * as THREE from 'three';
import { LAUNDRY as P } from './config.js';
import { laundryBasket } from './laundrymodels.js';

// Laundry uses the same item data, slot rules, actions and save record as kitchen storage (#550).
export class Laundry {
  constructor(life,world) {
    Object.assign(this,{life,world,machines:[],stores:new Map()});
    const basket=this.basket=new THREE.Group();basket.name='laundryBasket';basket.position.set(...P.basket.pos);
    this.basketModel=laundryBasket();basket.add(this.basketModel);life.scene.add(basket);world.looseItems.push(basket);
    const B=P.basket;
    const anchors=Array.from({length:B.slots},(_,k)=>this.anchor(basket,[0,B.h-.09+k*.025,0]));
    this.register('laundryBasket',{name:'tvättkorgen',fullText:'Tvättkorgen är full',slots:B.slots},basket,anchors,[0,B.h/2,0],[B.w-.025,B.h,B.d-.025],this.basketModel);
    for(let k=0;k<B.slots;k++)life.stock.push(['laundryClothes','laundryBasket',k]);
    // Floor footprint stays against the east wall; the laundry room's central path remains clear.
    const [x,,z]=B.pos,hw=B.w/2,hd=B.d/2;
    this.segments=[[x-hw,z-hd,x+hw,z-hd],[x+hw,z-hd,x+hw,z+hd],[x+hw,z+hd,x-hw,z+hd],[x-hw,z+hd,x-hw,z-hd]];
    for(const list of [world.levels[0].segments,world.levels[0].fixedSegments])if(list&&!list.includes(this.segments[0]))list.push(...this.segments);
    for(const door of world.lids.filter(d=>d.laundry)) {
      const D=P.drum,{kind,center}=door.laundry,root=new THREE.Group();root.name='laundryDrum';root.visible=false;life.scene.add(root);
      const points=Array.from({length:D.slots},(_,k)=>[center[0]-.13,center[1]-.095+k*.035,center[2]]);
      const aa=points.map(p=>this.anchor(root,p));
      const store=this.register(kind==='washer'?'laundryWasher':'laundryDryer',{
        name:door.name,fullText:kind==='washer'?'Tvättmaskinen är full':'Torktumlaren är full',
        shutText:kind==='washer'?'Öppna tvättmaskinen först':'Öppna torktumlaren först',
        isOpen:()=>door.isOpen,slots:D.slots,
      },root,aa,[center[0]-.025,center[1],center[2]],[.045,D.radius*1.7,D.radius*1.7],door.object);
      const update=door.update.bind(door);door.update=dt=>{update(dt);root.visible=door.isOpen||door.t>0;};
      this.machines.push({kind,door,root,store});
    }
    life.items.namers.laundryClothes=item=>`${item.clean==='clean'?'rena':'smutsiga'} ${item.moisture==='wet'?'våta':'torra'} ${item.machine?.folded?'vikta ':''}plagget`;
  }
  anchor(parent,pos) {const a=new THREE.Object3D();a.position.set(...pos);parent.add(a);return a;}
  register(id,spec,parent,anchors,pos,size,outlineRoot) {
    const I=this.life.items;
    const store=I.addStore({id,...spec,accepts:['laundry'],refuse:item=>I.has(item,'laundry')?null:'Här lägger du bara kläder',slots:Array.from({length:spec.slots},()=>({size:'s'}))});
    this.life.anchors.set(id,k=>anchors[k]??null);
    const pick=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshBasicMaterial());pick.position.set(...pos);pick.visible=false;parent.add(pick);
    const ray=pick.raycast.bind(pick);pick.raycast=(r,hits)=>{if(I.held()&&(!store.isOpen||store.isOpen()))ray(r,hits);};
    const target={kind:'life',name:spec.name,store:id,pickable:pick,outlineRoot};
    target.options=()=>this.life.options(target);target.toggle=()=>this.life.run(target);
    Object.defineProperties(target,{blocked:{get:()=>!target.options().some(a=>!a.reason)},blockedText:{get:()=>target.options()[0]?.reason??null}});
    pick.userData.door=target;(this.life.storeTargets??=[]).push(target);
    const result=Object.assign(store,{target,pick,parent,anchors});this.stores.set(id,result);return result;
  }
}
