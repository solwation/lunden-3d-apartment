import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SITE, COLORS} from './config.js';
import {pathStrip} from './roads.js';
const B=SITE.bridges,R=SITE.river;
export const bridgeRecords=['road','gc'].map(kind=>{
 const s=B[kind],[a,b]=s.ends,full=Math.hypot(b[0]-a[0],b[1]-a[1]),len=s.length??full;
 return {kind,...s,x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,dx:(b[0]-a[0])/full,dz:(b[1]-a[1])/full,len};
});
const local=(r,x,z)=>[(x-r.x)*r.dx+(z-r.z)*r.dz,-(x-r.x)*r.dz+(z-r.z)*r.dx];
export function deckAt(x,z){return bridgeRecords.some(r=>{const[a,b]=local(r,x,z);return Math.abs(a)<=r.len/2&&Math.abs(b)<=r.width/2})?B.deckY:null;}
export function roadBridgeSpan(x,z){const r=bridgeRecords[0];return Math.abs(local(r,x,z)[0])<=r.len/2;}
/** Nearest sourced river segment, with interpolated visual width/bank estimates. */
export function riverAt(x,z){let best={distance:Infinity};for(let i=1;i<R.path.length;i++){
 const[a,b]=R.path[i-1],[c,d]=R.path[i],dx=c-a,dz=d-b,len=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(len*len)));
 const distance=Math.hypot(x-a-t*dx,z-b-t*dz);if(distance<best.distance){
 const interp=(values,fallback)=>values?values[i-1]+(values[i]-values[i-1])*t:fallback;
 best={distance,x:a+t*dx,z:b+t*dz,nx:-dz/len,nz:dx/len,width:interp(R.widths,R.width),bank:interp(R.banks,R.bank),segment:i,t};}}
 return best;}
export function riverDistance(x,z){return riverAt(x,z).distance;}
export function riverGround(x,z,base){const r=riverAt(x,z),u=Math.max(0,Math.min(1,(r.distance-r.width/2)/r.bank));return B.bedY+(base-B.bedY)*(u*u*(3-2*u));}

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
 parts.water.push(pathStrip({path:R.path,w:R.widths??R.width},w=>-w/2,w=>w/2,0,()=>B.waterY));
 const mats={concrete:new THREE.MeshStandardMaterial({color:0xaaa79e,roughness:.95}),steel:new THREE.MeshStandardMaterial({color:0x575f5b,metalness:.45,roughness:.55}),asphalt:new THREE.MeshStandardMaterial({color:COLORS.asphalt,roughness:.85}),water:new THREE.MeshStandardMaterial({color:COLORS.water,roughness:.15,metalness:.2})};
 for(const[k,list]of Object.entries(parts)){const geo=mergeGeometries(list.map(g=>g.index?g.toNonIndexed():g));const mesh=new THREE.Mesh(geo,mats[k]);mesh.name=`bridges-${k}`;mesh.castShadow=k!=='water';mesh.receiveShadow=true;group.add(mesh);list.forEach(g=>g.dispose());}
 group.userData.records=bridgeRecords;return group;
}
