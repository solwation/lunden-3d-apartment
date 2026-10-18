import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON, DECAL_OFFSET, PARKING_LOT } from './config.js';
import { pathStrip, onRoad, onWalk } from './roads.js';
import { registerSnow } from './seasons.js';
import { buildSchoolFacade, schoolTextures } from './schoolfacade.js';
import { buildCampusFacade } from './campusfacades.js';
import { TowerClock } from './towerclock.js';
import { parkingLots, onEastRoad, onEastBuildingAt } from './parkinglayout.js';
import { buildKarpFacade, karpBrickTexture } from './karpfacade.js';
const W=SITE.west;
const ring=p=>(p[0][0]===p[p.length-1][0]&&p[0][1]===p[p.length-1][1]?p.slice(0,-1):p);
const shape=poly=>new THREE.Shape(ring(poly).map(([x,z])=>new THREE.Vector2(x,-z)));
const strip=(a,b,low,top)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([a[0],low,a[1],b[0],low,b[1],b[0],top[1],b[1],a[0],low,a[1],b[0],top[1],b[1],a[0],top[0],a[1]],3));g.computeVertexNormals();return g;};
const plain=g=>{g=g.index?g.toNonIndexed():g;g.deleteAttribute('uv');return g;};
const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
export const onWestBuilding=(x,z)=>W.buildings.some(b=>inside(x,z,b.polygon));
export function onWestAccess(x,z,margin=0){return [...W.paths,...W.access].some(p=>p.polygon?inside(x,z,p.polygon):p.path.slice(1).some(([c,d],i)=>{
 const[a,b]=p.path[i],dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a-t*dx,z-b-t*dz)<p.w/2+margin;
}));}
export function westTreeSpots(ground){return W.trees.filter(([x,z])=>!onRoad(x,z,1)&&!onWalk(x,z,.5)&&!onWestBuilding(x,z)&&!onWestAccess(x,z,.5)).map(([x,z,s])=>({x,z,s,y:ground(x,z),kind:'big',patch:'west-street'}));}
export const onEastBuilding=(x,z)=>SITE.east.buildings.some(b=>inside(x,z,b.polygon)&&!(b.holes??[]).some(h=>inside(x,z,h)));
export function onEastAccess(x,z,margin=0){return [...SITE.east.paths,...SITE.east.access].some(p=>p.polygon?inside(x,z,p.polygon):p.path.slice(1).some(([c,d],i)=>{
 const[a,b]=p.path[i],dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a-t*dx,z-b-t*dz)<p.w/2+margin;
}));}
const campusAccess=(E,x,z,margin=0)=>[...E.paths,...E.access].some(p=>p.polygon?inside(x,z,p.polygon):p.path.slice(1).some(([c,d],i)=>{const[a,b]=p.path[i],dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a-t*dx,z-b-t*dz)<p.w/2+margin;}));
export const northTreeSpots=ground=>campusTreeSpots(SITE.north,'north',ground);
export const eastTreeSpots=ground=>campusTreeSpots(SITE.east,'east',ground);
function campusTreeSpots(E,key,ground){const points=E.trees.map(([x,z,source])=>({x,z,source}));
 for(const row of E.treeRows){const[a,b]=row.from,[c,d]=row.to,len=Math.hypot(c-a,d-b);for(let t=0;t<=len;t+=row.step)points.push({x:a+(c-a)*t/len,z:b+(d-b)*t/len,source:'aerial '+row.name});}
 let seed=key==='north'?530:535;const rand=()=>((seed=seed*16807%2147483647)/2147483647);
 for(const patch of E.treePatches){const xs=patch.polygon.map(p=>p[0]),zs=patch.polygon.map(p=>p[1]),x0=Math.min(...xs),z0=Math.min(...zs),dx=Math.max(...xs)-x0,dz=Math.max(...zs)-z0;let count=0;for(let k=0;k<patch.n*30&&count<patch.n;k++){const x=x0+dx*rand(),z=z0+dz*rand();if(!inside(x,z,patch.polygon))continue;points.push({x,z,source:'aerial '+patch.name});count++;}}
 return points.filter(({x,z})=>!onRoad(x,z,.5)&&!onWalk(x,z,.5)&&!E.buildings.some(b=>inside(x,z,b.polygon)&&!(b.holes??[]).some(h=>inside(x,z,h)))&&!campusAccess(E,x,z,.5)).map(({x,z,source},i)=>({x,z,source,s:E.treeScale[0]+(i*37%97)/97*(E.treeScale[1]-E.treeScale[0]),y:ground(x,z),kind:'big',patch:key+'-park'}));}
/** Background exteriors only. Exact map footprints, illustrative facade/roof heights, no interiors/collision. */
export function buildWestBackdrop(ground,karp=null){return buildBackdrop(SITE.west,'west',ground,null,null,karp);} // #575 karp: {glass} = #569's shared neighbour glass
export function buildEastBackdrop(ground,brick,reflectiveGlass){return buildBackdrop(SITE.east,'east',ground,brick,reflectiveGlass);}
export function buildNorthBackdrop(ground,brick){return buildBackdrop(SITE.north,'north',ground,brick);}
/** #1278: a car park's asphalt cut into triangles no longer than `max` m (longest-edge bisection), as flat [x, z] triples. */
function refinedTriangles(ring,max){
 const idx=THREE.ShapeUtils.triangulateShape(ring.map(([x,z])=>new THREE.Vector2(x,z)),[]),stack=idx.map(t=>t.map(i=>[ring[i][0],ring[i][1]])),out=[];
 while(stack.length){const t=stack.pop();let li=0,ll=0;for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],l=Math.hypot(a[0]-b[0],a[1]-b[1]);if(l>ll){ll=l;li=i;}}
  if(ll<=max){out.push(...t);continue;}
  const a=t[li],b=t[(li+1)%3],c=t[(li+2)%3],m=[(a[0]+b[0])/2,(a[1]+b[1])/2];stack.push([a,m,c],[m,b,c]);}
 return out;
}
const flatGeometry=pos=>{pos=pos.slice();for(let i=0;i<pos.length;i+=9){const ux=pos[i+3]-pos[i],uz=pos[i+5]-pos[i+2],vx=pos[i+6]-pos[i],vz=pos[i+8]-pos[i+2];if(uz*vx-ux*vz<0)for(let k=0;k<3;k++){const t=pos[i+3+k];pos[i+3+k]=pos[i+6+k];pos[i+6+k]=t;}} // front faces up (a double-sided material would flip the normal and darken a back face)
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:pos.length/3},()=>[0,1,0]).flat(),3));return g;};
/** #1278: marked lines / edge strips along [a, b] pairs, `w` m wide, cut every 2.5 m so each follows the sloping ground. */
function ribbon(pairs,w,lift,ground){
 const pos=[];
 for(const[a,b]of pairs){const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1e-6)continue;const n=Math.max(1,Math.ceil(len/2.5)),px=-(b[1]-a[1])/len*w/2,pz=(b[0]-a[0])/len*w/2;
  const v=(t,s)=>{const x=a[0]+(b[0]-a[0])*t+px*s,z=a[1]+(b[1]-a[1])*t+pz*s;return[x,ground(x,z)+lift,z];};
  for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n,p0=v(t0,-1),p1=v(t0,1),p2=v(t1,1),p3=v(t1,-1);pos.push(...p0,...p1,...p2,...p0,...p2,...p3);}}
 return pos.length?flatGeometry(pos):null;
}
/** #1278: the east car parks' extras, merged into the `access` batch (vertex colours): terrain-following asphalt, white stall lines, a flat concrete edge. */
function eastLotParts(ground,access,surfColor){
 const P=PARKING_LOT,lines=[],kerbs=[];
 for(const lot of parkingLots().lots){
  const src=SITE.east.access.find(p=>p.source===lot.source),pos=[];
  for(const[x,z]of refinedTriangles(lot.polygon,P.mesh))pos.push(x,ground(x,z)+P.lift.asphalt,z);
  const asphalt=flatGeometry(pos);asphalt.userData.tint=surfColor(src);access.push(asphalt);
  for(const run of lot.runs){ // the stalls' side lines (one between every two stalls and at both ends) and one back line
   const off=run.road.w/2+PARKING_LOT.bayD/2,mid=j=>[run.a[0]+run.u[0]*j*P.bayW+run.n[0]*off,run.a[1]+run.u[1]*j*P.bayW+run.n[1]*off],hd=P.bayD/2;
   for(let j=run.k0;j<=run.k1+1;j++){const c=mid(j);lines.push([[c[0]-run.n[0]*hd,c[1]-run.n[1]*hd],[c[0]+run.n[0]*hd,c[1]+run.n[1]*hd]]);}
   const c0=mid(run.k0),c1=mid(run.k1+1);lines.push([[c0[0]+run.n[0]*hd,c0[1]+run.n[1]*hd],[c1[0]+run.n[0]*hd,c1[1]+run.n[1]*hd]]);
  }
  const r=lot.polygon;for(let i=0;i<r.length;i++){ // the edge strip, inside the outline, in 2 m pieces; none across a road mouth or by a building
   const a=r[i],b=r[(i+1)%r.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/2)),sgn=(r.reduce((s,q,j)=>{const w=r[(j+1)%r.length];return s+q[0]*w[1]-w[0]*q[1];},0)>0?1:-1);
   const nx=-(b[1]-a[1])/len*sgn,nz=(b[0]-a[0])/len*sgn,at=t=>[a[0]+(b[0]-a[0])*t+nx*P.kerbW/2,a[1]+(b[1]-a[1])*t+nz*P.kerbW/2];
   for(let k=0;k<n;k++){const m=at((k+.5)/n);if(!onEastRoad(m[0],m[1],P.kerbW)&&!onEastBuildingAt(m[0],m[1]))kerbs.push([at(k/n),at((k+1)/n)]);}
  }
 }
 const l=ribbon(lines,P.lineW,P.lift.line,ground),k=ribbon(kerbs,P.kerbW,P.lift.kerb,ground);
 if(l){l.userData.tint=P.lineColor;access.push(l);}
 if(k){k.userData.tint=P.kerbColor;access.push(k);}
}
function buildBackdrop(W,key,ground,brick=null,reflectiveGlass=null,karp=null){
 const group=new THREE.Group();group.name=key+'-backdrop';const parts={facade:[],roof:[],glass:[],access:[],...(brick||W.buildings.some(b=>b.classic)?{modern:[]}: {})},records=[];
 for(const b of W.buildings){const p=b.polygon.slice(0,-1),holes=(b.holes??[]).map(h=>h.slice(0,-1)),height=b.storey??W.storey,heights=p.map(v=>ground(...v)),base=Math.max(...heights),bottom=Math.min(...heights)-.1,eave=base+b.levels*height;const footprint=shape(p);footprint.holes=holes.map(h=>new THREE.Path(h.map(([x,z])=>new THREE.Vector2(x,-z))));const wallParts=b.modern?parts.modern:parts.facade;
  if(b.karp&&karp){parts.karpBrick??=[];parts.karpGlass??=[];parts.karpRoof??=[];records.push({...b,base,bottom,...buildKarpFacade(b,p,base,bottom,height,parts)});continue;}
  if(b.classic){if(reflectiveGlass)parts.schoolGlass??=[];parts.schoolBrick??=[];parts.schoolRoof??=[];const school=buildSchoolFacade(p,base,bottom,eave,parts);records.push({...b,base,bottom,eave,...school});continue;}
  // #576–#581: photo-specific hospital facades share the school's brick, trim, glass and roof batches.
  if(b.campus){if(reflectiveGlass)parts.schoolGlass??=[];parts.schoolBrick??=[];parts.schoolRoof??=[];records.push({...b,base,bottom,...buildCampusFacade(b,p,holes,base,bottom,parts)});continue;}
  const windows=[];
  const body=new THREE.ExtrudeGeometry(footprint,{depth:eave-bottom,bevelEnabled:false,steps:1});body.rotateX(-Math.PI/2).translate(0,bottom,0);const bodyGeo=plain(body),cols=[],col=new THREE.Color();for(let i=0;i<bodyGeo.attributes.position.count;i++){col.setHex(bodyGeo.attributes.position.getY(i)<base-.03?W.plinth:(b.facade??W.facade));cols.push(col.r,col.g,col.b);}bodyGeo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));wallParts.push(bodyGeo);
  // Dominant footprint edge supplies the long roof axis, preserving diagonal building alignment.
  let edge=0,long=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length],len=Math.hypot(q[0]-p[i][0],q[1]-p[i][1]);if(len>long){long=len;edge=i;}}
  const a=p[edge],c=p[(edge+1)%p.length],ux=(c[0]-a[0])/long,uz=(c[1]-a[1])/long,v=q=>-uz*q[0]+ux*q[1],vs=p.map(v),mid=(Math.min(...vs)+Math.max(...vs))/2,half=(Math.max(...vs)-Math.min(...vs))/2,rise=b.roofRise??(b.levels===1?W.annexRise:W.roofRise);
  const top=q=>eave+(b.roof==='flat'?0:rise*Math.max(0,1-Math.abs(v(q)-mid)/half));
  const clip=sign=>{const out=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],va=(v(a)-mid)*sign,vb=(v(b)-mid)*sign;if(va>=0)out.push(a);if((va>=0)!==(vb>=0)){const t=va/(va-vb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;};
  if(b.roof==='flat'){const g=new THREE.ShapeGeometry(footprint);g.rotateX(-Math.PI/2).translate(0,eave,0);parts.roof.push(plain(g));}else for(const sign of [-1,1]){const poly=clip(sign),ps=[],contour=poly.map(q=>new THREE.Vector2(q[0],q[1]));for(const tri of THREE.ShapeUtils.triangulateShape(contour,[]))for(const i of tri)ps.push(poly[i][0],top(poly[i]),poly[i][1]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.computeVertexNormals();parts.roof.push(g);}
  for(const [ring,hole]of [[p,false],...holes.map(h=>[h,true])])for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length];const gable=strip(a,c,eave,[top(a),top(c)]);gable.userData.tint=b.facade??W.facade;wallParts.push(gable);
   const dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);
   const orientation=(hole?-1:1)*Math.sign(ring.reduce((sum,q,j)=>{const r=ring[(j+1)%ring.length];return sum+q[0]*r[1]-r[0]*q[1];},0));
   const nx=orientation*dz/len,nz=-orientation*dx/len; // A double-sided decal avoids assuming footprint winding from map data.
   if(len<W.bay)continue;
   for(let k=1;k*W.bay+W.window[0]/2+W.frame<len;k++)for(let floor=0;floor<b.levels;floor++){
    const x=a[0]+dx/len*k*W.bay,z=a[1]+dz/len*k*W.bay,y=base+floor*height+W.sill;
    const frame=plain(new THREE.PlaneGeometry(W.window[0]+W.frame*2,W.window[1]+W.frame*2).rotateY(Math.atan2(nx,nz)).translate(x+nx*.015,y+W.window[1]/2,z+nz*.015));frame.userData.tint=b.frameColor??0xe3e0d6;(brick?parts.glass:parts.facade).push(frame);
    const geo=new THREE.PlaneGeometry(...W.window);geo.rotateY(Math.atan2(nx,nz)).translate(x+nx*.02,y+W.window[1]/2,z+nz*.02);parts.glass.push(plain(geo));windows.push({x:x+nx*.02,y:y+W.window[1]/2,z:z+nz*.02,n:[nx,nz],width:W.window[0],height:W.window[1]});
   }
  }
  records.push({...b,base,bottom,eave,ridge:eave+rise,windows});
 }
 for(const p of [...W.paths,...W.access]){
  const surfColor=p.color??(p.surface==='asphalt'?0x5f6164:p.surface==='gravel'?0xb5ac90:0xa7a397);
  if(p.path){const s=plain(pathStrip(p,w=>-w/2,w=>w/2,W.pathLift,ground));s.userData.tint=surfColor;parts.access.push(s);}
  else if(key==='east'&&p.capacity&&parkingLots().lots.some(l=>l.source===p.source))continue; // a car park: drawn below (#1278)
  else{const geo=new THREE.ShapeGeometry(shape(p.polygon));geo.rotateX(-Math.PI/2);const a=geo.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,ground(a.getX(i),a.getZ(i))+W.pathLift);geo.computeVertexNormals();const pl=plain(geo);pl.userData.tint=surfColor;parts.access.push(pl);}
 }
 if(key==='east')eastLotParts(ground,parts.access,p=>p.color??(p.surface==='asphalt'?0x5f6164:p.surface==='gravel'?0xb5ac90:0xa7a397));
 const mats={facade:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.95,side:THREE.DoubleSide}),roof:new THREE.MeshStandardMaterial({color:W.roof,roughness:.85,side:THREE.DoubleSide}),glass:new THREE.MeshStandardMaterial({color:brick?0xffffff:W.glass,vertexColors:!!brick,roughness:.3,metalness:.25,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:DECAL_OFFSET.factor,polygonOffsetUnits:DECAL_OFFSET.units}),access:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide})};
 if(brick)mats.facade.map=brick;
 if(parts.modern){mats.modern=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.95,side:THREE.DoubleSide});}
 if(parts.schoolGlass)mats.schoolGlass=reflectiveGlass;
 if(parts.karpBrick){mats.karpBrick=new THREE.MeshStandardMaterial({map:karpBrickTexture(),roughness:.95,side:THREE.DoubleSide});mats.karpGlass=karp.glass;mats.karpRoof=new THREE.MeshStandardMaterial({color:W.karp.colors.roof,roughness:.9,side:THREE.DoubleSide});registerSnow(mats.karpRoof,SEASON.snow.roof);}
 if(parts.schoolBrick){const maps=schoolTextures();mats.schoolBrick=new THREE.MeshStandardMaterial({map:maps.brick,vertexColors:true,roughness:.95,side:THREE.DoubleSide});mats.schoolRoof=new THREE.MeshStandardMaterial({map:maps.roof,roughness:.65,side:THREE.DoubleSide});registerSnow(mats.schoolRoof,SEASON.snow.roof);}
 registerSnow(mats.roof,SEASON.snow.roof);registerSnow(mats.access,SEASON.snow.paving);
 for(const [k,list]of Object.entries(parts)){if(['facade','modern','schoolBrick','access'].includes(k)||k==='glass'&&brick)for(const g of list)if(!g.attributes.color){const c=new THREE.Color(g.userData.tint??(k==='access'?0xa7a397:k==='glass'?W.glass:k==='schoolBrick'?0xffffff:W.facade)),cols=Array.from({length:g.attributes.position.count},()=>[c.r,c.g,c.b]).flat();g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));}if(!list.length)continue;for(const g of list)if(k==='schoolBrick'||k==='facade'&&brick){const uv=[],a=g.attributes.position,n=g.attributes.normal;for(let i=0;i<a.count;i++)uv.push((Math.abs(n.getX(i))>Math.abs(n.getZ(i))?a.getZ(i):a.getX(i))/2,a.getY(i)/2);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}const mesh=new THREE.Mesh(mergeGeometries(list),mats[k]);mesh.name=key+'-'+k;mesh.receiveShadow=true;mesh.castShadow=k!=='access'&&k!=='schoolGlass'&&k!=='karpGlass';group.add(mesh);list.forEach(g=>g.dispose());}
 const clocks=records.filter(b=>b.clock).map(b=>new TowerClock(b.clock));
 for(const clock of clocks)group.add(clock.object);
 group.userData.clocks=clocks;group.userData.updateClocks=hour=>{for(const clock of clocks)clock.update(hour);};
 group.userData.buildings=records;return group;
}
