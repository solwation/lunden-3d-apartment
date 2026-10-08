import {onWestBuilding,onWestAccess} from './sitebackdrop.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON } from './config.js';
import { onRoad, onWalk, pathStrip } from './roads.js';
import { riverAt, deckAt } from './riverbridge.js';
import { registerSnow, registerSeasonal } from './seasons.js';
const P = SITE.riverPark;
const random = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const inside = (x,z,poly) => { let yes=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
  const [a,b]=poly[i],[c,d]=poly[j]; if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)yes=!yes;
} return yes; };
export function inParkGlade(x,z) { return P.glades.some(g=>inside(x,z,g.polygon)); }
export function onParkPath(x,z,margin=0) {
  return P.paths.some(p=>p.path.slice(1).some(([c,d],i)=>{
    const[a,b]=p.path[i],dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-a-t*dx,z-b-t*dz)<p.w/2+margin;
  }));
}
export function parkDeckAt(x,z) {
  const b=P.woodBridge,[[ax,az],[bx,bz]]=b.ends,dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
  const t=((x-ax)*dx+(z-az)*dz)/(len*len),off=((x-ax)*-dz+(z-az)*dx)/len;
  return t>=0&&t<=1&&Math.abs(off)<=b.width/2?b.deckY:null;
}
function clear(x,z) {
  const r=riverAt(x,z);
  return z>64 && !onWestBuilding(x,z) && !onWestAccess(x,z,.5) && !inParkGlade(x,z) && !onParkPath(x,z,P.pathClearance) &&
    !onRoad(x,z,P.bridgeClearance) && !onWalk(x,z,.5) && deckAt(x,z)===null && parkDeckAt(x,z)===null &&
    r.distance>r.width/2+2 && !SITE.blocks.some(b=>x>b.x0-2&&x<b.x1+2&&z>b.z0-2&&z<b.z1+2);
}
// Stable, patch-constrained density sampling: a visual canopy interpretation, not measured individual trees.
export function parkTreeSpots(ground) {
  const rand=random(533),spots=[];
  for(const patch of P.patches) {
    const xs=patch.polygon.map(p=>p[0]),zs=patch.polygon.map(p=>p[1]),x0=Math.min(...xs),z0=Math.min(...zs);
    const dx=Math.max(...xs)-x0,dz=Math.max(...zs)-z0; let count=0;
    for(let k=0;k<patch.n*80&&count<patch.n;k++) {
      const x=x0+rand()*dx,z=z0+rand()*dz;
      if(!inside(x,z,patch.polygon)||!clear(x,z)||spots.some(t=>Math.hypot(t.x-x,t.z-z)<P.treeSpacing))continue;
      const s=P.treeScale[0]+rand()*(P.treeScale[1]-P.treeScale[0]);
      spots.push({x,z,y:ground(x,z),s,kind:'big',patch:patch.name});count++;
    }
  } return spots;
}
export function parkShrubSpots(ground) {
  const rand=random(1533),spots=[];
  for(let k=0;k<P.shrubCount*60&&spots.length<P.shrubCount;k++) {
    const p=SITE.river.path,i=Math.floor(rand()*(p.length-1)),t=rand(),[a,b]=p[i],[c,d]=p[i+1];
    const cx=a+(c-a)*t,cz=b+(d-b)*t,r=riverAt(cx,cz),side=rand()<.5?-1:1,off=r.width/2+3+rand()*r.bank*.65;
    const x=cx+r.nx*off*side,z=cz+r.nz*off*side;
    if(!clear(x,z)||!P.patches.some(p=>inside(x,z,p.polygon)))continue;
    spots.push({x,z,y:ground(x,z),s:P.shrubScale[0]+rand()*(P.shrubScale[1]-P.shrubScale[0])});
  }return spots;
}
export const parkShoreFeet=[];
/** Three merged background batches: surfaced paths, timber footbridge, low bank tussocks. */
export function buildRiverPark(ground, terrain=ground) {
  const group=new THREE.Group();group.name='river-park';
  const paths=P.paths.map(p=>pathStrip(p,w=>-w/2,w=>w/2,.025,terrain,c=>c.some(([x,z])=>z<64||x<-270||x>220||z>260)));
  const mat=new THREE.MeshStandardMaterial({color:0xb5ac90,roughness:1});registerSnow(mat,SEASON.snow.paving);
  const pathMesh=new THREE.Mesh(mergeGeometries(paths),mat);pathMesh.name='park-paths';pathMesh.receiveShadow=true;group.add(pathMesh);
  const b=P.woodBridge,[[ax,az],[bx,bz]]=b.ends,dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),wood=[];
  const box=(w,h,d,x,y,z)=>wood.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  box(b.width,b.slab,len,0,b.deckY-b.slab/2,0);
  for(const side of [-1,1])box(b.width,b.deckY-SITE.bridges.bedY,b.abutment,0,(b.deckY+SITE.bridges.bedY)/2,side*len/2);
  for(const side of [-1,1]) {
    box(b.railSize,b.railSize,len,side*b.width/2,b.deckY+b.rail,0);
    for(let z=-len/2;z<=len/2;z+=b.postStep)box(b.postSize,b.rail,b.postSize,side*b.width/2,b.deckY+b.rail/2,z);
  }
  const bridgeGeo=mergeGeometries(wood.map(g=>g.toNonIndexed()));bridgeGeo.rotateY(Math.atan2(dx,dz)).translate((ax+bx)/2,0,(az+bz)/2);
  const bridge=new THREE.Mesh(bridgeGeo,new THREE.MeshStandardMaterial({color:0x75634b,roughness:1}));bridge.name='park-timber-bridge';bridge.castShadow=bridge.receiveShadow=true;group.add(bridge);
  // Low waterside growth follows the actual slope. No floating planar green band or transparent layers.
  const rand=random(2533),pos=[];parkShoreFeet.length=0;
  for(let k=0;k<P.shoreCount*20&&parkShoreFeet.length<P.shoreCount;k++) {
    const p=SITE.river.path,i=Math.floor(rand()*(p.length-1)),t=rand(),[a,b]=p[i],[c,d]=p[i+1],cx=a+(c-a)*t,cz=b+(d-b)*t,r=riverAt(cx,cz);
    const off=r.width/2+P.shoreOffset[0]+rand()*(P.shoreOffset[1]-P.shoreOffset[0]),side=rand()<.5?-1:1,x=cx+r.nx*off*side,z=cz+r.nz*off*side;
    const y=ground(x,z);if(y<SITE.bridges.waterY+.03||z<64||onRoad(x,z,1)||onParkPath(x,z,.5)||parkDeckAt(x,z)!==null||deckAt(x,z)!==null)continue;
    const h=P.shoreHeight[0]+rand()*(P.shoreHeight[1]-P.shoreHeight[0]);parkShoreFeet.push({x,z,y,h});
    for(let j=0;j<P.shoreLeaves;j++){const a=j*Math.PI*2/P.shoreLeaves+rand(),d=P.shoreRadius[0]+rand()*(P.shoreRadius[1]-P.shoreRadius[0]);
      pos.push(x+Math.cos(a)*d,y,z+Math.sin(a)*d,x,y+h,z,x+Math.cos(a+.9)*d,y,z+Math.sin(a+.9)*d);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
  const shoreMat=new THREE.MeshStandardMaterial({color:0x6e8342,roughness:1,side:THREE.DoubleSide});
  registerSeasonal(month=>shoreMat.color.setHex(SEASON.snowMonths.includes(month)?0xaba590:month>=9?0x8f8350:0x6e8342));
  const shore=new THREE.Mesh(geo,shoreMat);shore.name='park-shore-growth';shore.receiveShadow=true;group.add(shore);
  group.userData.paths=P.paths;return group;
}
