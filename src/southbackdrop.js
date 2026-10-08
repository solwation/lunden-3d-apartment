import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, SEASON, COLORS } from './config.js';
import { pathStrip } from './roads.js';
import { registerTrees, registerSnow, registerSeasonal } from './seasons.js';
const S=SITE.south;
const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const shape=b=>{const s=new THREE.Shape(b.polygon.slice(0,-1).map(([x,z])=>new THREE.Vector2(x,-z)));s.holes=(b.holes??[]).map(p=>new THREE.Path(p.slice(0,-1).map(([x,z])=>new THREE.Vector2(x,-z))));return s;};
const plain=g=>{g=g.index?g.toNonIndexed():g;g.deleteAttribute('uv');return g;};
const tint=(g,hex)=>{g=plain(g);const c=new THREE.Color(hex),a=[];for(let i=0;i<g.attributes.position.count;i++)a.push(c.r,c.g,c.b);g.setAttribute('color',new THREE.Float32BufferAttribute(a,3));return g;};
const geo=points=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.computeVertexNormals();return g;};
// Clip each original footprint triangle, so concave wings/courtyard holes never acquire a bridging roof.
const clip=(poly,f)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=f(a),fb=f(b);if(fa>=-1e-8)out.push(a);if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}return out;};
const onAccess=(x,z)=>S.paths.some(p=>p.path.slice(1).some(([c,d],i)=>{const[a,b]=p.path[i],dx=c-a,dz=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a-t*dx,z-b-t*dz)<p.w/2+.5;}));
export function buildSouthBackdrop(ground){
 const group=new THREE.Group();group.name='south-backdrop';const parts={facade:[],roof:[],glass:[],land:[]},records=[];
 const farGround=(x,z)=>z<=260?ground(x,z):-3.01; // inherited park level; no southern elevation survey
 for(const b of S.buildings){const foot=shape(b),p=b.polygon.slice(0,-1),base=Math.max(...p.map(q=>farGround(...q))),bottom=Math.min(...p.map(q=>farGround(...q)))-.1,eave=base+b.levels*S.storey;
  parts.facade.push(tint(new THREE.ExtrudeGeometry(foot,{depth:eave-bottom,bevelEnabled:false}).rotateX(-Math.PI/2).translate(0,bottom,0),b.facade));
  let edge=0,len=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length],d=Math.hypot(q[0]-p[i][0],q[1]-p[i][1]);if(d>len){len=d;edge=i;}}
  const a=p[edge],c=p[(edge+1)%p.length],ux=(c[0]-a[0])/len,uz=(c[1]-a[1])/len,u=q=>ux*q[0]+uz*q[1],v=q=>-uz*q[0]+ux*q[1],us=p.map(u),vs=p.map(v),u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs),half=(v1-v0)/2;
  const planes=[q=>(v(q)-v0)/half,q=>(v1-v(q))/half];if(b.roof==='hipped')planes.push(q=>(u(q)-u0)/half,q=>(u1-u(q))/half);
  const roofHeight=q=>eave+b.rise*Math.max(0,Math.min(...planes.map(f=>f(q))));
  const flat=new THREE.ShapeGeometry(foot),pos=flat.attributes.position,index=flat.index.array;
  for(let i=0;i<index.length;i+=3){const tri=Array.from(index.slice(i,i+3),j=>[pos.getX(j),-pos.getY(j)]);for(let j=0;j<planes.length;j++){let poly=tri;for(let k=0;k<planes.length&&poly.length;k++)if(j!==k)poly=clip(poly,q=>planes[k](q)-planes[j](q));if(poly.length<3)continue;for(let k=1;k<poly.length-1;k++)parts.roof.push(geo([poly[0],poly[k],poly[k+1]].map(q=>[q[0],roofHeight(q),q[1]])));}}
  flat.dispose();
  // Far facades: only landmark windows, no individual trims, handles, interiors or small shadows.
  for(const [ring,hole]of [[p,false],...(b.holes??[]).map(h=>[h.slice(0,-1),true])]){const sign=(hole?-1:1)*Math.sign(ring.reduce((s,q,i)=>{const r=ring[(i+1)%ring.length];return s+q[0]*r[1]-r[0]*q[1]},0));for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length],dx=c[0]-a[0],dz=c[1]-a[1],d=Math.hypot(dx,dz);parts.facade.push(tint(geo([[a[0],eave,a[1]],[c[0],eave,c[1]],[c[0],roofHeight(c),c[1]],[a[0],eave,a[1]],[c[0],roofHeight(c),c[1]],[a[0],roofHeight(a),a[1]]]),b.facade));
    if(b.levels<4)continue;const nx=sign*dz/d,nz=-sign*dx/d;for(let k=1;k*S.bay+S.window[0]/2<d;k++)for(let floor=0;floor<b.levels;floor++)parts.glass.push(plain(new THREE.PlaneGeometry(...S.window).rotateY(Math.atan2(nx,nz)).translate(a[0]+dx/d*k*S.bay+nx*.025,base+floor*S.storey+S.sill+S.window[1]/2,a[1]+dz/d*k*S.bay+nz*.025)));
  }}records.push({...b,base,bottom,eave});
 }
 // Continuation overlaps only the old outer boundary. Fog fully covers its outer edges from every accessible camera.
 const G=S.ground;parts.land.push(tint(new THREE.PlaneGeometry(G.x1-G.x0,G.z1-260).rotateX(-Math.PI/2).translate((G.x0+G.x1)/2,-3.01,(G.z1+260)/2),COLORS.grass));
 for(const [x0,x1]of[[G.x0,SITE.backgroundGround.x0],[SITE.backgroundGround.x1,G.x1]])parts.land.push(tint(new THREE.PlaneGeometry(x1-x0,260-SITE.backgroundGround.z0).rotateX(-Math.PI/2).translate((x0+x1)/2,-3.01,(260+SITE.backgroundGround.z0)/2),COLORS.grass));
 for(const f of S.fields){const g=new THREE.ShapeGeometry(shape(f)).rotateX(-Math.PI/2),a=g.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,farGround(a.getX(i),a.getZ(i))+.018);g.computeVertexNormals();parts.land.push(tint(g,f.color));}
 for(const p of S.paths)parts.land.push(tint(pathStrip(p,w=>-w/2,w=>w/2,.025,farGround),0xa7a397));
 const mats={facade:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.95,side:THREE.DoubleSide}),roof:new THREE.MeshStandardMaterial({color:S.roofColor,roughness:.95,side:THREE.DoubleSide}),glass:new THREE.MeshStandardMaterial({color:0x35444d,roughness:.7,side:THREE.DoubleSide}),land:new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide})};
 registerSnow(mats.roof,SEASON.snow.roof);registerSnow(mats.land,SEASON.snow.ground);
 registerSeasonal(month=>{const colored=!SEASON.snowMonths.includes(month);if(mats.land.vertexColors!==colored){mats.land.vertexColors=colored;mats.land.needsUpdate=true;}});
 for(const[k,list]of Object.entries(parts)){if(!list.length)continue;const m=new THREE.Mesh(mergeGeometries(list),mats[k]);m.name='south-'+k;group.add(m);list.forEach(g=>g.dispose());}
 let seed=536;const rand=()=>((seed=seed*16807%2147483647)/2147483647),trees=[];
 for(const f of S.forests){const xs=f.polygon.map(q=>q[0]),zs=f.polygon.map(q=>q[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);let n=0;for(let i=0;i<f.n*30&&n<f.n;i++){const x=x0+rand()*(x1-x0),z=z0+rand()*(z1-z0);if(!inside(x,z,f.polygon)||onAccess(x,z)||S.buildings.some(b=>inside(x,z,b.polygon))||S.fields.some(b=>inside(x,z,b.polygon)))continue;trees.push({x,z,y:farGround(x,z),source:f.source,h:S.treeHeight[0]+rand()*(S.treeHeight[1]-S.treeHeight[0]),r:S.treeRadius[0]+rand()*(S.treeRadius[1]-S.treeRadius[0])});n++;}}
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.35,1,4).translate(0,.5,0),new THREE.MeshStandardMaterial({color:0x5a4636,roughness:1}),trees.length),crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),trees.length),seeds=[],m=new THREE.Matrix4(),q=new THREE.Quaternion();
 trees.forEach((t,i)=>{trunks.setMatrixAt(i,m.compose(new THREE.Vector3(t.x,t.y,t.z),q,new THREE.Vector3(1,t.h*.65,1)));const sd={pos:new THREE.Vector3(t.x,t.y+t.h*.7,t.z),rot:q.clone(),scale:new THREE.Vector3(t.r,t.h*.4,t.r),r1:rand(),r2:rand(),r3:rand(),r4:1};crowns.setMatrixAt(i,m.compose(sd.pos,sd.rot,sd.scale));crowns.setColorAt(i,new THREE.Color(0x718a49));seeds.push(sd)});registerTrees(crowns,seeds);trunks.name='south-trunks';crowns.name='south-crowns';group.add(trunks,crowns);group.userData={buildings:records,trees};return group;
}
