import * as THREE from 'three';
import { jacket, shoe } from './furniture.js';
import { mergeStatic } from './merge.js';
import { HALL_CARE as P } from './config.js';

export function hallJacket(){
  const object=new THREE.Group(),body=jacket(P.jacket.len,P.jacket.color,P.jacket.kind);mergeStatic(body);object.add(body);
  body.rotation.x=-Math.PI/2;const flatLift=-new THREE.Box3().setFromObject(body).min.y;
  return {object,show:it=>{const hung=['hallCoatRack','hallWardrobeHook'].includes(it.place?.store);body.rotation.x=hung?0:-Math.PI/2;body.position.y=hung?0:flatLift;}};
}
export function hallShoes(){
  const object=new THREE.Group();for(const x of [-P.shoes.gap,P.shoes.gap]){const s=shoe(P.shoes.color,P.shoes.boot);s.position.x=x;object.add(s)}mergeStatic(object);return {object};
}
