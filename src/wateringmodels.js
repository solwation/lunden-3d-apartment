import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATERING as P } from './config.js';

const plastic=new THREE.MeshStandardMaterial({color:P.can.color,roughness:.6});
const waterMat=new THREE.MeshStandardMaterial({color:0x80bdd9,transparent:true,opacity:.7,roughness:.2,depthWrite:false});
// Open plastic can, curved spout, loop handle and a visible surface whose height follows the saved ml.
export function wateringCan(){
  const C=P.can,object=new THREE.Group(),profile=[[0,0],[C.r*.8,0],[C.r,C.h*.85],[C.r,C.h],[C.r-P.wall,C.h],[C.r-P.wall,P.bottom],[0,P.bottom]];
  const body=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),24);
  const spout=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(C.r*.7,C.h*.2,0),new THREE.Vector3(C.r+C.spout*.5,C.h*.55,0),new THREE.Vector3(C.r+C.spout,C.h*.85,0)]),12,P.spoutRadius,8,false);
  const handle=new THREE.TorusGeometry(C.handle,P.handleRadius,6,24).rotateY(Math.PI/2).translate(-C.r*.65,C.h*.55,0);
  const shell=new THREE.Mesh(mergeGeometries([body,spout,handle]),plastic);shell.castShadow=true;shell.receiveShadow=true;object.add(shell);
  const surface=new THREE.Mesh(new THREE.CircleGeometry(C.r-P.waterInset,24).rotateX(-Math.PI/2),waterMat);surface.raycast=()=>{};object.add(surface);
  const spoutEnd=new THREE.Object3D();spoutEnd.position.set(C.r+C.spout,C.h*.85,0);object.add(spoutEnd);
  const draw=ml=>{const fill=Math.max(0,Math.min(1,ml/P.capacity));surface.visible=fill>0;surface.position.y=P.waterBottom+fill*(C.h-P.waterBottom-P.waterHeadroom);};
  return {object,spout:spoutEnd,grip:[-C.r*.7,C.h*.7,0],show:item=>draw(item.amount),level:(_kind,ml)=>draw(ml)};
}
