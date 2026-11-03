import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {DUCKS} from './config.js';
/** Identical low-poly silhouette/topology; female mottling, eye stripe and speculum are vertex colours. */
export function duckModel(female=false){
 const parts=[],c=new THREE.Color(),M=DUCKS.model;
 const blob=(p,s,color,index)=>{const g=new THREE.SphereGeometry(1,...M.segments);g.deleteAttribute('uv');g.scale(...s);g.translate(...p);const a=new Float32Array(g.attributes.position.count*3),pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
   c.setHex(color);const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
   if(female&&index<4){const hash=Math.sin(Math.round(x*80)*127.1+Math.round(y*80)*311.7+Math.round(z*80)*74.7)*43758.5453;c.multiplyScalar(M.speckle[0]+(hash-Math.floor(hash))*(M.speckle[1]-M.speckle[0]));}
   if(index===0&&Math.abs(x)>.16&&z<-.04&&y>.28)c.setHex(M.wingBlue);
   if(female&&index===3&&Math.abs(x)>.065&&y>.60&&y<.66&&z>.24)c.setHex(M.eyeStripe);
   if(female&&index===4&&y>.59)c.multiplyScalar(.5);
   c.toArray(a,i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(a,3));parts.push(g);
 };
 M.blobs.forEach(([p,s,color],i)=>blob(p,s,female?M.female[i]:color,i));
 for(const side of [-1,1])for(const[p,s,color]of M.paired)blob([side*p[0],p[1],p[2]],s,color,6);
 const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
