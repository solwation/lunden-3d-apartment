import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAUNDRY as P } from './config.js';

// Small soft shirts scaled to the game's explicit storage slots; proportions are assumptions.
export function laundryClothes() {
  const object=new THREE.Group(),G=P.garment;
  const material=new THREE.MeshStandardMaterial({color:G.colors[0],roughness:1});
  const shape=new THREE.Shape();
  for(const [i,[x,y]] of [[-.28,0],[.28,0],[.28,.64],[.5,.53],[.5,.82],[.2,1],[.12,.86],[-.12,.86],[-.2,1],[-.5,.82],[-.5,.53],[-.28,.64]].entries())
    shape[i?'lineTo':'moveTo'](x*G.w,y*G.d);
  shape.closePath();
  const loose=new THREE.ExtrudeGeometry(shape,{depth:G.thick,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.002,bevelThickness:.002})
    .rotateX(-Math.PI/2).translate(0,.002,G.d/2);
  const folded=new RoundedBoxGeometry(G.w*.8,G.thick*1.8,G.d*.65,2,.005).translate(0,G.thick*.9,0);
  const body=new THREE.Mesh(loose,material);body.castShadow=true;body.receiveShadow=true;object.add(body);
  const dirt=new THREE.Mesh(new THREE.CircleGeometry(.024,12).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x574937,roughness:1}));
  dirt.position.set(.015,G.thick+.005,-.035);dirt.raycast=()=>{};object.add(dirt);
  let isFolded=false;
  return {object,grip:[G.w*.2,G.thick,0],show(item){
    const next=!!item.machine.folded;if(next!==isFolded){isFolded=next;body.geometry=next?folded:loose;}
    material.color.setHex(G.colors[((Number(item.id.split('#')[1])||1)-1) % G.colors.length]??G.colors[0]);
    if(item.moisture==='wet')material.color.multiplyScalar(.68);
    material.roughness=item.moisture==='wet'?.7:1;dirt.visible=item.clean!=='clean';
  }};
}

export function laundryBasket() {
  const {w,d,h}=P.basket,parts=[];
  const box=(sx,sy,sz,x,y,z)=>parts.push(new THREE.BoxGeometry(sx,sy,sz).translate(x,y,z));
  box(w,.015,d,0,.0075,0);
  // Open top, spaced slats and horizontal bands, merged into a single basket draw.
  for(const side of [-1,1]) {
    for(let i=0;i<9;i++) {
      box(.015,h,.013,-w/2+i*w/8,h/2,side*d/2);
      box(.013,h,.015,side*w/2,h/2,-d/2+i*d/8);
    }
    for(const y of [.08,.18,h-.012]) {box(w,.022,.014,0,y,side*d/2);box(.014,.022,d,side*w/2,y,0);}
  }
  const object=new THREE.Mesh(mergeGeometries(parts),new THREE.MeshStandardMaterial({color:0xd6cbb8,roughness:.9}));
  object.castShadow=true;object.receiveShadow=true;return object;
}
