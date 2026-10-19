import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PADDOCK as P } from './config.js';
import { footprintGround } from './paddockshelter.js';

// #1345: reusable scenery only. Ground-following bedding and front-beam greenery, plus warm bulbs; two draws, no lights.
const color=(g,hex)=>{const c=new T.Color(hex),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3)a.set([c.r,c.g,c.b],i);g.setAttribute('color',new T.BufferAttribute(a,3));return g;};
function merged(parts){parts.forEach(g=>g.deleteAttribute('uv'));const flat=parts.map(g=>g.index?g.toNonIndexed():g),g=mergeGeometries(flat);new Set([...parts,...flat]).forEach(q=>q.dispose());return g;}
export function shelterWinter(ground,spot){
 const group=new T.Group();group.name='shelter-winter';group.visible=false;if(!spot)return group;
 const S=P.shelter,C=S.winter,{x,z,yaw}=spot,base=footprintGround(ground,x,z,yaw).max,cs=Math.cos(yaw),sn=Math.sin(yaw);
 group.position.set(x,base,z);group.rotation.y=yaw;group.updateMatrix();group.matrixAutoUpdate=false;
 const floor=(lx,lz)=>ground(x+lx*cs+lz*sn,z-lx*sn+lz*cs)-base,parts=[],bulbs=[];
 let seed=1345;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 // The existing worn-land overlay is ground+.07m; the small configured offset keeps the bedding clear of it.
 const hx=S.w/2-C.straw.inset,hz=S.d/2-C.straw.inset,positions=[],cols=[],nx=C.straw.grid,nz=Math.max(2,Math.round(nx*hz/hx));
 const add=(a,b,c,hex)=>{positions.push(...a,...b,...c);const q=new T.Color(hex);for(let i=0;i<3;i++)cols.push(q.r,q.g,q.b);};
 for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
  const ax=-hx+2*hx*i/nx,bx=-hx+2*hx*(i+1)/nx,az=-hz+2*hz*j/nz,bz=-hz+2*hz*(j+1)/nz;
  const v=(px,pz)=>[px,floor(px,pz)+C.straw.offset+C.straw.thickness,pz],a=v(ax,az),b=v(bx,az),c=v(bx,bz),d=v(ax,bz),hex=C.straw.colors[1];add(a,c,b,hex);add(a,d,c,hex);
 }
 const bed=new T.BufferGeometry();bed.setAttribute('position',new T.Float32BufferAttribute(positions,3));bed.setAttribute('color',new T.Float32BufferAttribute(cols,3));bed.computeVertexNormals();parts.push(bed);
 for(let i=0;i<C.straw.blades;i++){
  const px=(rnd()*2-1)*(hx-.12),pz=(rnd()*2-1)*(hz-.12),len=C.straw.bladeLength*(.6+rnd()*.8),a=rnd()*Math.PI*2;
  parts.push(color(new T.BoxGeometry(len,C.straw.bladeWidth,C.straw.bladeWidth).rotateY(a).translate(px,floor(px,pz)+C.straw.offset+C.straw.thickness+.012,pz),C.straw.colors[i%C.straw.colors.length]));
 }
 const half=S.w/2-.12,hs=S.h-.4,front=S.d/2+.045,curve=t=>hs+.14-C.garland.drop-C.garland.sag*Math.sin(t*Math.PI*2)**2;
 const count=Math.ceil(2*half/C.garland.step),cord=[];
 for(let i=0;i<=count;i++){
  const t=i/count,px=-half+2*half*t,py=curve(t);cord.push(new T.Vector3(px,py,front));
  const leaf=color(new T.ConeGeometry(C.garland.radius,C.garland.leafLength,5).rotateZ((i%2?1:-1)*1.15).translate(px,py,front),C.garland.colors[i%C.garland.colors.length]);parts.push(leaf);
 }
 parts.push(color(new T.TubeGeometry(new T.CatmullRomCurve3(cord),count,.012,4,false),0x26301a));
 for(let i=0;i<C.lights.count;i++){
  const t=(i+.5)/C.lights.count,px=-half+2*half*t,py=curve(t)-C.lights.drop;
  parts.push(color(new T.CylinderGeometry(.006,.006,C.lights.drop,4).translate(px,py+C.lights.drop/2,front+.035),0x30271b));
  bulbs.push(color(new T.SphereGeometry(C.lights.radius,6,4).translate(px,py,front+.035),C.lights.colors[i%C.lights.colors.length]));
 }
 const decor=new T.Mesh(merged(parts),new T.MeshStandardMaterial({vertexColors:true,roughness:1,emissive:0x30200b,emissiveIntensity:.35}));decor.name='shelter-straw-garland';
 const glow=new T.Mesh(merged(bulbs),new T.MeshBasicMaterial({vertexColors:true,toneMapped:false}));glow.name='shelter-winter-bulbs';
 for(const m of[decor,glow]){m.raycast=()=>{};m.userData.noDetail=true;m.matrixAutoUpdate=false;group.add(m);}return group;
}
