import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SITE, COLORS, ELEVATION} from './config.js';
import {pathStrip} from './roads.js';
const B=SITE.bridges,R=SITE.river;
const along=[0];for(let i=1;i<R.path.length;i++)along.push(along[i-1]+Math.hypot(R.path[i][0]-R.path[i-1][0],R.path[i][1]-R.path[i-1][1]));
export const bridgeRecords=['road','gc'].map(kind=>{
 const s=B[kind],[a,b]=s.ends,full=Math.hypot(b[0]-a[0],b[1]-a[1]),len=s.length??full;
 return {kind,...s,x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,dx:(b[0]-a[0])/full,dz:(b[1]-a[1])/full,len,full};
});
const local=(r,x,z)=>[(x-r.x)*r.dx+(z-r.z)*r.dz,-(x-r.x)*r.dz+(z-r.z)*r.dx];
export function deckAt(x,z){return bridgeRecords.some(r=>{const[a,b]=local(r,x,z);return Math.abs(a)<=(r.full??r.len)/2&&Math.abs(b)<=r.width/2})?B.deckY:null;}
/** The underside of the deck over (x, z) (each bridge has its own slab thickness: road .45, GC .18, #1289), else null. */
export function deckUnderAt(x,z){const r=bridgeRecords.find(r=>{const[a,b]=local(r,x,z);return Math.abs(a)<=r.len/2&&Math.abs(b)<=r.width/2});return r?B.deckY-r.slab:null;}
export function roadBridgeSpan(x,z){const r=bridgeRecords[0];return Math.abs(local(r,x,z)[0])<=r.len/2;}
/** Nearest sourced river segment, with interpolated visual width/bank estimates. */
// #1358: riverAt runs several times per groundY/water query (thousands per walking frame), so the scan allocates nothing, only builds
// the result for the winning segment, and the last answer is reused (the same point is asked repeatedly within a step). Same values as before.
let lastX=NaN,lastZ=NaN,lastR=null;
export function riverAt(x,z){
 if(x===lastX&&z===lastZ)return lastR;
 const P=R.path;let bi=-1,bd=Infinity;
 for(let i=1;i<P.length;i++){
  const a=P[i-1][0],b=P[i-1][1],dx=P[i][0]-a,dz=P[i][1]-b,len=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(len*len))),
   distance=Math.hypot(x-a-t*dx,z-b-t*dz);
  if(distance<bd){bd=distance;bi=i;}}
 let best={distance:Infinity};
 if(bi>0){const i=bi,[a,b]=P[i-1],[c,d]=P[i],dx=c-a,dz=d-b,len=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(len*len)));
  const interp=(values,fallback)=>values?values[i-1]+(values[i]-values[i-1])*t:fallback;
  best={distance:bd,x:a+t*dx,z:b+t*dz,nx:-dz/len,nz:dx/len,width:interp(R.widths,R.width),bank:interp(R.banks,R.bank)*(R.bankScale??1),segment:i,t,along:along[i-1]+len*t};}
 lastX=x;lastZ=z;lastR=best;return best;}
export function riverDistance(x,z){return riverAt(x,z).distance;}
// #1350: a relative interpretation of ground data; preserve the road crossing's existing vertical datum.
const fallAnchor=riverAt(bridgeRecords[0].x,bridgeRecords[0].z).along;
const fall=r=>-(r.along-fallAnchor)*(R.fall?.perM??0);
export const riverFallAt=(x,z)=>fall(riverAt(x,z));
export const waterYAt=(x,z,r=riverAt(x,z))=>B.waterY+fall(r);
export const shoreYAt=(x,z)=>(B.shoreY??-5.5)+riverFallAt(x,z);
/** Retained for interface compatibility (#1285). */
export function underpassCut(x,z){return 0;}
export const underpassAt=(x,z)=>deckAt(x,z)!==null;
/** Rectangles [cx, cz, hx, hz, dx, dz] (centre, half extents along/across the bridge, its direction) of the road bridge's piers, for collision under the deck. */
export function pierBoxes(){const out=[];for(const r of bridgeRecords)if(r.kind==='road')for(const z of [-r.len/3,0,r.len/3])for(const side of [-1,1]){
 const lx=side*r.width*.29,wx=r.x+lx*r.dz+z*r.dx,wz=r.z-lx*r.dx+z*r.dz;out.push({x:wx,z:wz,half:r.pier/2+(B.underpass?.pier??B.pierMargin??.2),dx:r.dx,dz:r.dz});}return out;}
/** #1285/#1350: channel, shore and floodplain follow the same relative longitudinal grade.
 * The bank cross-section remains a visual estimate; its outer grade blends into the existing terrain within ELEVATION.river[0]. */
export function riverGround(x,z,base){
 const r=riverAt(x,z),w2=r.width/2,d=r.distance,dy=fall(r),bedY=B.bedY+dy,shoreY=(B.shoreY??-5.5)+dy,bankSlope=Math.min(r.bank*.4,2.5),shoreSpan=B.shoreSpan??7.5,valleySpan=B.valleySpan??8.5;
 const sm=t=>t*t*(3-2*t);
 if(d<=w2)return bedY;
 if(d<w2+bankSlope){const u=sm((d-w2)/bankSlope);return bedY+(shoreY-bedY)*u;}
 const shoreEnd=w2+bankSlope+shoreSpan;
 if(d<shoreEnd)return shoreY;
 if(d<shoreEnd+valleySpan){const u=sm((d-shoreEnd)/valleySpan);return shoreY+(base+dy-shoreY)*u;}
 // Fade the floodplain's relative grade back into the existing terrain inside its protected river corridor.
 const end=shoreEnd+valleySpan,reach=Math.max(end+1e-3,ELEVATION.river[0]),u=Math.max(0,Math.min(1,(d-end)/(reach-end)));
 return base+dy*(1-sm(u));}

/** Two background bridges, merged by material, independent of the walking boundary. No new lights or render passes. */
export function buildRiverBridges(){
 const group=new THREE.Group();group.name='river-bridges';const parts={concrete:[],steel:[],asphalt:[],water:[]};
 const box=(kind,w,h,d,x,y,z)=>parts[kind].push(new THREE.BoxGeometry(w,h,d).translate(x,y,z));
 const beam=(kind,a,b,size)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),v=end.clone().sub(start),g=new THREE.BoxGeometry(size,v.length(),size);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());parts[kind].push(g);};
 for(const r of bridgeRecords){const before=Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v.length])),y=B.deckY;
  // Construct along local +z then rotate into the registered centreline.
  box('concrete',r.width,r.slab,r.len,0,y-r.slab/2,0);
  box('asphalt',r.width-.3,.035,r.len,0,y+.005,0);
  const railY=y+(r.kind==='gc'?r.truss:B.rail),w=r.width/2-.05;
  for(const side of [-1,1]){
   beam('steel',[side*w,railY,-r.len/2],[side*w,railY,r.len/2],r.kind==='gc'?r.steel:B.post);
   beam('steel',[side*w,y+.12,-r.len/2],[side*w,y+.12,r.len/2],r.kind==='gc'?r.steel:B.post);
   if(r.kind==='gc'){
    for(let i=0;i<=r.panels;i++){const z=-r.len/2+i*r.len/r.panels;beam('steel',[side*w,y+.12,z],[side*w,railY,z],r.steel);
     if(i<r.panels)beam('steel',[side*w,i%2?railY:y+.12,z],[side*w,i%2?y+.12:railY,z+r.len/r.panels],r.steel);}
    for(let z=-r.len/2;z<r.len/2;z+=B.railStep)beam('steel',[side*w,y+.15,z],[side*w,y+B.rail,z],B.post*.55);
   }else{
    for(let z=-r.len/2;z<=r.len/2;z+=B.railStep)beam('steel',[side*w,y,z],[side*w,railY,z],B.post);
    for(const height of [.45,.78])beam('steel',[side*w,y+height,-r.len/2],[side*w,y+height,r.len/2],B.post*.7);
   }
  }
  for(const end of [-1,1])box('concrete',r.width+.6,y-B.bedY,1.25,0,(y+B.bedY)/2,end*r.len/2);
  if(r.kind==='road')for(const z of [-r.len/3,0,r.len/3])for(const side of [-1,1]){
   const x=side*r.width*.29;box('concrete',r.pier,y-r.slab-B.bedY,r.pier,x,(y-r.slab+B.bedY)/2,z);
   box('concrete',r.foot,.45,r.foot,x,B.bedY+.225,z);
  }
  const matrix=new THREE.Matrix4().makeRotationY(Math.atan2(r.dx,r.dz)).setPosition(r.x,0,r.z);
  for(const[k,v]of Object.entries(parts))for(let i=before[k];i<v.length;i++)v[i].applyMatrix4(matrix);
 }
 const gc=bridgeRecords[1],ends=[-1,1].map(s=>[gc.x+gc.dx*gc.len/2*s,gc.z+gc.dz*gc.len/2*s]);
 for(let i=0;i<2;i++){const[x,z]=ends[i],sign=i===0?-1:1;parts.asphalt.push(pathStrip({path:[[x,z],[x+.8,z+sign*B.approach],[20,z+sign*B.approach*1.6]],w:B.gc.width},w=>-w/2,w=>w/2,.025,()=>B.deckY));}
 parts.water.push(pathStrip({path:R.path,w:R.widths??R.width},w=>-w/2,w=>w/2,0,waterYAt));
 const mats={concrete:new THREE.MeshStandardMaterial({color:0xaaa79e,roughness:.95}),steel:new THREE.MeshStandardMaterial({color:0x575f5b,metalness:.45,roughness:.55}),asphalt:new THREE.MeshStandardMaterial({color:COLORS.asphalt,roughness:.85}),water:new THREE.MeshStandardMaterial({color:COLORS.water,roughness:.15,metalness:.2})};
 for(const[k,list]of Object.entries(parts)){const geo=mergeGeometries(list.map(g=>g.index?g.toNonIndexed():g));const mesh=new THREE.Mesh(geo,mats[k]);mesh.name=`bridges-${k}`;mesh.castShadow=k!=='water';mesh.receiveShadow=true;group.add(mesh);list.forEach(g=>g.dispose());}
 group.userData.records=bridgeRecords;return group;
}
