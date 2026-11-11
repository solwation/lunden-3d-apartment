import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {DUCKS} from './config.js';
/** Identical low-poly silhouette/topology; female mottling, eye stripe and speculum are vertex colours. */
export function duckModel(female=false, rigged=false){
 const parts=[],c=new THREE.Color(),M=DUCKS.model;
 const blob=(p,s,color,index)=>{if(rigged&&index===6&&p[1]>.3){p=[Math.sign(p[0])*.116,.646,.355];s=[.012,.012,.011];}const g=new THREE.SphereGeometry(1,...M.segments);g.deleteAttribute('uv');g.scale(...s);g.translate(...p);if(rigged&&index===5){const q=g.attributes.position;for(let i=0;i<q.count;i++)q.setX(i,q.getX(i)*(1-.7*THREE.MathUtils.clamp((-.36-q.getZ(i))/.17,0,1)));g.computeVertexNormals();}const a=new Float32Array(g.attributes.position.count*3),pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
   c.setHex(color);const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
   if(female&&(index<4||index===7)){const hash=Math.sin(Math.round(x*80)*127.1+Math.round(y*80)*311.7+Math.round(z*80)*74.7)*43758.5453;c.multiplyScalar(M.speckle[0]+(hash-Math.floor(hash))*(M.speckle[1]-M.speckle[0]));}
   if(index===0&&Math.abs(x)>.16&&z<-.04&&y>.28)c.setHex(M.wingBlue);
   if(female&&index===3&&Math.abs(x)>.065&&y>.60&&y<.66&&z>.24)c.setHex(M.eyeStripe);
   if(female&&index===4&&y>.59)c.multiplyScalar(.5);
   if(rigged&&!female&&index===2&&y>.535&&y<.59)c.setHex(0xf2eadb);
   if(rigged&&!female&&index===2&&y<.53)c.setHex(0x603627);
   if(rigged&&index===7&&z<-.08&&z>-.23&&y>.33)c.setHex(M.wingBlue);
   c.toArray(a,i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(a,3));
  if(rigged){
   const ids=new Uint16Array(pos.count*4),weights=new Float32Array(pos.count*4);
   const joint=index===8?2:index===9?(p[0]>0?10:12):index===6?(p[1]>.3?3:p[0]>0?11:13):index===7?(p[0]>0?5:7):[1,1,2,3,4,9][index];
   for(let i=0;i<pos.count;i++){ids[i*4]=joint;weights[i*4]=1;}
   g.setAttribute('skinIndex',new THREE.BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
  }
  parts.push(g);
 };
 M.blobs.forEach(([p,s,color],i)=>blob(p,s,female?M.female[i]:color,i));
 for(const side of [-1,1])for(const[p,s,color]of M.paired)blob([side*p[0],p[1],p[2]],s,color,6);
 if(rigged&&!female)blob([0,.50,.245],[.119,.015,.116],0xf2eadb,8);
 if(rigged)for(const side of [-1,1])blob([side*.175,.34,-.065],[.055,.11,.25],female?0x7a6850:0x716c63,7);
 if(rigged)for(const side of [-1,1])blob([side*.12,.09,.04],[.017,.065,.018],0xd88c24,9);
 const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}

// Same bill coordinates and sex-specific markings as the retained game geometry.
const rigCache=new Map();
export function duckRigGeometry(female=false){if(!rigCache.has(female))rigCache.set(female,duckModel(female,true));return rigCache.get(female);}
