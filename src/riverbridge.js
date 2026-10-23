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

/** #1530: the road bridge's photo-based cross-section (SITE.bridges.roadDeck, all *guess*), built in the bridge's local frame
 * (x across, +x = model east; z along). Only the existing concrete/steel/asphalt batches are used; colours are vertex colours. */
function roadDeckParts(r,y,box,beam,slats){
 const D=B.roadDeck,C=D.colors,w=r.width/2,L=r.len,e=D.edge,P=D.parapet,Q=D.plate,G=D.guard;
 // Edge beams (kantbalkar): from the slab's underside (clearance unchanged) to e.up above the deck, slightly proud of the slab.
 for(const side of [-1,1])box('concrete',e.w+e.out,r.slab+e.up,L,side*(w-e.w+(e.w+e.out)/2),y-r.slab+(r.slab+e.up)/2,0);
 // West: verge with guard rail, granite kerb, raised footway (top D.walk.h over the deck).
 const walkIn=-w+e.w+D.walk.w,kerbIn=walkIn+D.kerb.w,verge=kerbIn+D.verge;
 box('asphalt',D.walk.w,D.walk.h,L,-w+e.w+D.walk.w/2,y+D.walk.h/2,0);
 box('concrete',D.kerb.w,D.kerb.h,L,walkIn+D.kerb.w/2,y+D.kerb.h/2,0,C.granite);
 box('concrete',D.kerb.w,D.kerb.h,L,w-e.w-D.kerb.w/2,y+D.kerb.h/2,0,C.granite); // east kerb at the carriageway edge
 // Guard rails (vägräcke): a flat beam facing the carriageway on posts, west on the verge, east inside the kerb.
 for(const gx of [verge-G.gap,w-e.w-D.kerb.w-G.gap]){const s=Math.sign(gx),face=gx-s*(G.post/2+G.t/2);
  box('steel',G.t,G.beam,L,face,y+G.h-G.beam/2,0,C.galv);
  for(let z=-L/2+.4;z<=L/2-.4+1e-6;z+=G.step)beam('steel',[gx,y,z],[gx,y+G.h,z],G.post,C.galv,true);}
 // West parapet (photo close-up): posts, a wide flat top rail, mid/bottom rails, X braces per bay and close vertical bars.
 const px=-w+P.inset,base=y+e.up,n=Math.max(1,Math.round(L/P.bay)),bay=L/n;
 box('steel',P.top[0],P.top[1],L,px,y+P.h-P.top[1]/2,0,C.green);
 for(const h of [P.h-P.mid,P.low])box('steel',.05,.035,L,px,y+h,0,C.green);
 for(let i=0;i<=n;i++){const z=-L/2+i*bay;beam('steel',[px,base,z],[px,y+P.h-P.top[1],z],P.post,C.green,true);
  if(i<n)for(const k of [0,1])beam('steel',[px+(k?.01:-.01),base,z+(k?bay:0)],[px+(k?.01:-.01),y+P.h-P.top[1],z+(k?0:bay)],P.brace[0],C.green,true,P.brace[1]);}
 slats(px,y+P.low,y+P.h-P.mid,-L/2,L/2,P.slatStep,P.slat,C.green);
 // East: black plate edge (massiv plåtkant) on the edge beam with a steel handrail on posts.
 const qx=w-P.inset,m=Math.max(1,Math.round(L/Q.bay));
 box('steel',Q.t,Q.h-e.up,L,qx,y+e.up+(Q.h-e.up)/2,0,C.black);
 box('steel',.06,.05,L,qx,y+Q.rail,0,C.black);
 for(let i=0;i<=m;i++)beam('steel',[qx,y+e.up,-L/2+i*L/m],[qx,y+Q.rail,-L/2+i*L/m],Q.post,C.black,true);
}

/** Two background bridges, merged by material, independent of the walking boundary. No new lights or render passes. */
export function buildRiverBridges(approachGround=()=>B.deckY){
 const group=new THREE.Group();group.name='river-bridges';const parts={concrete:[],steel:[],asphalt:[],water:[]};
 // Concrete and steel carry vertex colours (#1530: kerbs, green/black/galvanised steel) so they stay one batch each.
 const base={concrete:0xaaa79e,steel:0x575f5b},col=new THREE.Color();
 const add=(kind,g,hex)=>{if(g.index)g=g.toNonIndexed();if(base[kind]!==undefined){col.setHex(hex??base[kind]);const n=g.attributes.position.count,a=new Float32Array(n*3);for(let i=0;i<n;i++)a.set([col.r,col.g,col.b],i*3);g.setAttribute('color',new THREE.BufferAttribute(a,3));}parts[kind].push(g);};
 const box=(kind,w,h,d,x,y,z,hex)=>add(kind,new THREE.BoxGeometry(w,h,d).translate(x,y,z),hex);
 // `open` drops the two end caps (hidden against rails/deck) to save triangles; `depth` makes a flat bar.
 const beam=(kind,a,b,size,hex,open=false,depth=size)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),v=end.clone().sub(start);let g=new THREE.BoxGeometry(depth,v.length(),size);
  if(open){g=g.toNonIndexed();for(const k of Object.keys(g.attributes)){const at=g.attributes[k],s=at.itemSize;g.setAttribute(k,new THREE.BufferAttribute(new Float32Array([...at.array.slice(0,12*s),...at.array.slice(24*s)]),s));}}
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());add(kind,g,hex);};
 // Close vertical bars as one geometry: only the two broad faces of each flat bar (4 triangles), seen from road and river.
 const slats=(x,y0,y1,z0,z1,step,[wd,th],hex)=>{const pos=[],nor=[],uv=[];
  for(let z=z0+step/2;z<z1;z+=step)for(const s of [-1,1]){const fx=x+s*th/2,a=z-wd/2,b=z+wd/2,q=s<0?[[a,y0],[b,y0],[b,y1],[a,y0],[b,y1],[a,y1]]:[[a,y0],[b,y1],[b,y0],[a,y0],[a,y1],[b,y1]];
   for(const[zz,yy]of q){pos.push(fx,yy,zz);nor.push(s,0,0);uv.push(0,0);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));add('steel',g,hex);};
 for(const r of bridgeRecords){const before=Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v.length])),y=B.deckY;
  // Construct along local +z then rotate into the registered centreline.
  box('concrete',r.width,r.slab,r.len,0,y-r.slab/2,0);
  box('asphalt',r.width-.3,.035,r.len,0,y+.005,0);
  if(r.kind==='gc'){const railY=y+r.truss,w=r.width/2-.05,c=B.roadDeck.colors.gcSteel;
   for(const side of [-1,1]){
    beam('steel',[side*w,railY,-r.len/2],[side*w,railY,r.len/2],r.steel,c);
    beam('steel',[side*w,y+.12,-r.len/2],[side*w,y+.12,r.len/2],r.steel,c);
    for(let i=0;i<=r.panels;i++){const z=-r.len/2+i*r.len/r.panels;beam('steel',[side*w,y+.12,z],[side*w,railY,z],r.steel,c);
     if(i<r.panels)beam('steel',[side*w,i%2?railY:y+.12,z],[side*w,i%2?y+.12:railY,z+r.len/r.panels],r.steel,c);}
    for(let z=-r.len/2;z<r.len/2;z+=B.railStep)beam('steel',[side*w,y+.15,z],[side*w,y+B.rail,z],B.post*.55,c);
   }
  }else roadDeckParts(r,y,box,beam,slats);
  for(const end of [-1,1])box('concrete',r.width+.6,y-B.bedY,1.25,0,(y+B.bedY)/2,end*r.len/2);
  if(r.kind==='road')for(const z of [-r.len/3,0,r.len/3])for(const side of [-1,1]){
   const x=side*r.width*.29;box('concrete',r.pier,y-r.slab-B.bedY,r.pier,x,(y-r.slab+B.bedY)/2,z);
   box('concrete',r.foot,.45,r.foot,x,B.bedY+.225,z);
  }
  const matrix=new THREE.Matrix4().makeRotationY(Math.atan2(r.dx,r.dz)).setPosition(r.x,0,r.z);
  for(const[k,v]of Object.entries(parts))for(let i=before[k];i<v.length;i++)v[i].applyMatrix4(matrix);
 }
 const gc=bridgeRecords[1],ends=[-1,1].map(s=>[gc.x+gc.dx*gc.len/2*s,gc.z+gc.dz*gc.len/2*s]);
 for(let i=0;i<2;i++){const[x,z]=ends[i],sign=i===0?-1:1;parts.asphalt.push(pathStrip({path:[[x,z],[x+.8,z+sign*B.approach],[20,z+sign*B.approach*1.6]],w:B.gc.width},w=>-w/2,w=>w/2,.025,approachGround));}
 parts.water.push(pathStrip({path:R.path,w:R.widths??R.width},w=>-w/2,w=>w/2,0,waterYAt));
 const mats={concrete:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.95}),steel:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,metalness:.45,roughness:.55}),asphalt:new THREE.MeshStandardMaterial({color:COLORS.asphalt,roughness:.85}),water:new THREE.MeshStandardMaterial({color:COLORS.water,roughness:.15,metalness:.2})};
 for(const[k,list]of Object.entries(parts)){const geo=mergeGeometries(list.map(g=>g.index?g.toNonIndexed():g));const mesh=new THREE.Mesh(geo,mats[k]);mesh.name=`bridges-${k}`;mesh.castShadow=k!=='water';mesh.receiveShadow=true;group.add(mesh);list.forEach(g=>g.dispose());}
 group.userData.records=bridgeRecords;return group;
}
