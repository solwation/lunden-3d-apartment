import * as THREE from 'three';
import { NEIGHBOR_OPENINGS as P } from './config.js';
let environment;
/** Small shared procedural outdoor reflection, view-dependent through envMap; no live mirror passes. */
export function neighborGlass() {
  if (!environment) {
    const faces = Array.from({length:6},(_,i)=>{
      const c=document.createElement('canvas');c.width=c.height=P.reflectionSize;const g=c.getContext('2d'),n=c.width;
      const gradient=g.createLinearGradient(0,0,0,n);gradient.addColorStop(0,P.sky);gradient.addColorStop(.56,P.horizon);gradient.addColorStop(.6,P.ground);gradient.addColorStop(1,P.groundDark);
      g.fillStyle=gradient;g.fillRect(0,0,n,n);g.fillStyle=P.silhouette;
      if(i!==2) for(let j=0;j<7;j++){const h=n*(.03+(j*7+i*3)%5*.014);g.fillRect(j*n/7,n*.58-h,n/9,h);}
      return c;
    });
    environment=new THREE.CubeTexture(faces);environment.colorSpace=THREE.SRGBColorSpace;environment.needsUpdate=true;
  }
  return new THREE.MeshPhysicalMaterial({color:P.glassColor,roughness:P.roughness,metalness:P.metalness,clearcoat:1,clearcoatRoughness:P.clearcoatRoughness,envMap:environment,envMapIntensity:P.reflectionDay,transparent:false,opacity:1});
}
