import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAUNDRY as P } from './config.js';

// Soft crumpled shirts (#632): a lumpy torso with two sleeve lumps, pushed in and out by a few sine "folds"
// (deterministic per variant) and shaded darker in the creases through vertex colours - one merged mesh, no textures.
// Proportions are assumptions (*guess*); the three variants are shared by every garment with the same id modulo.
const variants=[];
function crumpled(seed) {
  const G=P.garment,parts=[];
  const lump=(rx,ry,rz,x,y,z,rotY,rotZ,k)=>{
    const g=new THREE.SphereGeometry(1,16,11),pos=g.attributes.position,col=new Float32Array(pos.count*3),v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++) {
      v.fromBufferAttribute(pos,i);
      const n=.5*Math.sin(9*v.x+3*v.z+seed*1.7+k)+.3*Math.sin(13*v.z-5*v.y+seed*2.3)+.2*Math.sin(7*(v.x-v.z)+seed+k*2);
      const r=1+.2*n+(v.y<0?.12*Math.abs(v.y):0); // sagging underside, folds on top
      v.multiplyScalar(r);pos.setXYZ(i,v.x*rx,v.y*ry*(v.y<0?.7:1),v.z*rz);
      const c=.84+.16*(n*.5+.5);col[i*3]=col[i*3+1]=col[i*3+2]=c;
    }
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    g.rotateZ(rotZ).rotateY(rotY).translate(x,y,z);g.computeVertexNormals();parts.push(g);
  };
  const w=G.w,d=G.d,s2=(seed%2?1:-1);
  lump(w*.34,.032,d*.38,0,.032,0,seed*.4,0,0);
  lump(w*.22,.025,d*.16,-w*.3,.03+.006*seed,d*.08*s2,.5*s2,.18,3);
  lump(w*.22,.025,d*.16,w*.3,.03,-d*.1*s2,-.6*s2,-.15,5);
  lump(w*.22,.02,d*.16,-.01,.06,d*.1*s2,.9*s2,.05,7); // a fold lying over the torso
  const g=mergeGeometries(parts);g.userData.topY=.076;return g;
}
function crumpledVariant(i) {return variants[i]??=crumpled(i);}

export function laundryClothes() {
  const object=new THREE.Group(),G=P.garment;
  const material=new THREE.MeshStandardMaterial({color:G.colors[0],roughness:1,vertexColors:true});
  const loose=crumpledVariant(0);
  const folded=new RoundedBoxGeometry(G.w*.8,G.thick*1.8,G.d*.65,2,.005).translate(0,G.thick*.9,0);
  folded.setAttribute('color',new THREE.BufferAttribute(new Float32Array(folded.attributes.position.count*3).fill(1),3));
  const body=new THREE.Mesh(loose,material);body.castShadow=true;body.receiveShadow=true;object.add(body);
  const dirt=new THREE.Mesh(new THREE.CircleGeometry(.024,12).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x574937}));
  dirt.position.set(.015,.083,-.035);dirt.raycast=()=>{};object.add(dirt);
  let isFolded=false,variant=0;
  return {object,grip:[G.w*.2,G.thick,0],show(item){
    const next=!!item.machine.folded,idx=((Number(item.id.split('#')[1])||1)-1);
    if(next!==isFolded||variant!==idx%3){isFolded=next;variant=idx%3;body.geometry=next?folded:crumpledVariant(variant);dirt.position.y=next?G.thick*1.8+.004:.083;}
    material.color.setHex(G.colors[idx % G.colors.length]??G.colors[0]);
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
    for(const y of [.1,.24,.38,h-.012]) {box(w,.022,.014,0,y,side*d/2);box(.014,.022,d,side*w/2,y,0);}
  }
  const object=new THREE.Mesh(mergeGeometries(parts),new THREE.MeshStandardMaterial({color:0xd6cbb8,roughness:.9}));
  object.castShadow=true;object.receiveShadow=true;return object;
}
